// FILE: src/main/services/content/sources/vanilla.ts
import { AppException } from '../../../../shared/types';
import type { VersionEntry } from '../../../../shared/types';
import { compareMcVersion, groupOf } from '../compare';
import { asArray, asRecord, asString, isRecord } from '../json';
import type { ServerSource, SourceCtx } from './types';

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
// Releases older than 1.2.5 have no server jar.
const OLDEST = '1.2.5';

interface ManifestItem {
  id: string;
  url: string;
}

async function readManifest(ctx: SourceCtx): Promise<ManifestItem[]> {
  const root = await ctx.http.getJson(MANIFEST);
  const out: ManifestItem[] = [];
  for (const item of asArray(asRecord(root).versions)) {
    if (!isRecord(item) || item.type !== 'release') continue;
    const id = asString(item.id);
    const url = asString(item.url);
    if (!id || !url || compareMcVersion(id, OLDEST) < 0) continue;
    out.push({ id, url });
  }
  return out;
}

export const vanillaSource: ServerSource = {
  async list(ctx) {
    const items = await readManifest(ctx);
    return items.map<VersionEntry>((i) => ({ mcVersion: i.id, build: null, group: groupOf(i.id), stable: true }));
  },

  async resolve(ctx, mcVersion) {
    const item = (await readManifest(ctx)).find((i) => i.id === mcVersion);
    if (!item) throw new AppException('NOT_FOUND', `Vanilla ${mcVersion} not found`, { version: mcVersion });
    const meta = await ctx.http.getJson(item.url);
    const server = asRecord(asRecord(asRecord(meta).downloads).server);
    const url = asString(server.url);
    if (!url) throw new AppException('NOT_FOUND', `Vanilla ${mcVersion} has no server download`, { version: mcVersion });
    const sha1 = asString(server.sha1);
    return { url, hash: sha1 ? { algo: 'sha1', value: sha1 } : undefined };
  }
};
