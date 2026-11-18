// FILE: src/main/services/engine/util.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { AppException } from '../../../shared/types';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function isErrno(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && typeof (e as NodeJS.ErrnoException).code === 'string';
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function toAppException(e: unknown): AppException {
  if (e instanceof AppException) return e;
  if (e instanceof Error && e.name === 'AbortError') return new AppException('CANCELLED');
  return new AppException('UNKNOWN', e instanceof Error ? e.message : String(e));
}

const ID_PATTERN = /^[a-z0-9-]{3,40}$/;
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  return base || 'server';
}

export function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (const b of randomBytes(4)) out += chars[b % chars.length];
  return out;
}

/** True when child is strictly inside parent. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function readTextIfExists(file: string): Promise<string | null> {
  try { return await fs.readFile(file, 'utf8'); } catch (e) {
    if (isErrno(e) && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null;
    throw e;
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { await fs.rename(from, to); return; } catch (e) {
      const retryable = isErrno(e) && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES');
      if (!retryable || i >= 5) throw e;
      await sleep(60 * (i + 1));
    }
  }
}

/** Write to a temp file, then rename over the target. */
export async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await renameWithRetry(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

/** Remove a directory; Windows often reports files as locked for a moment. */
export async function rmWithRetry(target: string): Promise<void> {
  let last: unknown = null;
  for (let i = 0; i < 4; i++) {
    try {
      await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      return;
    } catch (e) { last = e; await sleep(500 * (i + 1)); }
  }
  throw toAppException(last);
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
