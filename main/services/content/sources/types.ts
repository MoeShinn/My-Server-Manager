// FILE: src/main/services/content/sources/types.ts
import type { VersionEntry } from '../../../../shared/types';
import type { Logger } from '../../../../shared/ipc';
import type { HashSpec } from '../download';
import type { Http } from '../http';

export interface SourceCtx {
  http: Http;
  log: Logger;
}

export interface ResolvedJar {
  url: string;
  hash?: HashSpec;
}

export interface ServerSource {
  /** Every known build (at most MAX_BUILDS_PER_VERSION per version). Throws when the source is unreachable. */
  list(ctx: SourceCtx): Promise<VersionEntry[]>;
  /** Finds the download URL (and hash when known). build null means newest. */
  resolve(ctx: SourceCtx, mcVersion: string, build: string | null): Promise<ResolvedJar>;
}

export const MAX_BUILDS_PER_VERSION = 50;

/** Numeric compare when both are numbers, text compare otherwise. */
export function compareBuild(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/** Newest build, preferring stable ones. Returns undefined for an empty list. */
export function pickBestBuild<T extends { build: string | null; stable: boolean }>(list: readonly T[]): T | undefined {
  const stable = list.filter((x) => x.stable);
  const pool = stable.length > 0 ? stable : list;
  let best: T | undefined;
  for (const item of pool) {
    if (!best || compareBuild(item.build, best.build) > 0) best = item;
  }
  return best;
}
