import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import { AppException } from '@shared/types';
import type { FileContent, FileEntry } from '@shared/types';
import { SERVER_META_DIR } from '@shared/constants';
import type { FilesService, ServiceDeps } from '@shared/services';

type FilesDeps = ServiceDeps & { getServerFolder(id: string): string };

const SERVER_ID_PATTERN = /^[a-z0-9-]{3,40}$/;
const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_WRITE_BYTES = 5 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8 * 1024;
const MAX_NAME_LENGTH = 200;
const STAT_BATCH_SIZE = 64;
const INVALID_NAME_CHARS = /[<>:"|?*\u0000-\u001f/\\]/;
const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';
const META_DIR_KEY = SERVER_META_DIR.toLowerCase();
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

interface ServerContext {
  root: string;
  realRoot: string;
}

function errnoCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function nameKey(name: string): string {
  return CASE_INSENSITIVE_FS ? name.toLowerCase() : name;
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`);
}

/** Returns true when the name is acceptable for a new file or folder. Exported for tests. */
export function isValidEntryName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  if (name.trim() === '') return false;
  if (INVALID_NAME_CHARS.test(name)) return false;
  if (name.endsWith('.') || name.endsWith(' ')) return false;
  const stem = name.split('.')[0].trim().toLowerCase();
  if (RESERVED_NAMES.has(stem)) return false;
  return true;
}

function assertValidName(name: string): void {
  if (!isValidEntryName(name)) {
    throw new AppException('INVALID_INPUT', 'Invalid file name', { name: typeof name === 'string' ? name : '' });
  }
}

/** Normalizes a renderer-supplied relative path. Returns '' for the server root. */
export function normalizeRelPath(relPath: string): string {
  if (typeof relPath !== 'string') throw new AppException('INVALID_INPUT', 'Path must be a string');
  if (relPath.includes('\u0000')) throw new AppException('INVALID_INPUT', 'Invalid path');
  const unified = relPath.replace(/\\/g, '/');
  if (unified.startsWith('/')) throw new AppException('PATH_OUTSIDE_SERVER', 'Absolute path not allowed');
  if (unified.includes(':')) throw new AppException('PATH_OUTSIDE_SERVER', 'Drive or stream syntax not allowed');
  const parts: string[] = [];
  for (const part of unified.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..' || /^[. ]+$/.test(part)) throw new AppException('PATH_OUTSIDE_SERVER', 'Parent path not allowed');
    parts.push(part);
  }
  if (parts.length > 0 && parts[0].toLowerCase() === META_DIR_KEY) {
    throw new AppException('PATH_OUTSIDE_SERVER', 'Server metadata folder is not accessible');
  }
  return parts.join('/');
}

function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function parentRel(rel: string): string {
  const index = rel.lastIndexOf('/');
  return index === -1 ? '' : rel.slice(0, index);
}

function baseName(rel: string): string {
  const index = rel.lastIndexOf('/');
  return index === -1 ? rel : rel.slice(index + 1);
}

export function createFilesService(deps: FilesDeps): FilesService {
  const { log } = deps;

  // ---------- error handling ----------

  function mapError(error: unknown): never {
    if (error instanceof AppException) throw error;
    const code = errnoCode(error);
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new AppException('SERVER_RUNNING', 'File is locked, the server may be running');
    }
    if (code === 'ENOENT') throw new AppException('NOT_FOUND', 'File or folder not found');
    log.error('[files] unexpected error', error);
    throw new AppException('UNKNOWN', error instanceof Error ? error.message : 'UNKNOWN');
  }

  function wrap<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return async (...args: A) => {
      try {
        return await fn(...args);
      } catch (error) {
        return mapError(error);
      }
    };
  }

  // ---------- path safety ----------

  async function getContext(serverId: string): Promise<ServerContext> {
    if (typeof serverId !== 'string' || !SERVER_ID_PATTERN.test(serverId)) {
      throw new AppException('INVALID_INPUT', 'Invalid server id');
    }
    let folder: string;
    try {
      folder = deps.getServerFolder(serverId);
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException('NOT_FOUND', 'Server not found');
    }
    if (!folder) throw new AppException('NOT_FOUND', 'Server not found');
    const root = path.resolve(folder);
    let realRoot: string;
    try {
      realRoot = await fsp.realpath(root);
      const stat = await fsp.stat(realRoot);
      if (!stat.isDirectory()) throw new AppException('NOT_FOUND', 'Server folder not found');
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException('NOT_FOUND', 'Server folder not found');
    }
    return { root, realRoot };
  }

  /** realpath of the deepest existing ancestor, with the not-yet-existing tail appended. */
  async function realpathDeepest(target: string): Promise<string> {
    const tail: string[] = [];
    let current = target;
    for (;;) {
      try {
        const real = await fsp.realpath(current);
        return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
      } catch (error) {
        const code = errnoCode(error);
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      }
      // A dangling symlink looks like "missing" to realpath, so refuse it explicitly.
      try {
        await fsp.lstat(current);
        throw new AppException('PATH_OUTSIDE_SERVER', 'Broken link is not allowed');
      } catch (error) {
        if (error instanceof AppException) throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) throw new AppException('NOT_FOUND', 'Path not found');
      tail.push(path.basename(current));
      current = parent;
    }
  }

  /**
   * Resolves a relative path to an absolute one and verifies (via realpath) that it stays inside the server folder.
   * followLast=false checks only the parent folder, so links themselves can be renamed, moved or deleted safely.
   */
  async function resolveSafe(ctx: ServerContext, rel: string, followLast: boolean): Promise<string> {
    const abs = path.resolve(ctx.root, ...(rel ? rel.split('/') : []));
    if (!isInside(ctx.root, abs)) throw new AppException('PATH_OUTSIDE_SERVER', 'Path outside server folder');
    const toCheck = followLast || rel === '' ? abs : path.dirname(abs);
    const real = await realpathDeepest(toCheck);
    if (!isInside(ctx.realRoot, real)) throw new AppException('PATH_OUTSIDE_SERVER', 'Path outside server folder');
    return abs;
  }

  async function statOrNull(abs: string): Promise<fs.Stats | null> {
    try {
      return await fsp.stat(abs);
    } catch (error) {
      const code = errnoCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
  }

  async function lstatOrNull(abs: string): Promise<fs.Stats | null> {
    try {
      return await fsp.lstat(abs);
    } catch (error) {
      const code = errnoCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
  }

  async function requireDirectory(ctx: ServerContext, rel: string): Promise<string> {
    const abs = await resolveSafe(ctx, rel, true);
    const stat = await statOrNull(abs);
    if (!stat) throw new AppException('NOT_FOUND', 'Folder not found', { name: rel });
    if (!stat.isDirectory()) throw new AppException('INVALID_INPUT', 'Not a folder', { name: rel });
    return abs;
  }

  // ---------- list ----------

  async function statEntry(abs: string): Promise<{ isDir: boolean; sizeBytes: number; modifiedMs: number } | null> {
    try {
      const stat = await fsp.stat(abs);
      return { isDir: stat.isDirectory(), sizeBytes: stat.isDirectory() ? 0 : stat.size, modifiedMs: stat.mtimeMs };
    } catch {
      try {
        const stat = await fsp.lstat(abs);
        return { isDir: false, sizeBytes: stat.size, modifiedMs: stat.mtimeMs };
      } catch {
        return null;
      }
    }
  }

  const list = wrap(async (serverId: string, relDir: string): Promise<FileEntry[]> => {
    const ctx = await getContext(serverId);
    const rel = normalizeRelPath(relDir);
    const abs = await requireDirectory(ctx, rel);
    const names = await fsp.readdir(abs);
    const visible = names.filter((name) => !(rel === '' && name.toLowerCase() === META_DIR_KEY));
    const entries: FileEntry[] = [];
    for (let i = 0; i < visible.length; i += STAT_BATCH_SIZE) {
      const batch = visible.slice(i, i + STAT_BATCH_SIZE);
      const stats = await Promise.all(batch.map((name) => statEntry(path.join(abs, name))));
      batch.forEach((name, index) => {
        const info = stats[index];
        if (!info) return;
        entries.push({ name, relPath: joinRel(rel, name), isDir: info.isDir, sizeBytes: info.sizeBytes, modifiedMs: info.modifiedMs });
      });
    }
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    return entries;
  });

  // ---------- read / write ----------

  const readText = wrap(async (serverId: string, relPath: string): Promise<FileContent> => {
    const ctx = await getContext(serverId);
    const rel = normalizeRelPath(relPath);
    if (rel === '') throw new AppException('INVALID_INPUT', 'Not a file');
    const abs = await resolveSafe(ctx, rel, true);
    const stat = await statOrNull(abs);
    if (!stat) throw new AppException('NOT_FOUND', 'File not found', { name: baseName(rel) });
    if (!stat.isFile()) throw new AppException('INVALID_INPUT', 'Not a file', { name: baseName(rel) });

    const handle = await fsp.open(abs, 'r');
    try {
      const sniffLength = Math.min(stat.size, BINARY_SNIFF_BYTES);
      const sniff = Buffer.alloc(sniffLength);
      if (sniffLength > 0) await handle.read(sniff, 0, sniffLength, 0);
      const binary = sniff.includes(0);
      if (stat.size > MAX_READ_BYTES) return { content: '', binary, tooLarge: true };
      if (binary) return { content: '', binary: true, tooLarge: false };
      const buffer = await handle.readFile();
      let text = buffer.toString('utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      return { content: text, binary: false, tooLarge: false };
    } finally {
      await handle.close();
    }
  });

  const writeText = wrap(async (serverId: string, relPath: string, content: string): Promise<void> => {
    const ctx = await getContext(serverId);
    const rel = normalizeRelPath(relPath);
    if (rel === '') throw new AppException('INVALID_INPUT', 'Not a file');
    if (typeof content !== 'string') throw new AppException('INVALID_INPUT', 'Content must be text');
    if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) {
      throw new AppException('INVALID_INPUT', 'Content is too large', { maxMb: MAX_WRITE_BYTES / (1024 * 1024) });
    }
    assertValidName(baseName(rel));
    const abs = await resolveSafe(ctx, rel, true);
    const parentStat = await statOrNull(path.dirname(abs));
    if (!parentStat || !parentStat.isDirectory()) throw new AppException('NOT_FOUND', 'Folder not found');
    const stat = await statOrNull(abs);
    if (stat && !stat.isFile()) throw new AppException('INVALID_INPUT', 'Not a file', { name: baseName(rel) });
    // If the target is a link to a file inside the server, write to the real file so the link stays intact.
    const writeTarget = stat ? await fsp.realpath(abs) : abs;
    const tmp = path.join(path.dirname(writeTarget), `.${path.basename(writeTarget)}.mcm-${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      await fsp.writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
      if (stat) await fsp.chmod(tmp, stat.mode & 0o777).catch(() => undefined);
      await fsp.rename(tmp, writeTarget);
    } catch (error) {
      await fsp.rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  });

  // ---------- create ----------

  const createFile = wrap(async (serverId: string, relPath: string): Promise<void> => {
    const ctx = await getContext(serverId);
    const rel = normalizeRelPath(relPath);
    if (rel === '') throw new AppException('INVALID_INPUT', 'Invalid file name');
    assertValidName(baseName(rel));
    await requireDirectory(ctx, parentRel(rel));
    const abs = await resolveSafe(ctx, rel, false);
    try {
      await fsp.writeFile(abs, '', { flag: 'wx' });
    } catch (error) {
      if (errnoCode(error) === 'EEXIST') throw new AppException('INVALID_INPUT', 'Already exists', { name: baseName(rel) });
      throw error;
    }
  });

  const createFolder = wrap(async (serverId: string, relPath: string): Promise<void> => {
    const ctx = await getContext(serverId);
    const rel = normalizeRelPath(relPath);
    if (rel === '') throw new AppException('INVALID_INPUT', 'Invalid folder name');
    assertValidName(baseName(rel));
    await requireDirectory(ctx, parentRel(rel));
    const abs = await resolveSafe(ctx, rel, false);
    try {
      await fsp.mkdir(abs);
    } catch (error) {
      if (errnoCode(error) === 'EEXIST') throw new AppException('INVALID_INPUT', 'Already exists', { name: baseName(rel) });
      throw error;
    }
  });

  // ---------- remove ----------

  async function removeWithRetry(abs: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await fsp.rm(abs, { recursive: true, force: true });
        return;
      } catch (error) {
        lastError = error;
        const code = errnoCode(error);
        if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY' && code !== 'EACCES') break;
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  /** Drops paths that are inside another path of the same list, and duplicates. */
  function pruneNested(rels: string[]): string[] {
    const unique = [...new Set(rels)].sort((a, b) => a.length - b.length);
    const kept: string[] = [];
    for (const rel of unique) {
      if (!kept.some((parent) => rel === parent || rel.startsWith(`${parent}/`))) kept.push(rel);
    }
    return kept;
  }

  const remove = wrap(async (serverId: string, relPaths: string[]): Promise<void> => {
    const ctx = await getContext(serverId);
    if (!Array.isArray(relPaths) || relPaths.length === 0) throw new AppException('INVALID_INPUT', 'Nothing to delete');
    const rels = relPaths.map((p) => normalizeRelPath(p));
    if (rels.some((r) => r === '')) throw new AppException('INVALID_INPUT', 'The server folder itself cannot be deleted');
    const targets: { rel: string; abs: string }[] = [];
    for (const rel of pruneNested(rels)) {
      const abs = await resolveSafe(ctx, rel, false);
      if (!(await lstatOrNull(abs))) throw new AppException('NOT_FOUND', 'File or folder not found', { name: baseName(rel) });
      targets.push({ rel, abs });
    }
    for (const { abs } of targets) {
      try {
        await shell.trashItem(abs);
      } catch (error) {
        log.warn('[files] trashItem failed, deleting permanently', abs, error);
        await removeWithRetry(abs);
      }
    }
  });

  // ---------- move ----------

  async function moveOne(from: string, to: string): Promise<void> {
    try {
      await fsp.rename(from, to);
    } catch (error) {
      if (errnoCode(error) !== 'EXDEV') throw error;
      await fsp.cp(from, to, { recursive: true, errorOnExist: true, force: false });
      await removeWithRetry(from);
    }
  }

  const move = wrap(async (serverId: string, relPaths: string[], destRelDir: string): Promise<void> => {
    const ctx = await getContext(serverId);
    if (!Array.isArray(relPaths) || relPaths.length === 0) throw new AppException('INVALID_INPUT', 'Nothing to move');
    const destRel = normalizeRelPath(destRelDir);
    const destAbs = await requireDirectory(ctx, destRel);
    const destReal = await fsp.realpath(destAbs);
    const rels = relPaths.map((p) => normalizeRelPath(p));
    if (rels.some((r) => r === '')) throw new AppException('INVALID_INPUT', 'The server folder itself cannot be moved');

    const plan: { from: string; to: string }[] = [];
    const usedNames = new Set<string>();
    for (const rel of pruneNested(rels)) {
      const from = await resolveSafe(ctx, rel, false);
      const stat = await lstatOrNull(from);
      if (!stat) throw new AppException('NOT_FOUND', 'File or folder not found', { name: baseName(rel) });
      const name = baseName(rel);
      if (stat.isDirectory()) {
        const fromReal = await fsp.realpath(from);
        if (isInside(fromReal, destReal)) {
          throw new AppException('INVALID_INPUT', 'Cannot move a folder into itself', { name });
        }
      }
      if (parentRel(rel) === destRel) continue; // already there
      const key = nameKey(name);
      const to = path.join(destAbs, name);
      if (usedNames.has(key) || (await lstatOrNull(to))) {
        throw new AppException('INVALID_INPUT', 'A file with this name already exists', { name });
      }
      usedNames.add(key);
      plan.push({ from, to });
    }
    for (const { from, to } of plan) await moveOne(from, to);
  });

  // ---------- rename ----------

  const rename = wrap(async (serverId: string, items: { relPath: string; newName: string }[]): Promise<void> => {
    const ctx = await getContext(serverId);
    if (!Array.isArray(items) || items.length === 0) throw new AppException('INVALID_INPUT', 'Nothing to rename');

    interface Step { from: string; dir: string; oldName: string; newName: string; temp: string; to: string }
    const steps: Step[] = [];
    const seenSources = new Set<string>();
    for (const item of items) {
      const rel = normalizeRelPath(item.relPath);
      if (rel === '') throw new AppException('INVALID_INPUT', 'The server folder itself cannot be renamed');
      if (seenSources.has(rel)) throw new AppException('INVALID_INPUT', 'Duplicate item', { name: baseName(rel) });
      seenSources.add(rel);
      const newName = item.newName;
      assertValidName(newName);
      if (parentRel(rel) === '' && newName.toLowerCase() === META_DIR_KEY) {
        throw new AppException('INVALID_INPUT', 'Reserved name', { name: newName });
      }
      const from = await resolveSafe(ctx, rel, false);
      if (!(await lstatOrNull(from))) throw new AppException('NOT_FOUND', 'File or folder not found', { name: baseName(rel) });
      const dir = path.dirname(from);
      const oldName = path.basename(from);
      steps.push({ from, dir, oldName, newName, temp: '', to: path.join(dir, newName) });
    }

    const changing = steps.filter((s) => s.oldName !== s.newName);
    if (changing.length === 0) return;

    const sourceKeys = new Set(steps.map((s) => nameKey(s.from)));
    const targetKeys = new Set<string>();
    for (const step of changing) {
      const key = nameKey(step.to);
      if (targetKeys.has(key)) throw new AppException('INVALID_INPUT', 'Two items get the same name', { name: step.newName });
      targetKeys.add(key);
      const exists = await lstatOrNull(step.to);
      if (exists && !sourceKeys.has(key)) {
        throw new AppException('INVALID_INPUT', 'A file with this name already exists', { name: step.newName });
      }
    }

    const needsTwoPhases = changing.length > 1 || changing.some((s) => nameKey(s.from) === nameKey(s.to));
    if (!needsTwoPhases) {
      await fsp.rename(changing[0].from, changing[0].to);
      return;
    }

    const token = crypto.randomBytes(4).toString('hex');
    changing.forEach((step, index) => {
      step.temp = path.join(step.dir, `.mcm-rename-${token}-${index}`);
    });
    const phaseOneDone: Step[] = [];
    const phaseTwoDone: Step[] = [];
    try {
      for (const step of changing) {
        await fsp.rename(step.from, step.temp);
        phaseOneDone.push(step);
      }
      for (const step of changing) {
        await fsp.rename(step.temp, step.to);
        phaseTwoDone.push(step);
      }
    } catch (error) {
      // Best-effort rollback to the original names.
      for (const step of phaseTwoDone) await fsp.rename(step.to, step.temp).catch(() => undefined);
      for (const step of phaseOneDone) await fsp.rename(step.temp, step.from).catch(() => undefined);
      throw error;
    }
  });

  // ---------- reveal ----------

  const reveal = wrap(async (serverId: string, relPath: string): Promise<void> => {
    const ctx = await getContext(serverId);
    const rel = normalizeRelPath(relPath);
    const abs = await resolveSafe(ctx, rel, true);
    const stat = await statOrNull(abs);
    if (!stat) throw new AppException('NOT_FOUND', 'File or folder not found', { name: baseName(rel) });
    if (stat.isDirectory()) {
      const message = await shell.openPath(abs);
      if (message) throw new AppException('UNKNOWN', message);
    } else {
      shell.showItemInFolder(abs);
    }
  });

  return { list, readText, writeText, createFile, createFolder, remove, move, rename, reveal };
}
