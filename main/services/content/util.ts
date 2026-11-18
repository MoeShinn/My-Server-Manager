// FILE: src/main/services/content/util.ts
import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const enc = (s: string): string => encodeURIComponent(s);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `fn` over all items with at most `limit` running at the same time. Keeps result order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const count = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Reads and parses a JSON file. Returns null when missing or broken. */
export async function readJsonFile(p: string): Promise<unknown> {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** Writes JSON to a temp file first, then renames, so readers never see half a file. */
export async function writeJsonAtomic(p: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tmp, p);
}

/** Recursive delete that retries, because Windows often keeps files locked for a moment. */
export async function rmRetry(p: string): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      await fsp.rm(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (e) {
      lastError = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastError;
}

export async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSizeBytes(full);
    } else if (entry.isFile()) {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        // file vanished while scanning, ignore
      }
    }
  }
  return total;
}
