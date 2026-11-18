// FILE: src/main/services/engine/provision.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { AppException } from '../../../shared/types';
import type { CreateServerInput, ImportJarInput, ServerConfig, ServerSoftware } from '../../../shared/types';
import { cleanDescription, decodeMotd, encodeMotd } from '../../../shared/mcText';
import type { ContentService, ServiceDeps } from '../../../shared/services';
import { DEFAULT_PORT, DEFAULT_RAM_MB, DEFAULT_STORAGE_LIMIT_MB, MOD_KIND_BY_SOFTWARE, SERVER_META_DIR } from '../../../shared/constants';
import { suggestFlags } from './flags';
import { isPortFree, suggestPort, usedByApp } from './ports';
import type { ProcessManager } from './process';
import { parseProperties, writeProperties, syncPortToFiles } from './properties';
import { totalRamMb, validateIpHost, validateJavaOverride, validateName, validatePortNumber, validateRam, validateStorageLimit } from './settings';
import type { DiskUsageCache } from './stats';
import { isModKind, isServerSoftware } from './store';
import type { ServerStore } from './store';
import { clone, isInside, pathExists, readTextIfExists, rmWithRetry, toAppException } from './util';

export interface EngineCtx {
  deps: ServiceDeps & { content: ContentService };
  store: ServerStore;
  pm: ProcessManager;
  disk: DiskUsageCache;
}

const EULA_TEXT = '#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true\n';
const defaultPortFor = (software: ServerSoftware): number => (software === 'velocity' ? 25577 : DEFAULT_PORT);

function normOptional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Validates a description coming from the UI. Empty string when not given. */
export function validateDescription(v: unknown): string {
  if (v === undefined || v === null) return '';
  const d = cleanDescription(v);
  if (d === null) throw new AppException('INVALID_INPUT', 'Invalid description');
  return d;
}

export async function writeEula(folder: string): Promise<void> {
  const file = path.join(folder, 'eula.txt');
  const old = await readTextIfExists(file);
  if (old !== null && /^\s*eula\s*=/im.test(old)) {
    await fs.writeFile(file, old.replace(/^\s*eula\s*=.*$/im, 'eula=true'));
  } else {
    await fs.writeFile(file, old === null ? EULA_TEXT : `${old.trimEnd()}\neula=true\n`);
  }
}

// ---------- create ----------
export async function createServer(ctx: EngineCtx, input: CreateServerInput): Promise<ServerConfig> {
  const { store, deps } = ctx;
  const content = deps.content;
  const name = validateName(input.name);
  const description = validateDescription(input.description);
  if (!isServerSoftware(input.software)) throw new AppException('INVALID_INPUT', 'Unknown software');
  const software = input.software;
  const velocity = software === 'velocity';
  const s = input.settings;
  if (!s) throw new AppException('INVALID_INPUT');
  const ramMb = validateRam(s.ramMb);
  const storageLimitMb = s.storageLimitMb === undefined ? DEFAULT_STORAGE_LIMIT_MB : validateStorageLimit(s.storageLimitMb);
  const mcVersion = normOptional(input.mcVersion);
  const build = normOptional(input.build);
  const override = validateJavaOverride(s.javaMajorOverride);
  if (software === 'custom' && mcVersion === null && override === null) {
    throw new AppException('INVALID_INPUT', 'Java version is required for a custom jar without a Minecraft version');
  }
  let major: number;
  if (override !== null) {
    if (mcVersion !== null && override < (await content.getDefaultJava(mcVersion))) throw new AppException('INVALID_INPUT', 'Java version is too old');
    major = override;
  } else major = await content.getDefaultJava(mcVersion);

  let port: number;
  if (s.port === undefined || s.port === null) port = await suggestPort(store.all(), defaultPortFor(software));
  else {
    port = validatePortNumber(s.port);
    if (!(await isPortFree(store.all(), port))) throw new AppException('PORT_IN_USE', 'Port is in use', { port });
  }

  let customSrc: string | null = null;
  if (software === 'custom') {
    customSrc = input.customJarPath;
    if (typeof customSrc !== 'string' || !/\.jar$/i.test(customSrc) || !(await fs.stat(customSrc).then((st) => st.isFile(), () => false))) {
      throw new AppException('INVALID_INPUT', 'A valid .jar file is required');
    }
  }

  const id = store.newId(name);
  const folder = store.folderOf(id);
  const taskId = `create-${id}`;
  try {
    await fs.mkdir(folder, { recursive: true });
    let jarFile = 'server.jar';
    let customJarName: string | null = null;
    if (customSrc !== null) {
      jarFile = path.basename(customSrc);
      customJarName = jarFile.replace(/\.jar$/i, '');
      await fs.copyFile(customSrc, path.join(folder, jarFile));
    } else {
      await content.downloadServerJar({ software, mcVersion, build, destPath: path.join(folder, 'server.jar'), taskId });
    }
    await content.ensureJava(major, taskId);
    if (input.eulaAccepted) await fs.writeFile(path.join(folder, 'eula.txt'), EULA_TEXT);
    if (!velocity) {
      const motdLine = description === '' ? '' : `motd=${encodeMotd(description)}\n`;
      await fs.writeFile(path.join(folder, 'server.properties'), `server-port=${port}\n${motdLine}`);
    }
    const cfg: ServerConfig = {
      id, name, description, software,
      modKind: isModKind(input.modKind) ? input.modKind : MOD_KIND_BY_SOFTWARE[software],
      mcVersion, build, customJarName, folder,
      createdAt: Date.now(),
      settings: {
        ramMb, storageLimitMb, port,
        autoStart: s.autoStart === true,
        autoRestartOnCrash: s.autoRestartOnCrash === true,
        javaMajorOverride: override,
        customIpHost: validateIpHost(s.customIpHost),
      },
      start: { jarFile, flags: suggestFlags(ramMb, major) },
    };
    await store.save(cfg);
    deps.emit('servers:changed', null);
    return clone(cfg);
  } catch (e) {
    await rmWithRetry(folder).catch((err) => deps.log.error('cleanup after failed create', err));
    throw toAppException(e);
  }
}

// ---------- remove ----------
export function removeServer(ctx: EngineCtx, id: string, deleteFiles: boolean): Promise<void> {
  ctx.store.require(id);
  return ctx.pm.withLock(id, async () => {
    const cfg = ctx.store.require(id);
    const rt = ctx.pm.peek(id);
    if (rt && ctx.pm.isAlive(rt)) throw new AppException('SERVER_RUNNING');
    if (deleteFiles) await rmWithRetry(cfg.folder);
    else await rmWithRetry(path.join(cfg.folder, SERVER_META_DIR));
    ctx.store.forget(id);
    ctx.pm.dropRuntime(id);
    ctx.disk.drop(id);
    ctx.deps.emit('servers:changed', null);
  });
}

// ---------- duplicate ----------
export function duplicateServer(ctx: EngineCtx, id: string, newName: string): Promise<ServerConfig> {
  ctx.store.require(id);
  return ctx.pm.withLock(id, async () => {
    const src = ctx.store.require(id);
    const rt = ctx.pm.peek(id);
    if (rt && ctx.pm.isAlive(rt)) throw new AppException('SERVER_RUNNING');
    const name = validateName(newName);
    const newId = ctx.store.newId(name);
    const dest = ctx.store.folderOf(newId);
    try {
      await fs.cp(src.folder, dest, { recursive: true, filter: copyFilter(src.folder) });
      const port = await suggestPort(ctx.store.all(), defaultPortFor(src.software));
      const cfg: ServerConfig = { ...clone(src), id: newId, name, folder: dest, createdAt: Date.now(), settings: { ...src.settings, port } };
      await ctx.store.save(cfg);
      await syncPortToFiles(dest, port, cfg.software === 'velocity');
      ctx.deps.emit('servers:changed', null);
      return clone(cfg);
    } catch (e) {
      await rmWithRetry(dest).catch(() => undefined);
      throw toAppException(e);
    }
  });
}

/** Skip logs, session.lock and the run marker when copying a server folder. */
function copyFilter(root: string): (src: string) => boolean {
  return (src: string): boolean => {
    const rel = path.relative(root, src);
    if (rel === '') return true;
    if (rel === 'logs' || rel.startsWith(`logs${path.sep}`)) return false;
    if (path.basename(src) === 'session.lock') return false;
    return rel !== path.join(SERVER_META_DIR, 'run.json');
  };
}

// ---------- import ----------
export async function importServer(ctx: EngineCtx, folderPath: string, nameIn: string, softwareIn: ServerSoftware, mcVersionIn: string | null): Promise<ServerConfig> {
  const { store, deps } = ctx;
  const name = validateName(nameIn);
  if (!isServerSoftware(softwareIn)) throw new AppException('INVALID_INPUT', 'Unknown software');
  if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) throw new AppException('INVALID_INPUT', 'Folder path must be absolute');
  let real: string;
  try {
    real = await fs.realpath(folderPath);
    if (!(await fs.stat(real)).isDirectory()) throw new AppException('INVALID_INPUT', 'Not a folder');
  } catch (e) { throw e instanceof AppException ? e : new AppException('NOT_FOUND', 'Folder not found'); }
  const serversReal = await fs.realpath(store.serversDir);
  if (real === serversReal || isInside(real, serversReal)) throw new AppException('INVALID_INPUT', 'Cannot import a folder that contains the servers folder');

  const rel = path.relative(serversReal, real);
  const directChild = isInside(serversReal, real) && !rel.includes(path.sep);
  let id: string;
  let copied = false;
  if (directChild && /^[a-z0-9-]{3,40}$/.test(path.basename(real)) && !store.find(path.basename(real))) {
    id = path.basename(real);
  } else if (directChild && store.find(path.basename(real))) {
    throw new AppException('INVALID_INPUT', 'This server is already in the list');
  } else if (directChild) {
    id = store.newId(name);
    await fs.rename(real, store.folderOf(id));
  } else {
    id = store.newId(name);
    try { await fs.cp(real, store.folderOf(id), { recursive: true, filter: copyFilter(real) }); copied = true; } catch (e) {
      await rmWithRetry(store.folderOf(id)).catch(() => undefined);
      throw toAppException(e);
    }
  }
  const folder = store.folderOf(id);
  try {
    let jarFile: string;
    if (await pathExists(path.join(folder, 'server.jar'))) jarFile = 'server.jar';
    else {
      const jars = (await fs.readdir(folder, { withFileTypes: true })).filter((e) => e.isFile() && /\.jar$/i.test(e.name));
      if (jars.length !== 1) throw new AppException('INVALID_INPUT', 'Could not find the server jar');
      jarFile = jars[0].name;
    }
    const velocity = softwareIn === 'velocity';
    const text = velocity ? null : await readTextIfExists(path.join(folder, 'server.properties'));
    const fromFile = text === null ? NaN : Number.parseInt(parseProperties(text)['server-port'] ?? '', 10);
    const port = Number.isInteger(fromFile) && fromFile >= 1024 && fromFile <= 65535 && !usedByApp(store.all(), fromFile)
      ? fromFile
      : await suggestPort(store.all(), defaultPortFor(softwareIn));
    const mcVersion = normOptional(mcVersionIn);
    const major = mcVersion === null ? 21 : await deps.content.getDefaultJava(mcVersion);
    const ramMb = Math.max(512, Math.min(DEFAULT_RAM_MB, Math.floor(totalRamMb() / 2)));
    const cfg: ServerConfig = {
      id, name, description: velocity || text === null ? '' : decodeMotd(parseProperties(text)['motd'] ?? ''), software: softwareIn, modKind: MOD_KIND_BY_SOFTWARE[softwareIn], mcVersion, build: null,
      customJarName: softwareIn === 'custom' ? jarFile.replace(/\.jar$/i, '') : null,
      folder, createdAt: Date.now(),
      settings: { ramMb, storageLimitMb: null, autoStart: false, autoRestartOnCrash: false, port, javaMajorOverride: mcVersion === null ? 21 : null, customIpHost: null },
      start: { jarFile, flags: suggestFlags(ramMb, major) },
    };
    await fs.rm(path.join(folder, SERVER_META_DIR, 'run.json'), { force: true });
    await store.save(cfg);
    if (text !== null && fromFile !== port) await writeProperties(folder, { 'server-port': String(port) });
    deps.emit('servers:changed', null);
    return clone(cfg);
  } catch (e) {
    if (copied) await rmWithRetry(folder).catch(() => undefined); // never delete the user's own folder
    throw toAppException(e);
  }
}

// ---------- import a single .jar ----------
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export async function importJar(ctx: EngineCtx, input: ImportJarInput): Promise<ServerConfig> {
  const { store, deps } = ctx;
  if (typeof input !== 'object' || input === null) throw new AppException('INVALID_INPUT');
  const name = validateName(input.name);
  const description = validateDescription(input.description);
  if (!isServerSoftware(input.software)) throw new AppException('INVALID_INPUT', 'Unknown software');
  const software = input.software;
  const velocity = software === 'velocity';
  const src = input.jarPath;
  if (typeof src !== 'string' || !path.isAbsolute(src) || !/\.jar$/i.test(src)) throw new AppException('INVALID_INPUT', 'A valid .jar file is required');
  const head = Buffer.alloc(4);
  try {
    const handle = await fs.open(src, 'r');
    try {
      const st = await handle.stat();
      if (!st.isFile()) throw new AppException('INVALID_INPUT', 'A valid .jar file is required');
      await handle.read(head, 0, 4, 0);
    } finally { await handle.close(); }
  } catch (e) { throw e instanceof AppException ? e : new AppException('NOT_FOUND', 'Jar file not found'); }
  if (!ZIP_MAGIC.every((b, i) => head[i] === b)) throw new AppException('INVALID_INPUT', 'This file is not a valid .jar');

  const mcVersion = normOptional(input.mcVersion);
  const build = normOptional(input.build);
  const major = mcVersion === null ? 21 : await deps.content.getDefaultJava(mcVersion);
  const ramMb = Math.max(512, Math.min(DEFAULT_RAM_MB, Math.floor(totalRamMb() / 2)));
  const port = await suggestPort(store.all(), defaultPortFor(software));

  const id = store.newId(name);
  const folder = store.folderOf(id);
  try {
    await fs.mkdir(folder, { recursive: true });
    const baseName = path.basename(src);
    const jarFile = software === 'custom' ? baseName : 'server.jar';
    await fs.copyFile(src, path.join(folder, jarFile));
    if (!velocity) {
      const motdLine = description === '' ? '' : `motd=${encodeMotd(description)}\n`;
      await fs.writeFile(path.join(folder, 'server.properties'), `server-port=${port}\n${motdLine}`);
    }
    const cfg: ServerConfig = {
      id, name, description, software, modKind: MOD_KIND_BY_SOFTWARE[software], mcVersion, build,
      customJarName: software === 'custom' ? jarFile.replace(/\.jar$/i, '') : null,
      folder, createdAt: Date.now(),
      settings: { ramMb, storageLimitMb: null, autoStart: false, autoRestartOnCrash: false, port, javaMajorOverride: mcVersion === null ? 21 : null, customIpHost: null },
      start: { jarFile, flags: suggestFlags(ramMb, major) },
    };
    await store.save(cfg);
    deps.emit('servers:changed', null);
    return clone(cfg);
  } catch (e) {
    await rmWithRetry(folder).catch((err) => deps.log.error('cleanup after failed jar import', err));
    throw toAppException(e);
  }
}
