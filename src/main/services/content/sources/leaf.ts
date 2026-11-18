// FILE: src/main/services/content/sources/leaf.ts
// Leaf: PaperMC-v2-style API, with a GitHub Releases fallback (Winds-Studio/Leaf).
// The exact JSON shape of the Leaf API is NOT confirmed, so everything is read defensively.
import { AppException } from '../../../../shared/types';
import type { VersionEntry } from '../../../../shared/types';
import { groupOf } from '../compare';
import { asArray, asIdString, asRecord, asString, isRecord } from '../json';
import { enc, mapLimit } from '../util';
import { MAX_BUILDS_PER_VERSION, compareBuild, pickBestBuild } from './types';
import type { ResolvedJar, ServerSource, SourceCtx } from './types';

const API = 'https://api.leafmc.one/v2/projects/leaf';
const GITHUB_RELEASES = 'https://api.github.com/repos/Winds-Studio/Leaf/releases?per_page=100';
const GH_PREFIX = 'gh:';

interface LeafBuild {
  build: string;
  stable: boolean;
  fileName: string | null;
  sha256: string | null;
}

function parseVersions(raw: unknown): string[] {
  const versions = asRecord(raw).versions;
  const out: string[] = [];
  if (Array.isArray(versions)) {
    for (const v of versions) if (typeof v === 'string' && v.length > 0) out.push(v);
  } else if (isRecord(versions)) {
    for (const group of Object.values(versions)) {
      for (const v of asArray(group)) if (typeof v === 'string' && v.length > 0) out.push(v);
    }
  }
  return Array.from(new Set(out));
}

/** Builds can be plain numbers ([1, 2, 3]) or objects ({ build, channel, downloads }). */
function parseBuilds(raw: unknown): LeafBuild[] {
  const list = Array.isArray(raw) ? raw : asArray(asRecord(raw).builds);
  const out: LeafBuild[] = [];
  for (const item of list) {
    if (isRecord(item)) {
      const build = asIdString(item.build) ?? asIdString(item.id);
      if (!build) continue;
      const channel = (asString(item.channel) ?? '').toLowerCase();
      const experimental =
        item.experimental === true || /experimental|alpha|beta/.test(channel);
      const app = asRecord(asRecord(item.downloads).application);
      out.push({ build, stable: !experimental, fileName: asString(app.name), sha256: asString(app.sha256) });
    } else {
      const build = asIdString(item);
      if (build) out.push({ build, stable: true, fileName: null, sha256: null });
    }
  }
  return out;
}

async function fetchBuilds(ctx: SourceCtx, version: string): Promise<LeafBuild[]> {
  try {
    const rich = parseBuilds(await ctx.http.getJson(`${API}/versions/${enc(version)}/builds`));
    if (rich.length > 0) return rich;
  } catch {
    // fall through to the plain endpoint
  }
  return parseBuilds(await ctx.http.getJson(`${API}/versions/${enc(version)}`));
}

// ---- GitHub fallback ----

interface GhRelease {
  tag: string;
  mcVersion: string;
  stable: boolean;
  url: string;
  sha256: string | null;
}

async function fetchGithubReleases(ctx: SourceCtx): Promise<GhRelease[]> {
  const raw = await ctx.http.getJson(GITHUB_RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
  const out: GhRelease[] = [];
  for (const rel of asArray(raw)) {
    if (!isRecord(rel) || rel.draft === true) continue;
    const tag = asString(rel.tag_name);
    if (!tag) continue;
    const jar = asArray(rel.assets).find(
      (a): a is Record<string, unknown> =>
        isRecord(a) && /\.jar$/i.test(asString(a.name) ?? '') && !/(sources|javadoc)/i.test(asString(a.name) ?? '')
    );
    if (!jar) continue;
    const url = asString(jar.browser_download_url);
    if (!url) continue;
    const haystack = [tag, asString(rel.name) ?? '', asString(jar.name) ?? ''];
    let mcVersion: string | null = null;
    for (const h of haystack) {
      const m = /(\d+\.\d+(?:\.\d+)?)/.exec(h);
      if (m) {
        mcVersion = m[1] as string;
        break;
      }
    }
    if (!mcVersion) continue;
    const digest = asString(jar.digest);
    out.push({
      tag,
      mcVersion,
      stable: rel.prerelease !== true,
      url,
      sha256: digest && digest.startsWith('sha256:') ? digest.slice(7) : null
    });
  }
  return out;
}

async function listFromGithub(ctx: SourceCtx): Promise<VersionEntry[]> {
  const seen = new Set<string>();
  const entries: VersionEntry[] = [];
  // The API returns newest first; keep only the newest release per Minecraft version.
  for (const r of await fetchGithubReleases(ctx)) {
    if (seen.has(r.mcVersion)) continue;
    seen.add(r.mcVersion);
    entries.push({ mcVersion: r.mcVersion, build: `${GH_PREFIX}${r.tag}`, group: groupOf(r.mcVersion), stable: r.stable });
  }
  return entries;
}

async function resolveFromGithub(ctx: SourceCtx, mcVersion: string, build: string | null): Promise<ResolvedJar> {
  const releases = await fetchGithubReleases(ctx);
  const tag = build !== null && build.startsWith(GH_PREFIX) ? build.slice(GH_PREFIX.length) : null;
  const found = tag !== null ? releases.find((r) => r.tag === tag) : releases.find((r) => r.mcVersion === mcVersion);
  if (!found) throw new AppException('NOT_FOUND', `leaf ${mcVersion} not found on GitHub`, { version: mcVersion });
  return { url: found.url, hash: found.sha256 ? { algo: 'sha256', value: found.sha256 } : undefined };
}

// ---- Public source ----

async function listFromApi(ctx: SourceCtx): Promise<VersionEntry[]> {
  const versions = parseVersions(await ctx.http.getJson(API));
  if (versions.length === 0) throw new AppException('DOWNLOAD_FAILED', 'leaf: empty version list');
  let failures = 0;
  let firstError: unknown;
  const perVersion = await mapLimit(versions, 8, async (version) => {
    try {
      return { version, builds: await fetchBuilds(ctx, version) };
    } catch (e) {
      failures++;
      firstError ??= e;
      return { version, builds: [] as LeafBuild[] };
    }
  });
  if (failures === versions.length) throw firstError;
  const entries: VersionEntry[] = [];
  for (const { version, builds } of perVersion) {
    builds.sort((a, b) => compareBuild(b.build, a.build));
    for (const b of builds.slice(0, MAX_BUILDS_PER_VERSION)) {
      entries.push({ mcVersion: version, build: b.build, group: groupOf(version), stable: b.stable });
    }
  }
  return entries;
}

export const leafSource: ServerSource = {
  async list(ctx) {
    try {
      const fromApi = await listFromApi(ctx);
      if (fromApi.length > 0) return fromApi;
    } catch (apiError) {
      ctx.log.warn('Leaf API unavailable, trying GitHub Releases:', apiError instanceof Error ? apiError.message : apiError);
      try {
        const fromGithub = await listFromGithub(ctx);
        if (fromGithub.length > 0) return fromGithub;
      } catch {
        // report the original API error below
      }
      throw apiError;
    }
    const fallback = await listFromGithub(ctx);
    if (fallback.length === 0) throw new AppException('DOWNLOAD_FAILED', 'leaf: no versions found');
    return fallback;
  },

  async resolve(ctx, mcVersion, build) {
    if (build !== null && build.startsWith(GH_PREFIX)) return resolveFromGithub(ctx, mcVersion, build);
    try {
      const builds = await fetchBuilds(ctx, mcVersion);
      const picked = build !== null ? builds.find((b) => b.build === build) : pickBestBuild(builds);
      if (!picked) throw new AppException('NOT_FOUND', `leaf ${mcVersion} build ${build ?? 'latest'} not found`, { version: mcVersion });
      const file = picked.fileName ?? `leaf-${mcVersion}-${picked.build}.jar`;
      return {
        url: `${API}/versions/${enc(mcVersion)}/builds/${enc(picked.build)}/downloads/${enc(file)}`,
        hash: picked.sha256 ? { algo: 'sha256', value: picked.sha256 } : undefined
      };
    } catch (e) {
      if (build !== null) throw e;
      ctx.log.warn('Leaf API failed while resolving, trying GitHub Releases');
      return resolveFromGithub(ctx, mcVersion, null);
    }
  }
};
