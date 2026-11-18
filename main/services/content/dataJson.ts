// FILE: src/main/services/content/dataJson.ts
import path from 'node:path';
import { AppException } from '../../../shared/types';
import type { AppConfig, AppPaths, AppSettings, DataJson } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import type { Http } from './http';
import { asArray, asNumber, asRecord, asString, isRecord } from './json';
import { readJsonFile, writeJsonAtomic } from './util';

const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type JavaPkg = DataJson['javaDownloads'][string]['windowsX64'];

function parsePkg(v: unknown): JavaPkg {
  if (!isRecord(v)) return null;
  const url = asString(v.url);
  const archive = v.archive === 'zip' || v.archive === 'tar.gz' ? v.archive : null;
  if (!url || !archive) return null;
  return { url, sha256: asString(v.sha256), archive };
}

/** Light validation: returns a clean DataJson, or null when the shape is clearly wrong. */
export function parseDataJson(raw: unknown): DataJson | null {
  if (!isRecord(raw)) return null;
  const schemaVersion = asNumber(raw.schemaVersion);
  if (schemaVersion === null) return null;

  const java: DataJson['java'] = [];
  for (const item of asArray(raw.java)) {
    if (!isRecord(item)) continue;
    const minMc = asString(item.minMc);
    const major = asNumber(item.java);
    if (minMc && major !== null) java.push({ minMc, java: major });
  }
  if (java.length === 0) return null;

  const javaDownloads: DataJson['javaDownloads'] = {};
  for (const [key, value] of Object.entries(asRecord(raw.javaDownloads))) {
    if (!isRecord(value)) continue;
    javaDownloads[key] = { windowsX64: parsePkg(value.windowsX64), linuxX64: parsePkg(value.linuxX64) };
  }

  const pluginLoaders: DataJson['pluginLoaders'] = {};
  for (const [key, value] of Object.entries(asRecord(raw.pluginLoaders))) {
    pluginLoaders[key] = asArray(value).filter((x): x is string => typeof x === 'string');
  }

  const languages: DataJson['languages'] = [];
  for (const item of asArray(raw.languages)) {
    if (!isRecord(item)) continue;
    const code = asString(item.code);
    const name = asString(item.name);
    const file = asString(item.file);
    if (code && name && file) languages.push({ code, name, file });
  }

  return { schemaVersion, java, javaDownloads, pluginLoaders, languages };
}

export function createDataJsonProvider(deps: {
  paths: AppPaths;
  config: AppConfig;
  getSettings(): AppSettings;
  http: Http;
  log: Logger;
}): () => Promise<DataJson> {
  const { paths, config, getSettings, http, log } = deps;
  const cachePath = path.join(paths.cacheDir, 'data.json');
  let inflight: Promise<DataJson> | null = null;

  async function readCache(): Promise<{ fetchedAt: number; data: DataJson } | null> {
    const raw = await readJsonFile(cachePath);
    if (!isRecord(raw)) return null;
    const fetchedAt = asNumber(raw.fetchedAt);
    const data = parseDataJson(raw.data);
    return fetchedAt !== null && data ? { fetchedAt, data } : null;
  }

  async function load(): Promise<DataJson> {
    const cached = await readCache();
    const fresh = cached !== null && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS;
    if (cached && fresh && !getSettings().alwaysFetchFreshVersions) return cached.data;

    // The default config still has the placeholder OWNER/REPO, which would only 404.
    if (/^[\w.-]+\/[\w.-]+$/.test(config.dataRepo)) {
      try {
        const url = `https://raw.githubusercontent.com/${config.dataRepo}/${config.dataBranch}/data.json`;
        const remote = parseDataJson(await http.getJson(url));
        if (remote) {
          await writeJsonAtomic(cachePath, { fetchedAt: Date.now(), data: remote });
          return remote;
        }
        log.warn('Remote data.json has an unexpected shape, ignoring it.');
      } catch (e) {
        log.warn('Could not fetch remote data.json:', e instanceof Error ? e.message : e);
      }
    }

    if (cached) return cached.data;

    const bundled = parseDataJson(await readJsonFile(path.join(paths.resourcesDir, 'data.json')));
    if (bundled) return bundled;

    throw new AppException('NOT_FOUND', 'data.json is not available (remote, cache and bundled copy all failed)');
  }

  return function getDataJson(): Promise<DataJson> {
    if (!inflight) {
      inflight = load().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}
