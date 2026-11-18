// FILE: src/main/services/content/versions.ts
import path from 'node:path';
import { AppException } from '../../../shared/types';
import type { AppPaths, AppSettings, ServerSoftware, VersionEntry } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import { compareMcVersion } from './compare';
import type { Http } from './http';
import { asArray, asNumber, asString, isRecord } from './json';
import { fabricSource } from './sources/fabric';
import { createFillSource } from './sources/fill';
import { leafSource } from './sources/leaf';
import { purpurSource } from './sources/purpur';
import { MAX_BUILDS_PER_VERSION, compareBuild, pickBestBuild } from './sources/types';
import type { ResolvedJar, ServerSource, SourceCtx } from './sources/types';
import { vanillaSource } from './sources/vanilla';
import { readJsonFile, writeJsonAtomic } from './util';

const SOURCES: Partial<Record<ServerSoftware, ServerSource>> = {
  vanilla: vanillaSource,
  paper: createFillSource('paper'),
  folia: createFillSource('folia'),
  velocity: createFillSource('velocity'),
  purpur: purpurSource,
  leaf: leafSource,
  fabric: fabricSource
};

function sourceFor(software: ServerSoftware): ServerSource {
  const source = SOURCES[software];
  if (!source) throw new AppException('INVALID_INPUT', `No download source for ${software}`);
  return source;
}

function parseCachedEntries(raw: unknown): VersionEntry[] {
  const out: VersionEntry[] = [];
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    const mcVersion = asString(item.mcVersion);
    const group = asString(item.group);
    if (!mcVersion || !group || typeof item.stable !== 'boolean') continue;
    const build = typeof item.build === 'string' ? item.build : null;
    out.push({ mcVersion, build, group, stable: item.stable });
  }
  return out;
}

/** Newest version first; inside one version the biggest build first. */
function sortEntries(list: VersionEntry[]): VersionEntry[] {
  return list.sort((a, b) => compareMcVersion(b.mcVersion, a.mcVersion) || compareBuild(b.build, a.build));
}

function filterEntries(all: VersionEntry[], showDuplicateBuilds: boolean): VersionEntry[] {
  const byVersion = new Map<string, VersionEntry[]>();
  for (const e of sortEntries([...all])) {
    const bucket = byVersion.get(e.mcVersion);
    if (bucket) bucket.push(e);
    else byVersion.set(e.mcVersion, [e]);
  }
  const out: VersionEntry[] = [];
  for (const bucket of byVersion.values()) {
    if (showDuplicateBuilds) {
      out.push(...bucket.slice(0, MAX_BUILDS_PER_VERSION));
    } else {
      const best = pickBestBuild(bucket) ?? bucket[0];
      if (best) out.push(best);
    }
  }
  return out;
}

export interface Versions {
  listVersions(software: ServerSoftware, opts: { forceRefresh?: boolean }): Promise<VersionEntry[]>;
  resolveJar(software: ServerSoftware, mcVersion: string, build: string | null): Promise<ResolvedJar>;
}

export function createVersions(deps: {
  paths: AppPaths;
  getSettings(): AppSettings;
  http: Http;
  log: Logger;
}): Versions {
  const { paths, getSettings, http, log } = deps;
  const ctx: SourceCtx = { http, log };
  const inflight = new Map<ServerSoftware, Promise<VersionEntry[]>>();

  async function loadAll(software: ServerSoftware, forceRefresh: boolean): Promise<VersionEntry[]> {
    const cachePath = path.join(paths.cacheDir, `versions-${software}.json`);
    const raw = await readJsonFile(cachePath);
    let cached: { fetchedAt: number; entries: VersionEntry[] } | null = null;
    if (isRecord(raw)) {
      const fetchedAt = asNumber(raw.fetchedAt);
      const entries = parseCachedEntries(raw.entries);
      if (fetchedAt !== null && entries.length > 0) cached = { fetchedAt, entries };
    }

    const settings = getSettings();
    const maxAgeMs = Math.max(0, settings.versionCacheDays) * 24 * 60 * 60 * 1000;
    const fresh = cached !== null && Date.now() - cached.fetchedAt < maxAgeMs;
    if (cached && fresh && !settings.alwaysFetchFreshVersions && !forceRefresh) return cached.entries;

    try {
      const entries = await sourceFor(software).list(ctx);
      if (entries.length === 0) throw new AppException('NOT_FOUND', `No versions found for ${software}`);
      await writeJsonAtomic(cachePath, { fetchedAt: Date.now(), entries });
      return entries;
    } catch (e) {
      if (cached) {
        log.warn(`Using old cached versions for ${software}:`, e instanceof Error ? e.message : e);
        return cached.entries;
      }
      throw e;
    }
  }

  async function listVersions(software: ServerSoftware, opts: { forceRefresh?: boolean }): Promise<VersionEntry[]> {
    if (software === 'custom') return [];
    sourceFor(software);
    let pending = inflight.get(software);
    if (!pending) {
      pending = loadAll(software, opts.forceRefresh === true).finally(() => inflight.delete(software));
      inflight.set(software, pending);
    }
    const all = await pending;
    return filterEntries(all, getSettings().showDuplicateBuilds);
  }

  async function resolveJar(software: ServerSoftware, mcVersion: string, build: string | null): Promise<ResolvedJar> {
    return sourceFor(software).resolve(ctx, mcVersion, build);
  }

  return { listVersions, resolveJar };
}
