// FILE: src/main/services/content/sources/fill.ts
// PaperMC Fill v3 (paper, folia, velocity). The old api.papermc.io v2 is gone and is NOT used.
import { AppException } from '../../../../shared/types';
import type { VersionEntry } from '../../../../shared/types';
import { groupOf } from '../compare';
import { asArray, asIdString, asRecord, asString, isRecord } from '../json';
import { enc, mapLimit } from '../util';
import { MAX_BUILDS_PER_VERSION, compareBuild, pickBestBuild } from './types';
import type { ServerSource } from './types';

const BASE = 'https://fill.papermc.io/v3/projects';

interface FillBuild {
  build: string;
  stable: boolean;
  url: string | null;
  sha256: string | null;
}

/** `versions` is an object grouped by line ({ "1.21": ["1.21.11", ...] }); a flat array is accepted too. */
function parseVersionList(raw: unknown): string[] {
  const versions = asRecord(raw).versions;
  const out: string[] = [];
  const pushAny = (v: unknown): void => {
    if (typeof v === 'string' && v.length > 0) out.push(v);
    else if (isRecord(v)) {
      const id = asString(v.id) ?? asString(v.version);
      if (id) out.push(id);
    }
  };
  if (Array.isArray(versions)) versions.forEach(pushAny);
  else if (isRecord(versions)) {
    for (const group of Object.values(versions)) asArray(group).forEach(pushAny);
  }
  return Array.from(new Set(out));
}

function parseBuilds(raw: unknown): FillBuild[] {
  const list = Array.isArray(raw) ? raw : asArray(asRecord(raw).builds);
  const out: FillBuild[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const build = asIdString(item.id);
    if (!build) continue;
    const channel = (asString(item.channel) ?? '').toUpperCase();
    const downloads = asRecord(item.downloads);
    let entry = downloads['server:default'];
    if (!isRecord(entry)) {
      entry = Object.values(downloads).find((d) => isRecord(d) && asString(d.url) !== null);
    }
    const dl = asRecord(entry);
    out.push({
      build,
      stable: channel === 'STABLE' || channel === 'RECOMMENDED',
      url: asString(dl.url),
      sha256: asString(asRecord(dl.checksums).sha256)
    });
  }
  return out;
}

export function createFillSource(project: 'paper' | 'folia' | 'velocity'): ServerSource {
  const buildsUrl = (version: string): string => `${BASE}/${project}/versions/${enc(version)}/builds`;

  return {
    async list(ctx) {
      const versions = parseVersionList(await ctx.http.getJson(`${BASE}/${project}`));
      if (versions.length === 0) throw new AppException('DOWNLOAD_FAILED', `${project}: empty version list`);

      let failures = 0;
      let firstError: unknown;
      // One request per version; at most 8 at the same time.
      const perVersion = await mapLimit(versions, 8, async (version) => {
        try {
          return { version, builds: parseBuilds(await ctx.http.getJson(buildsUrl(version))) };
        } catch (e) {
          failures++;
          firstError ??= e;
          ctx.log.warn(`${project} ${version}: could not read builds`);
          return { version, builds: [] as FillBuild[] };
        }
      });
      // Everything failed (probably offline): let the caller fall back to its cache.
      if (failures === versions.length) throw firstError;

      const entries: VersionEntry[] = [];
      for (const { version, builds } of perVersion) {
        builds.sort((a, b) => compareBuild(b.build, a.build));
        for (const b of builds.slice(0, MAX_BUILDS_PER_VERSION)) {
          entries.push({ mcVersion: version, build: b.build, group: groupOf(version), stable: b.stable });
        }
      }
      return entries;
    },

    async resolve(ctx, mcVersion, build) {
      const builds = parseBuilds(await ctx.http.getJson(buildsUrl(mcVersion)));
      const picked = build !== null ? builds.find((b) => b.build === build) : pickBestBuild(builds);
      if (!picked || !picked.url) {
        throw new AppException('NOT_FOUND', `${project} ${mcVersion} build ${build ?? 'latest'} not found`, {
          version: mcVersion
        });
      }
      // Use the URL exactly as the API gave it.
      return { url: picked.url, hash: picked.sha256 ? { algo: 'sha256', value: picked.sha256 } : undefined };
    }
  };
}
