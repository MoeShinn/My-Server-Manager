// FILE: src/main/services/content/modrinth.ts
import { createHash } from 'node:crypto';
import { createReadStream, promises as fsp } from 'node:fs';
import path from 'node:path';
import { AppException } from '../../../shared/types';
import type { AppPaths, ContentItem, ContentSearchQuery, ContentSearchResult, DataJson, ServerConfig, ServerSoftware } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import type { Downloader, HashSpec } from './download';
import type { Http } from './http';
import { asArray, asNumber, asRecord, asString, isRecord } from './json';
import { SERVER_META_DIR } from '../../../shared/constants';
import { readJarIcon } from './jarIcon';
import { enc, mapLimit, pathExists, readJsonFile, writeJsonAtomic } from './util';

const API = 'https://api.modrinth.com/v2';
const SERVER_ID_RE = /^[a-z0-9-]+$/;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DEP_DEPTH = 3;
/** A file Modrinth did not know is asked about again after this long (it may have been uploaded since). */
const UNKNOWN_RECHECK_MS = 3 * 24 * 60 * 60 * 1000;

interface InstalledRecord {
  fileName: string;
  versionId: string;
  title: string;
  author: string;
  installedAt: number;
  /** undefined = never looked up (installed by an older app version); null = looked up, project has no icon. */
  iconUrl?: string | null;
  description?: string;
}
type Records = Record<string, InstalledRecord>;

/** What Modrinth knows about a project (only the fields the UI needs). */
interface ProjectInfo {
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
}

/** Result of asking Modrinth about a .jar that was not installed through the app. Keyed by file name. */
interface MetaEntry {
  size: number;
  mtimeMs: number;
  sha1: string;
  projectId: string | null;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  checkedAt: number;
}
type MetaCache = Record<string, MetaEntry>;

function sha1OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

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
        installedAt: asNumber(value.installedAt) ?? 0,
        iconUrl: typeof value.iconUrl === 'string' && value.iconUrl !== '' ? value.iconUrl : value.iconUrl === null ? null : undefined,
        description: typeof value.description === 'string' ? value.description : undefined
      };
    }
    return out;
  }

  // ---- Modrinth lookups used for icons ----

  /** Title, description, icon and owner for up to many projects, in as few requests as possible. */
  async function fetchProjectInfo(ids: string[]): Promise<Map<string, ProjectInfo>> {
    const out = new Map<string, ProjectInfo>();
    const valid = [...new Set(ids)].filter((id) => ITEM_ID_RE.test(id));
    for (let i = 0; i < valid.length; i += 50) {
      const chunk = valid.slice(i, i + 50);
      const projects = asArray(await http.getJson(`${API}/projects?ids=${enc(JSON.stringify(chunk))}`, { retries: 0 }));
      const projectOfTeam = new Map<string, string>();
      for (const p of projects) {
        if (!isRecord(p)) continue;
        const id = asString(p.id);
        const title = asString(p.title);
        if (!id || !title) continue;
        out.set(id, {
          title,
          description: typeof p.description === 'string' ? p.description : '',
          author: '',
          iconUrl: asString(p.icon_url)
        });
        const team = asString(p.team);
        if (team) projectOfTeam.set(team, id);
      }
      if (projectOfTeam.size === 0) continue;
      try {
        const teams = asArray(await http.getJson(`${API}/teams?ids=${enc(JSON.stringify([...projectOfTeam.keys()]))}`, { retries: 0 }));
        for (const members of teams) {
          if (!Array.isArray(members)) continue;
          const list = members.filter(isRecord);
          const owner = list.find((m) => m.role === 'Owner') ?? list[0];
          if (!owner) continue;
          const teamId = asString(owner.team_id);
          const username = asString(asRecord(owner.user).username);
          const projectId = teamId ? projectOfTeam.get(teamId) : undefined;
          const info = projectId ? out.get(projectId) : undefined;
          if (info && username) info.author = username;
        }
      } catch {
        // the author stays empty, the icon is what matters here
      }
    }
    return out;
  }

  /** sha1 of a .jar -> Modrinth project id, for the jars Modrinth knows. */
  async function lookupProjectsByHash(hashes: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < hashes.length; i += 100) {
      const chunk = hashes.slice(i, i + 100);
      const res = asRecord(await http.postJson(`${API}/version_files`, { hashes: chunk, algorithm: 'sha1' }, { retries: 0 }));
      for (const [hash, version] of Object.entries(res)) {
        if (!isRecord(version)) continue;
        const projectId = asString(version.project_id);
        if (projectId && ITEM_ID_RE.test(projectId)) out.set(hash.toLowerCase(), projectId);
      }
    }
    return out;
  }

  const metaCachePath = (info: ServerInfo): string => path.join(info.folder, SERVER_META_DIR, 'content-meta-cache.json');

  async function readMetaCache(info: ServerInfo): Promise<MetaCache> {
    const raw = await readJsonFile(metaCachePath(info));
    const out: MetaCache = {};
    if (!isRecord(raw)) return out;
    for (const [fileName, v] of Object.entries(raw)) {
      if (!isRecord(v)) continue;
      const size = asNumber(v.size);
      const mtimeMs = asNumber(v.mtimeMs);
      if (size === null || mtimeMs === null) continue;
      out[fileName] = {
        size,
        mtimeMs,
        sha1: asString(v.sha1) ?? '',
        projectId: asString(v.projectId),
        title: asString(v.title) ?? '',
        description: typeof v.description === 'string' ? v.description : '',
        author: typeof v.author === 'string' ? v.author : '',
        iconUrl: asString(v.iconUrl),
        checkedAt: asNumber(v.checkedAt) ?? 0
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

  /**
   * Icon order for every installed jar:
   *   1. the icon Modrinth has for it (saved when installed through the app, or found by the jar's hash),
   *   2. the icon that ships inside the jar itself,
   *   3. null (the UI then shows the default icon).
   * Network problems never break the list: it just falls back to step 2 and 3.
   */
  async function listInstalledContent(serverId: string): Promise<ContentItem[]> {
    const info = await readServer(serverId);
    let records = await readRecords(info);
    let files: string[] = [];
    try {
      files = (await fsp.readdir(info.installDir)).filter((f) => /\.jar$/i.test(f));
    } catch {
      files = [];
    }
    const fileSet = new Set(files);

    // A) Installed by an older app version: no icon saved yet. Ask Modrinth once and remember the answer.
    const stale = Object.entries(records).filter(([, r]) => fileSet.has(r.fileName) && r.iconUrl === undefined);
    if (stale.length > 0) {
      try {
        const found = await fetchProjectInfo(stale.map(([projectId]) => projectId));
        await updateRecords(info, (recs) => {
          for (const [projectId] of stale) {
            const rec = recs[projectId];
            if (!rec || rec.iconUrl !== undefined) continue;
            const meta = found.get(projectId);
            rec.iconUrl = meta ? meta.iconUrl : null;
            if (meta) {
              rec.description = meta.description;
              if (!rec.author && meta.author) rec.author = meta.author;
            }
          }
        });
        records = await readRecords(info);
      } catch (e) {
        log.warn('Could not load icons for installed content:', e instanceof Error ? e.message : e);
      }
    }

    const known = new Set<string>();
    for (const rec of Object.values(records)) known.add(rec.fileName);

    // B) Jars that were put in the folder by hand: identify them on Modrinth by their hash.
    const unknownFiles = files.filter((f) => !known.has(f));
    const metaByFile = new Map<string, MetaEntry>();
    if (unknownFiles.length > 0) {
      const cache = await readMetaCache(info);
      const now = Date.now();
      const statted = await mapLimit(unknownFiles, 8, async (f) => {
        try {
          const st = await fsp.stat(path.join(info.installDir, f));
          return { file: f, size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
        } catch {
          return null;
        }
      });
      const todo: { file: string; size: number; mtimeMs: number }[] = [];
      for (const st of statted) {
        if (!st) continue;
        const hit = cache[st.file];
        const fresh =
          hit !== undefined &&
          hit.size === st.size &&
          hit.mtimeMs === st.mtimeMs &&
          (hit.projectId !== null || now - hit.checkedAt < UNKNOWN_RECHECK_MS);
        if (hit && fresh) metaByFile.set(st.file, hit);
        else todo.push(st);
      }

      if (todo.length > 0) {
        try {
          const hashes = await mapLimit(todo, 4, async (t) => ({ ...t, sha1: await sha1OfFile(path.join(info.installDir, t.file)) }));
          const projectOfHash = await lookupProjectsByHash(hashes.map((h) => h.sha1));
          const projects = await fetchProjectInfo([...new Set(projectOfHash.values())]);
          for (const h of hashes) {
            const projectId = projectOfHash.get(h.sha1) ?? null;
            const meta = projectId ? projects.get(projectId) : undefined;
            // Modrinth knows the hash but the project lookup failed: do not remember, try again next time.
            if (projectId && !meta) continue;
            const entry: MetaEntry = {
              size: h.size,
              mtimeMs: h.mtimeMs,
              sha1: h.sha1,
              projectId,
              title: meta?.title ?? '',
              description: meta?.description ?? '',
              author: meta?.author ?? '',
              iconUrl: meta?.iconUrl ?? null,
              checkedAt: now
            };
            cache[h.file] = entry;
            metaByFile.set(h.file, entry);
          }
          for (const name of Object.keys(cache)) if (!fileSet.has(name)) delete cache[name];
          await writeJsonAtomic(metaCachePath(info), cache).catch(() => undefined);
        } catch (e) {
          log.warn('Could not look up installed files on Modrinth:', e instanceof Error ? e.message : e);
        }
      }
    }

    // C) Build the list.
    const items: ContentItem[] = [];
    for (const [projectId, rec] of Object.entries(records)) {
      if (!fileSet.has(rec.fileName)) continue;
      items.push({
        id: projectId,
        title: rec.title,
        description: rec.description ?? '',
        author: rec.author,
        iconUrl: rec.iconUrl ?? null,
        pageUrl: `https://modrinth.com/project/${projectId}`,
        installed: true,
        installedFile: rec.fileName
      });
    }
    for (const f of unknownFiles) {
      const meta = metaByFile.get(f);
      const matched = meta !== undefined && meta.projectId !== null;
      items.push({
        id: `file:${f}`,
        title: matched && meta.title !== '' ? meta.title : f,
        description: matched ? meta.description : '',
        author: matched ? meta.author : '',
        iconUrl: matched ? meta.iconUrl : null,
        pageUrl: matched ? `https://modrinth.com/project/${meta.projectId}` : '',
        installed: true,
        installedFile: f
      });
    }

    // D) Still no icon: use the one inside the jar (reads only a few KB per file).
    await mapLimit(items, 6, async (item) => {
      if (item.iconUrl !== null || item.installedFile === null) return;
      item.iconUrl = await readJarIcon(path.join(info.installDir, item.installedFile));
    });

    return items.sort((a, b) => a.title.localeCompare(b.title));
  }

  // ---- install ----

  async function projectMeta(
    projectId: string
  ): Promise<{ title: string | null; author: string | null; iconUrl: string | null; description: string }> {
    let title: string | null = null;
    let author: string | null = null;
    let iconUrl: string | null = null;
    let description = '';
    try {
      const project = asRecord(await http.getJson(`${API}/project/${enc(projectId)}`));
      title = asString(project.title);
      iconUrl = asString(project.icon_url);
      description = typeof project.description === 'string' ? project.description : '';
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
    return { title, author, iconUrl, description };
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
        installedAt: Date.now(),
        iconUrl: meta.iconUrl,
        description: meta.description
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
