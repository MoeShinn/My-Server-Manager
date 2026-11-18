// FILE: src/main/services/content/allowedHosts.ts
// Single place that lists which hosts the content service may talk to.
// If a mirror/CDN is blocked by mistake, add its host here.
import { AppException } from '../../../shared/types';

/** Exact host names. */
const EXACT_HOSTS = new Set<string>([
  // Mojang (also covered by the suffix rule below)
  'piston-meta.mojang.com',
  'piston-data.mojang.com',
  // PaperMC Fill v3 (API and download host)
  'fill.papermc.io',
  'fill-data.papermc.io',
  // Purpur, Leaf, Fabric
  'api.purpurmc.org',
  'api.leafmc.one',
  'meta.fabricmc.net',
  // Modrinth API and CDN
  'api.modrinth.com',
  'cdn.modrinth.com',
  // GitHub (data.json, playit agent, Leaf fallback) and its usual release redirect hosts
  'api.github.com',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com'
]);

/** Suffix rules, e.g. every *.papermc.io host. */
const HOST_SUFFIXES = ['.papermc.io', '.mojang.com'];

export function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return EXACT_HOSTS.has(h) || HOST_SUFFIXES.some((s) => h.endsWith(s));
}

/**
 * Validates a URL: must be https, and its host must be allowed.
 * `anyHttps` is only for Java URLs from data.json (data.json belongs to the app owner).
 */
export function assertAllowedUrl(raw: string, opts?: { anyHttps?: boolean }): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppException('DOWNLOAD_FAILED', `Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new AppException('DOWNLOAD_FAILED', `Only https is allowed: ${url.protocol}`);
  }
  if (!opts?.anyHttps && !isAllowedHost(url.hostname)) {
    throw new AppException('DOWNLOAD_FAILED', `Host not allowed: ${url.hostname}`, { host: url.hostname });
  }
  return url;
}
