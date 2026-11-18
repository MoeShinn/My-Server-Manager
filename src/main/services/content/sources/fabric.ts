// FILE: src/main/services/content/sources/fabric.ts
import { AppException } from '../../../../shared/types';
import type { VersionEntry } from '../../../../shared/types';
import { compareMcVersion, groupOf, isReleaseVersion } from '../compare';
import { asArray, asRecord, asString, isRecord } from '../json';
import { enc } from '../util';
import type { ServerSource, SourceCtx } from './types';

const META = 'https://meta.fabricmc.net/v2/versions';
// The Fabric server launcher endpoint only exists for 1.14 and newer.
const OLDEST = '1.14';

/** First entry with stable === true; falls back to the first entry that has a version. */
async function firstStable(ctx: SourceCtx, kind: 'loader' | 'installer'): Promise<string> {
  const list = asArray(await ctx.http.getJson(`${META}/${kind}`)).filter(isRecord);
  const pick = list.find((x) => x.stable === true && asString(x.version)) ?? list.find((x) => asString(x.version));
  const version = pick ? asString(pick.version) : null;
  if (!version) throw new AppException('NOT_FOUND', `Fabric ${kind} version not found`);
  return version;
}

export const fabricSource: ServerSource = {
  async list(ctx) {
    const entries: VersionEntry[] = [];
    for (const item of asArray(await ctx.http.getJson(`${META}/game`))) {
      const rec = asRecord(item);
      const version = asString(rec.version);
      // Skip snapshots (24w14a) and pre/rc builds, and versions too old for Fabric servers.
      if (!version || !isReleaseVersion(version) || compareMcVersion(version, OLDEST) < 0) continue;
      entries.push({ mcVersion: version, build: null, group: groupOf(version), stable: rec.stable === true });
    }
    return entries;
  },

  async resolve(ctx, mcVersion) {
    const [loader, installer] = await Promise.all([firstStable(ctx, 'loader'), firstStable(ctx, 'installer')]);
    // Small launcher jar: it downloads the real Minecraft server on first start (needs internet).
    return { url: `${META}/loader/${enc(mcVersion)}/${enc(loader)}/${enc(installer)}/server/jar` };
  }
};
