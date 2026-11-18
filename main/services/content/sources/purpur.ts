// FILE: src/main/services/content/sources/purpur.ts
import { AppException } from '../../../../shared/types';
import type { VersionEntry } from '../../../../shared/types';
import { groupOf } from '../compare';
import { asArray, asIdString, asRecord, isRecord } from '../json';
import { enc, mapLimit } from '../util';
import { MAX_BUILDS_PER_VERSION, compareBuild } from './types';
import type { ServerSource, SourceCtx } from './types';

const BASE = 'https://api.purpurmc.org/v2/purpur';

interface PurpurInfo {
  latest: string | null;
  all: string[];
}

async function readVersion(ctx: SourceCtx, version: string): Promise<PurpurInfo> {
  const info = asRecord(await ctx.http.getJson(`${BASE}/${enc(version)}`));
  const builds = info.builds;
  const all: string[] = [];
  let latest: string | null = null;
  if (Array.isArray(builds)) {
    for (const b of builds) {
      const id = asIdString(b);
      if (id) all.push(id);
    }
  } else if (isRecord(builds)) {
    latest = asIdString(builds.latest);
    for (const b of asArray(builds.all)) {
      const id = asIdString(b);
      if (id) all.push(id);
    }
  }
  all.sort((a, b) => compareBuild(b, a));
  return { latest: latest ?? all[0] ?? null, all };
}

export const purpurSource: ServerSource = {
  async list(ctx) {
    const versions = asArray(asRecord(await ctx.http.getJson(BASE)).versions).filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    );
    if (versions.length === 0) throw new AppException('DOWNLOAD_FAILED', 'purpur: empty version list');

    let failures = 0;
    let firstError: unknown;
    const perVersion = await mapLimit(versions, 8, async (version) => {
      try {
        return { version, info: await readVersion(ctx, version) };
      } catch (e) {
        failures++;
        firstError ??= e;
        return { version, info: { latest: null, all: [] } as PurpurInfo };
      }
    });
    if (failures === versions.length) throw firstError;

    const entries: VersionEntry[] = [];
    for (const { version, info } of perVersion) {
      for (const build of info.all.slice(0, MAX_BUILDS_PER_VERSION)) {
        // Purpur has no release channels, so every build counts as stable.
        entries.push({ mcVersion: version, build, group: groupOf(version), stable: true });
      }
    }
    return entries;
  },

  async resolve(ctx, mcVersion, build) {
    const target = build ?? (await readVersion(ctx, mcVersion)).latest;
    if (!target) throw new AppException('NOT_FOUND', `purpur ${mcVersion} has no builds`, { version: mcVersion });
    // No trustworthy checksum is published, so none is checked.
    return { url: `${BASE}/${enc(mcVersion)}/${enc(target)}/download` };
  }
};
