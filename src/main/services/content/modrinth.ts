// FILE: src/main/services/content/modrinth.ts
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { AppException } from '../../../shared/types';
import type { AppPaths, ContentItem, ContentSearchQuery, ContentSearchResult, DataJson, ServerConfig, ServerSoftware } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import type { Downloader, HashSpec } from './download';
import type { Http } from './http';
import { asArray, asNumber, asRecord, asString, isRecord } from './json';
import { SERVER_META_DIR } from '../../../shared/constants';
import { enc, pathExists, readJsonFile, writeJsonAtomic } from './util';

const API = 'https://api.modrinth.com/v2';
const SERVER_ID_RE = /^[a-z0-9-]+$/;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DEP_DEPTH = 3;

interface InstalledRecord {
  fileName: string;
  versionId: string;
  title: string;
  author: string;
  installedAt: number;
}
type Records = Record<string, InstalledRecord>;

interface ServerInfo {
  serverId: string;
  software: ServerSoftware;
  modKind: 'plugin' | 'mod';
  mcVersion: string | null;
  folder: string;
  installDir: string;
}

/** Lower-case and strip accents so "Nguyễn" matches "nguyen". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

function safeFileName(raw: string): string | null {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/\.{2,}/g, '.').trim();
  if (cleaned.length <= 4 || cleaned === '.' || cleaned === '..') return null;
  return /\.jar$/i.test(cleaned) ? cleaned : null;
}

interface PickedFile {
  url: string;
  fileName: string;
  hash: HashSpec | undefined;
}
interface PickedVersion {
  id: string;
  file: PickedFile;
  requiredDeps: string[];
}

function pickJarFile(version: Record<string, unknown>): PickedFile | null {
  const jars: { rec: Record<string, unknown>; fileName: string; url: string }[] = [];
  for (const f of asArray(version.files)) {
    if (!isRecord(f)) continue;
    const url = asString(f.url);
    const name = asString(f.filename);
    const fileName = name ? safeFileName(name) : null;
    if (url && fileName) jars.push({ rec: f, fileName, url });
  }
  const chosen = jars.find((j) => j.rec.primary === true) ?? jars[0];
  if (!chosen) return null;
  const hashes = asRecord(chosen.rec.hashes);
  const sha512 = asString(hashes.sha512);
  const sha1 = asString(hashes.sha1);
  const hash: HashSpec | undefined = sha512
    ? { algo: 'sha512', value: sha512 }
    : sha1
      ? { algo: 'sha1', value: sha1 }
      : undefined;
  return { url: chosen.url, fileName: chosen.fileName, hash };
}

/** Newest release first; if there is no release, newest of any type. Only versions with a .jar file count. */
function pickVersion(raw: unknown): PickedVersion | null {
  const versions = asArray(raw).filter(isRecord);
  const time = (v: Record<string, unknown>): number => {
    const t = Date.parse(asString(v.date_published) ?? '');
    return Number.isNaN(t) ? 0 : t;
  };
  versions.sort((a, b) => time(b) - time(a));
  const ordered = [...versions.filter((v) => v.version_type === 'release'), ...versions.filter((v) => v.version_type !== 'release')];
  for (const v of ordered) {
    const id = asString(v.id);
    const file = pickJarFile(v);
    if (!id || !file) continue;
    const requiredDeps: string[] = [];
    for (const d of asArray(v.dependencies)) {
      if (!isRecord(d) || d.dependency_type !== 'required') continue;
      const pid = asString(d.project_id);
      if (pid && ITEM_ID_RE.test(pid)) requiredDeps.push(pid);
    }
    return { id, file, requiredDeps };
  }
  return null;
}

export interface Modrinth {
  searchContent(q: ContentSearchQuery): Promise<ContentSearchResult>;
  listInstalledContent(serverId: string): Promise<ContentItem[]>;
  installContent(serverId: string, itemId: string): Promise<void>;
  removeContent(serverId: string, fileName: string): Promise<void>;
}

export function createModrinth(deps: {
  paths: AppPaths;
  http: Http;
  downloader: Downloader;
  getDataJson(): Promise<DataJson>;
  log: Logger;
}): Modrinth {
  const { paths, http, downloader, getDataJson, log } = deps;
  const locks = new Map<string, Promise<unknown>>();

  /** Runs jobs for the same key one after another (protects installed-content.json). */
  function withLock<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const run = prev.then(job);
    locks.set(key, run.then(() => undefined, () => undefined));
    return run;
  }

  // ---- server info (read only) ----

  async function readServer(serverId: string): Promise<ServerInfo> {
    if (!SERVER_ID_RE.test(serverId)) throw new AppException('INVALID_INPUT', 'Invalid server id');
    const serverDir = path.join(paths.serversDir, serverId);
    const raw = await readJsonFile(path.join(serverDir, SERVER_META_DIR, 'config.json'));
    if (!isRecord(raw)) throw new AppException('NOT_FOUND', `Server ${serverId} not found`);
    const cfg = raw as Partial<ServerConfig> & Record<string, unknown>;
    const software = asString(cfg.software) as ServerSoftware | null;
    if (!software) throw new AppException('NOT_FOUND', `Server ${serverId} has a broken config`);
    const modKind = cfg.modKind;
    if (modKind !== 'plugin' && modKind !== 'mod') {
      throw new AppException('INVALID_INPUT', 'This server does not use plugins or mods');
    }
    // Prefer ServerConfig.folder, but never accept a folder outside the servers directory.
    const declared = asString(cfg.folder);
    const candidate = declared ? (path.isAbsolute(declared) ? declared : path.join(serverDir, declared)) : serverDir;
    const rel = path.relative(paths.serversDir, path.resolve(candidate));
    const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    const folder = inside ? path.resolve(candidate) : serverDir;
    return {
      serverId,
      software,
      modKind,
      mcVersion: asString(cfg.mcVersion),
      folder,
      installDir: path.join(folder, modKind === 'plugin' ? 'plugins' : 'mods')
    };
  }

  async function loadersFor(info: ServerInfo): Promise<string[]> {
    if (info.software !== 'custom') {
      const fromData = ((await getDataJson()).pluginLoaders[info.software] ?? []).filter((x) => x.length > 0);
      if (fromData.length > 0) return fromData;
    }
    return info.modKind === 'plugin' ? ['paper', 'spigot', 'bukkit'] : ['fabric', 'forge', 'neoforge', 'quilt'];
  }

  // ---- installed records ----

  const recordsPath = (info: ServerInfo): string => path.join(info.folder, SERVER_META_DIR, 'installed-content.json');

  async function readRecords(info: ServerInfo): Promise<Records> {
    const raw = await readJsonFile(recordsPath(info));
    const out: Records = {};
    if (!isRecord(raw)) return out;
    for (const [projectId, value] of Object.entries(raw)) {
      if (!isRecord(value)) continue;
      const fileName = asString(value.fileName);
      if (!fileName) continue;
      out[projectId] = {
        fileName,
        versionId: asString(value.versionId) ?? '',
        title: asString(value.title) ?? fileName,
        author: typeof value.author === 'string' ? value.author : '',
        installedAt: asNumber(value.installedAt) ?? 0
      };
    }
    return out;
  }

  function updateRecords(info: ServerInfo, mutate: (r: Records) => void): Promise<void> {
    return withLock(`records:${info.serverId}`, async () => {
      const records = await readRecords(info);
      mutate(records);
      await writeJsonAtomic(recordsPath(info), records);
    });
  }

  async function isInstalled(info: ServerInfo, rec: InstalledRecord | undefined): Promise<boolean> {
    return rec !== undefined && (await pathExists(path.join(info.installDir, rec.fileName)));
  }

  // ---- search ----

  async function searchContent(q: ContentSearchQuery): Promise<ContentSearchResult> {
    const info = await readServer(q.serverId);
    const loaders = await loadersFor(info);
    const filters = q.filters ?? {};
    const filterActive = [filters.author, filters.title, filters.description].some((f) => (f ?? '').trim() !== '');
    const pageSize = Math.min(100, Math.max(1, Math.floor(q.pageSize) || 20));
    const page = Math.max(0, Math.floor(q.page) || 0);
    // With a filter we fetch one big page and filter it here, so there is no paging.
    if (filterActive && page > 0) return { items: [], total: 0 };

    const facets: string[][] = [loaders.map((l) => `categories:${l}`)];
    if (info.mcVersion) facets.push([`versions:${info.mcVersion}`]);
    // Only mods get a project_type facet; plugins are tagged by loader instead.
    if (info.modKind === 'mod') facets.push(['project_type:mod']);

    const query = (q.query ?? '').trim();
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    params.set('limit', String(filterActive ? 100 : pageSize));
    params.set('offset', String(filterActive ? 0 : page * pageSize));
    params.set('index', query ? 'relevance' : 'downloads');
    params.set('facets', JSON.stringify(facets));

    const root = asRecord(await http.getJson(`${API}/search?${params.toString()}`));
    const records = await readRecords(info);

    let items: ContentItem[] = [];
    for (const hit of asArray(root.hits)) {
      if (!isRecord(hit)) continue;
      const id = asString(hit.project_id);
      const title = asString(hit.title);
      if (!id || !title) continue;
      const slug = asString(hit.slug) ?? id;
      const rec = records[id];
      const installed = await isInstalled(info, rec);
      items.push({
        id,
        title,
        description: typeof hit.description === 'string' ? hit.description : '',
        author: typeof hit.author === 'string' ? hit.author : '',
        iconUrl: asString(hit.icon_url),
        pageUrl: `https://modrinth.com/project/${slug}`,
        installed,
        installedFile: installed && rec ? rec.fileName : null
      });
    }

    if (filterActive) {
      const match = (value: string, needle: string | undefined): boolean =>
        !needle || needle.trim() === '' || fold(value).includes(fold(needle.trim()));
      items = items.filter(
        (it) => match(it.author, filters.author) && match(it.title, filters.title) && match(it.description, filters.description)
      );
      return { items, total: items.length };
    }
    return { items, total: asNumber(root.total_hits) ?? items.length };
  }

  // ---- installed list ----

  async function listInstalledContent(serverId: string): Promise<ContentItem[]> {
    const info = await readServer(serverId);
    const records = await readRecords(info);
    let files: string[] = [];
    try {
      files = (await fsp.readdir(info.installDir)).filter((f) => /\.jar$/i.test(f));
    } catch {
      files = [];
    }
    const fileSet = new Set(files);
    const items: ContentItem[] = [];
    const known = new Set<string>();
    for (const [projectId, rec] of Object.entries(records)) {
      if (!fileSet.has(rec.fileName)) continue;
      known.add(rec.fileName);
      items.push({
        id: projectId,
        title: rec.title,
        description: '',
        author: rec.author,
        iconUrl: null,
        pageUrl: `https://modrinth.com/project/${projectId}`,
        installed: true,
        installedFile: rec.fileName
      });
    }
    for (const f of files) {
      if (known.has(f)) continue;
      items.push({ id: `file:${f}`, title: f, description: '', author: '', iconUrl: null, pageUrl: '', installed: true, installedFile: f });
    }
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }

  // ---- install ----

  async function projectMeta(projectId: string): Promise<{ title: string | null; author: string | null }> {
    let title: string | null = null;
    let author: string | null = null;
    try {
      title = asString(asRecord(await http.getJson(`${API}/project/${enc(projectId)}`)).title);
    } catch (e) {
      log.warn(`Could not read Modrinth project ${projectId}:`, e instanceof Error ? e.message : e);
    }
    try {
      const members = asArray(await http.getJson(`${API}/project/${enc(projectId)}/members`)).filter(isRecord);
      const owner = members.find((m) => m.role === 'Owner') ?? members[0];
      author = owner ? asString(asRecord(owner.user).username) : null;
    } catch {
      // author stays empty
    }
    return { title, author };
  }

  async function installOne(
    info: ServerInfo,
    loaders: string[],
    projectId: string,
    taskId: string,
    depth: number,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(projectId)) return;
    visited.add(projectId);

    const params = new URLSearchParams();
    params.set('loaders', JSON.stringify(loaders));
    if (info.mcVersion) params.set('game_versions', JSON.stringify([info.mcVersion]));
    const versions = await http.getJson(`${API}/project/${enc(projectId)}/version?${params.toString()}`);
    const picked = pickVersion(versions);
    if (!picked) throw new AppException('NOT_FOUND', `No compatible version for ${projectId}`, { id: projectId });

    const previous = (await readRecords(info))[projectId];
    await fsp.mkdir(info.installDir, { recursive: true });
    await downloader.downloadFile({
      url: picked.file.url,
      destPath: path.join(info.installDir, picked.file.fileName),
      taskId,
      label: picked.file.fileName,
      hash: picked.file.hash
    });

    const meta = await projectMeta(projectId);
    await updateRecords(info, (records) => {
      records[projectId] = {
        fileName: picked.file.fileName,
        versionId: picked.id,
        title: meta.title ?? picked.file.fileName,
        author: meta.author ?? '',
        installedAt: Date.now()
      };
    });
    if (previous && previous.fileName !== picked.file.fileName) {
      await fsp.rm(path.join(info.installDir, previous.fileName), { force: true }).catch(() => undefined);
    }

    // Required dependencies (low priority): up to 3 levels, skipping what is already installed.
    if (depth >= MAX_DEP_DEPTH) return;
    for (const depId of picked.requiredDeps) {
      if (visited.has(depId)) continue;
      const rec = (await readRecords(info))[depId];
      if (await isInstalled(info, rec)) continue;
      try {
        await installOne(info, loaders, depId, taskId, depth + 1, visited);
      } catch (e) {
        if (e instanceof AppException && e.code === 'CANCELLED') throw e;
        log.warn(`Could not install dependency ${depId}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  async function installContent(serverId: string, itemId: string): Promise<void> {
    if (!ITEM_ID_RE.test(itemId)) throw new AppException('INVALID_INPUT', 'Invalid content id');
    const info = await readServer(serverId);
    const loaders = await loadersFor(info);
    await installOne(info, loaders, itemId, `content-${serverId}-${itemId}`, 0, new Set<string>());
  }

  // ---- remove ----

  async function removeContent(serverId: string, fileName: string): Promise<void> {
    if (!fileName || fileName !== path.basename(fileName) || /[\\/]/.test(fileName) || fileName.includes('..')) {
      throw new AppException('INVALID_INPUT', 'Invalid file name');
    }
    const info = await readServer(serverId);
    try {
      await fsp.unlink(path.join(info.installDir, fileName));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'EPERM') {
        throw new AppException('SERVER_RUNNING', `File is in use: ${fileName}`);
      }
      if (code !== 'ENOENT') throw new AppException('UNKNOWN', `Could not delete ${fileName}`);
    }
    await updateRecords(info, (records) => {
      for (const [id, rec] of Object.entries(records)) {
        if (rec.fileName === fileName) delete records[id];
      }
    });
  }

  return { searchContent, listInstalledContent, installContent, removeContent };
}
