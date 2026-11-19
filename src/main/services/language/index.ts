import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import { AppException } from '@shared/types';
import { BUNDLED_LANGUAGES } from '@shared/constants';
import type { DataJson, LanguageInfo } from '@shared/types';
import type { LanguageService, ServiceDeps } from '@shared/services';

type LanguageDeps = ServiceDeps & {
  getDataJson(opts?: { refresh?: boolean }): Promise<DataJson>;
  setLanguage(code: string): Promise<void>;
};

interface InstalledRecord {
  sha256: string;
  installedAt: number;
  source: 'seed' | 'download';
}
type InstalledMap = Record<string, InstalledRecord>;
type Dictionary = Record<string, string>;
type RemoteEntry = DataJson['languages'][number];

interface RemoteCacheItem {
  text: string;
  sha256: string;
  fetchedAt: number;
}

// Language part is lowercase, the region/script part may be mixed case (zh-CN, pt-BR, zh-Hans).
const CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const MAX_LANGUAGE_BYTES = 1024 * 1024;
const REMOTE_CACHE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const INSTALLED_FILE = 'installed.json';
// Remembers which bundled languages were already copied once, so a language the person removed does not come back on restart.
const SEEDED_FILE = 'seeded.json';

function sha256Of(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertCode(code: unknown): asserts code is string {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    throw new AppException('INVALID_INPUT', 'Invalid language code');
  }
}

/** Parses a language file and returns only string entries plus a validated _meta. Returns null when invalid. */
function parseLanguageFile(
  text: string,
): { entries: Dictionary; meta: { code?: string; name: string }; stripped: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const rawMeta = parsed['_meta'];
  if (!isPlainObject(rawMeta) || typeof rawMeta['name'] !== 'string' || rawMeta['name'].trim() === '') return null;
  const meta: { code?: string; name: string } = { name: rawMeta['name'] };
  if (typeof rawMeta['code'] === 'string') meta.code = rawMeta['code'];
  const entries: Dictionary = Object.create(null) as Dictionary;
  let stripped = false;
  for (const key of Object.keys(parsed)) {
    if (key === '_meta') continue;
    if (DANGEROUS_KEYS.has(key)) {
      stripped = true;
      continue;
    }
    const value = parsed[key];
    if (typeof value !== 'string') return null;
    entries[key] = value;
  }
  return { entries, meta, stripped };
}

export function createLanguageService(deps: LanguageDeps): LanguageService {
  const { paths, config, log } = deps;
  const languageDir = paths.languageDir;
  const bundledDir = path.join(paths.resourcesDir, 'language');
  const installedFile = path.join(languageDir, INSTALLED_FILE);
  const seededFile = path.join(languageDir, SEEDED_FILE);

  const remoteCache = new Map<string, RemoteCacheItem>();
  const dictionaryCache = new Map<string, { stamp: string; value: Dictionary }>();
  let baseCache: { stamp: string; value: Dictionary } | null = null;

  // ---------- small helpers ----------

  function languageFilePath(code: string): string {
    return path.join(languageDir, `${code}.json`);
  }

  function mapError(error: unknown): never {
    if (error instanceof AppException) throw error;
    log.error('[language] unexpected error', error);
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

  function readInstalledSync(): InstalledMap {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(installedFile, 'utf8'));
      if (!isPlainObject(parsed)) return {};
      const result: InstalledMap = {};
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        if (!CODE_PATTERN.test(key) || !isPlainObject(item)) continue;
        if (typeof item['sha256'] !== 'string' || typeof item['installedAt'] !== 'number') continue;
        result[key] = {
          sha256: item['sha256'],
          installedAt: item['installedAt'],
          source: item['source'] === 'download' ? 'download' : 'seed',
        };
      }
      return result;
    } catch {
      return {};
    }
  }

  async function writeFileAtomic(target: string, data: string): Promise<void> {
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
      await fsp.writeFile(tmp, data, 'utf8');
      await fsp.rename(tmp, target);
    } catch (error) {
      await fsp.rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async function readInstalled(): Promise<InstalledMap> {
    return readInstalledSync();
  }

  async function writeInstalled(map: InstalledMap): Promise<void> {
    await writeFileAtomic(installedFile, JSON.stringify(map, null, 2));
  }

  // ---------- startup: ensure folder and seed bundled files (synchronous so the service is ready at once) ----------

  function readSeededSync(): Set<string> {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(seededFile, 'utf8'));
      if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === 'string'));
    } catch {
      // first run or unreadable file
    }
    return new Set();
  }

  /** Only the languages in BUNDLED_LANGUAGES are copied. Everything else has to be downloaded by the person. */
  function seedBundledLanguages(): void {
    fs.mkdirSync(languageDir, { recursive: true });
    const installed = readInstalledSync();
    const seeded = readSeededSync();
    let installedChanged = false;
    let seededChanged = false;
    for (const code of BUNDLED_LANGUAGES) {
      try {
        const source = fs.readFileSync(path.join(bundledDir, `${code}.json`));
        const sourceHash = sha256Of(source);
        const target = languageFilePath(code);
        const exists = fs.existsSync(target);
        if (code === 'en') {
          // English is always kept in sync with the app version.
          if (!exists || !fs.readFileSync(target).equals(source)) fs.writeFileSync(target, source);
          if (installed[code]?.sha256 !== sourceHash) {
            installed[code] = { sha256: sourceHash, installedAt: Date.now(), source: 'seed' };
            installedChanged = true;
          }
          continue;
        }
        if (seeded.has(code)) continue; // already seeded once: respect removal and the person's own edits
        if (!exists) {
          fs.writeFileSync(target, source);
          installed[code] = { sha256: sourceHash, installedAt: Date.now(), source: 'seed' };
          installedChanged = true;
        } else if (!installed[code] && fs.readFileSync(target).equals(source)) {
          installed[code] = { sha256: sourceHash, installedAt: Date.now(), source: 'seed' };
          installedChanged = true;
        }
        seeded.add(code);
        seededChanged = true;
      } catch (error) {
        log.warn('[language] failed to seed bundled language', code, error);
      }
    }
    try {
      if (installedChanged) fs.writeFileSync(installedFile, JSON.stringify(installed, null, 2), 'utf8');
      if (seededChanged) fs.writeFileSync(seededFile, JSON.stringify([...seeded], null, 2), 'utf8');
    } catch (error) {
      log.warn('[language] failed to write language bookkeeping files', error);
    }
  }

  seedBundledLanguages();

  // ---------- dictionaries ----------

  function readDictionaryFile(file: string, cacheKey: string): Dictionary | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      dictionaryCache.delete(cacheKey);
      return null;
    }
    const stamp = `${stat.mtimeMs}:${stat.size}`;
    const cached = dictionaryCache.get(cacheKey);
    if (cached && cached.stamp === stamp) return cached.value;
    if (stat.size > MAX_LANGUAGE_BYTES) return null;
    try {
      const parsed = parseLanguageFile(fs.readFileSync(file, 'utf8'));
      if (!parsed) return null;
      const value: Dictionary = { ...parsed.entries };
      dictionaryCache.set(cacheKey, { stamp, value });
      return value;
    } catch {
      return null;
    }
  }

  function getBaseDictionary(): Dictionary {
    const bundled = path.join(bundledDir, 'en.json');
    try {
      const stat = fs.statSync(bundled);
      const stamp = `${stat.mtimeMs}:${stat.size}`;
      if (baseCache && baseCache.stamp === stamp) return baseCache.value;
      const parsed = parseLanguageFile(fs.readFileSync(bundled, 'utf8'));
      if (parsed) {
        baseCache = { stamp, value: { ...parsed.entries } };
        return baseCache.value;
      }
    } catch {
      // fall through to the copy in languageDir
    }
    return readDictionaryFile(languageFilePath('en'), 'en-fallback') ?? {};
  }

  // ---------- network ----------

  async function fetchRemoteText(entry: RemoteEntry): Promise<string> {
    const url = `https://raw.githubusercontent.com/${config.dataRepo}/${config.dataBranch}/${entry.file}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': config.userAgent },
        signal: controller.signal,
      });
      if (!response.ok) {
        log.warn('[language] remote file request failed', url, response.status);
        throw new AppException('NETWORK', `HTTP ${response.status}`, { code: entry.code });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_LANGUAGE_BYTES) {
        throw new AppException('INVALID_INPUT', 'Language file too large', { code: entry.code });
      }
      return buffer.toString('utf8');
    } catch (error) {
      if (error instanceof AppException) throw error;
      log.warn('[language] network error', url, error);
      throw new AppException('NETWORK', 'Network error', { code: entry.code });
    } finally {
      clearTimeout(timer);
    }
  }

  async function downloadRemote(entry: RemoteEntry, useCache: boolean): Promise<RemoteCacheItem> {
    const cached = remoteCache.get(entry.code);
    if (useCache && cached && Date.now() - cached.fetchedAt < REMOTE_CACHE_MS) return cached;
    const text = await fetchRemoteText(entry);
    const item: RemoteCacheItem = { text, sha256: sha256Of(text), fetchedAt: Date.now() };
    remoteCache.set(entry.code, item);
    return item;
  }

  async function findRemoteEntry(code: string): Promise<RemoteEntry> {
    const data = await deps.getDataJson();
    const entry = data.languages.find((l) => l.code === code);
    if (!entry) throw new AppException('NOT_FOUND', 'Language not found in data.json', { code });
    // The file path comes from a remote JSON, so it must not contain odd segments.
    if (/(^|\/)\.\.(\/|$)/.test(entry.file) || entry.file.startsWith('/') || entry.file.includes('\\')) {
      throw new AppException('INVALID_INPUT', 'Invalid language file path', { code });
    }
    return entry;
  }

  // ---------- install / update ----------

  async function writeLanguageFile(code: string, item: RemoteCacheItem): Promise<void> {
    const parsed = parseLanguageFile(item.text);
    if (!parsed) throw new AppException('INVALID_INPUT', 'Invalid language file', { code });
    if (parsed.meta.code !== undefined && parsed.meta.code !== code) {
      throw new AppException('INVALID_INPUT', 'Language code mismatch', { code });
    }
    const content = parsed.stripped
      ? JSON.stringify({ _meta: parsed.meta, ...parsed.entries }, null, 2)
      : item.text;
    const target = languageFilePath(code);
    await fsp.mkdir(languageDir, { recursive: true });
    if (fs.existsSync(target)) {
      await fsp.copyFile(target, `${target}.bak`);
    }
    await writeFileAtomic(target, content);
    const installed = await readInstalled();
    installed[code] = { sha256: item.sha256, installedAt: Date.now(), source: 'download' };
    await writeInstalled(installed);
    dictionaryCache.delete(code);
  }

  async function installCode(code: string): Promise<void> {
    assertCode(code);
    const entry = await findRemoteEntry(code);
    const item = await downloadRemote(entry, true);
    await writeLanguageFile(code, item);
  }

  async function updateCode(code: string): Promise<void> {
    assertCode(code);
    const installed = await readInstalled();
    if (!installed[code] && !fs.existsSync(languageFilePath(code))) {
      throw new AppException('NOT_FOUND', 'Language not installed', { code });
    }
    const entry = await findRemoteEntry(code);
    const item = await downloadRemote(entry, true);
    if (installed[code]?.sha256 === item.sha256 && fs.existsSync(languageFilePath(code))) return;
    await writeLanguageFile(code, item);
  }

  /** Runs the action for every code one after another. A broken language does not stop the others; the first error is thrown at the end. */
  async function runEach(codes: string[], action: (code: string) => Promise<void>): Promise<void> {
    let firstError: unknown = null;
    for (const code of codes) {
      try {
        await action(code);
      } catch (error) {
        log.warn('[language] bulk action failed for', code, error);
        if (firstError === null) firstError = error;
      }
    }
    if (firstError !== null) throw firstError;
  }

  // ---------- public API ----------

  const listInstalled = wrap(async (): Promise<LanguageInfo[]> => {
    const current = deps.getSettings().language;
    const names = await fsp.readdir(languageDir).catch(() => [] as string[]);
    const result: LanguageInfo[] = [];
    for (const fileName of names) {
      if (!fileName.endsWith('.json') || fileName === INSTALLED_FILE || fileName === SEEDED_FILE) continue;
      const code = fileName.slice(0, -'.json'.length);
      if (!CODE_PATTERN.test(code)) continue;
      try {
        const stat = await fsp.stat(path.join(languageDir, fileName));
        if (stat.size > MAX_LANGUAGE_BYTES) continue;
        const parsed = parseLanguageFile(await fsp.readFile(path.join(languageDir, fileName), 'utf8'));
        if (!parsed) continue;
        result.push({ code, name: parsed.meta.name, installed: true, updateAvailable: false, inUse: code === current });
      } catch {
        // skip unreadable file
      }
    }
    if (!result.some((l) => l.code === 'en')) {
      result.push({ code: 'en', name: 'English', installed: true, updateAvailable: false, inUse: current === 'en' });
    }
    result.sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.name.localeCompare(b.name)));
    return result;
  });

  const listRemote = wrap(async (refresh?: boolean): Promise<LanguageInfo[]> => {
    // refresh = the person pressed the refresh button: forget cached files and download data.json again.
    if (refresh === true) remoteCache.clear();
    const data = await deps.getDataJson(refresh === true ? { refresh: true } : undefined);
    const current = deps.getSettings().language;
    const installed = await readInstalled();
    const items = await Promise.all(data.languages.map((entry) => downloadRemote(entry, false)));
    return data.languages.map((entry, index) => {
      const record = installed[entry.code];
      const isInstalled = record !== undefined && fs.existsSync(languageFilePath(entry.code));
      return {
        code: entry.code,
        name: entry.name,
        installed: isInstalled,
        updateAvailable: isInstalled && record.sha256 !== items[index].sha256,
        inUse: entry.code === current,
      };
    });
  });

  const install = wrap(async (code: string): Promise<void> => {
    await installCode(code);
  });

  const update = wrap(async (code: string): Promise<void> => {
    await updateCode(code);
  });

  const remove = wrap(async (code: string): Promise<void> => {
    assertCode(code);
    if (code === 'en' || code === deps.getSettings().language) {
      throw new AppException('INVALID_INPUT', 'This language cannot be removed', { code });
    }
    const target = languageFilePath(code);
    await fsp.rm(target, { force: true });
    await fsp.rm(`${target}.bak`, { force: true });
    const installed = await readInstalled();
    if (installed[code]) {
      delete installed[code];
      await writeInstalled(installed);
    }
    dictionaryCache.delete(code);
    remoteCache.delete(code);
  });

  const installAll = wrap(async (): Promise<void> => {
    const remote = await listRemote();
    await runEach(remote.filter((l) => !l.installed).map((l) => l.code), installCode);
  });

  const updateAll = wrap(async (): Promise<void> => {
    const installedLanguages = await listInstalled();
    const data = await deps.getDataJson();
    const codes = installedLanguages.filter((l) => data.languages.some((r) => r.code === l.code)).map((l) => l.code);
    await runEach(codes, updateCode);
  });

  const removeAll = wrap(async (): Promise<void> => {
    if (deps.getSettings().language !== 'en') {
      await deps.setLanguage('en');
    }
    const names = await fsp.readdir(languageDir).catch(() => [] as string[]);
    const installed = await readInstalled();
    for (const fileName of names) {
      if (fileName === INSTALLED_FILE || fileName === SEEDED_FILE || fileName === 'en.json' || fileName === 'en.json.bak') continue;
      const match = /^([A-Za-z0-9-]+)\.json(\.bak)?$/.exec(fileName);
      if (!match) continue;
      await fsp.rm(path.join(languageDir, fileName), { force: true });
      delete installed[match[1]];
      dictionaryCache.delete(match[1]);
      remoteCache.delete(match[1]);
    }
    await writeInstalled(installed);
  });

  const getDictionary = wrap(async (code: string): Promise<Dictionary> => {
    assertCode(code);
    const base = getBaseDictionary();
    if (code === 'en') return { ...base };
    const overlay = readDictionaryFile(languageFilePath(code), code);
    return overlay ? { ...base, ...overlay } : { ...base };
  });

  const openFolder = wrap(async (): Promise<void> => {
    await fsp.mkdir(languageDir, { recursive: true });
    const message = await shell.openPath(languageDir);
    if (message) throw new AppException('UNKNOWN', message);
  });

  return {
    listInstalled,
    listRemote,
    install,
    update,
    remove,
    installAll,
    updateAll,
    removeAll,
    getDictionary,
    openFolder,
  };
}
