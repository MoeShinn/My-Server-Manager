// FILE: src/main/services/engine/properties.ts
import * as path from 'path';
import { AppException } from '../../../shared/types';
import { readTextIfExists, writeFileAtomic } from './util';

function sepIndex(line: string): number {
  const eq = line.indexOf('=');
  return eq >= 0 ? eq : line.indexOf(':');
}
const isSkippable = (t: string): boolean => t === '' || t.startsWith('#') || t.startsWith('!');

export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trimStart();
    if (isSkippable(t)) continue;
    const idx = sepIndex(t);
    if (idx < 0) { out[t.trimEnd()] = ''; continue; }
    out[t.slice(0, idx).trim()] = t.slice(idx + 1);
  }
  return out;
}

/** Edit existing lines in place, append new keys at the end, keep comments and order. */
export function applyProperties(text: string, patch: Record<string, string>): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text === '' ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const handled = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (isSkippable(t)) continue;
    const idx = sepIndex(t);
    const key = (idx < 0 ? t : t.slice(0, idx)).trim();
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      lines[i] = `${key}=${patch[key]}`;
      handled.add(key);
    }
  }
  for (const key of Object.keys(patch)) {
    if (!handled.has(key)) lines.push(`${key}=${patch[key]}`);
  }
  return lines.join(eol) + eol;
}

export function validatePropertiesPatch(patch: unknown): Record<string, string> {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new AppException('INVALID_INPUT');
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new AppException('INVALID_INPUT', `Invalid value for ${key}`);
    if (!key || /[=:\s\r\n]/.test(key) || key.startsWith('#') || key.startsWith('!')) throw new AppException('INVALID_INPUT', `Invalid key ${key}`);
    out[key] = value;
  }
  return out;
}

const propsFile = (folder: string): string => path.join(folder, 'server.properties');

export async function readProperties(folder: string): Promise<Record<string, string>> {
  const text = await readTextIfExists(propsFile(folder));
  return text === null ? {} : parseProperties(text);
}

export async function writeProperties(folder: string, patch: Record<string, string>): Promise<void> {
  const text = (await readTextIfExists(propsFile(folder))) ?? '';
  await writeFileAtomic(propsFile(folder), applyProperties(text, patch));
}

export async function readMaxPlayers(folder: string): Promise<number> {
  const n = Number.parseInt((await readProperties(folder))['max-players'] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/** Keep server-port (or Velocity's bind) in step with settings.port. */
export async function syncPortToFiles(folder: string, port: number, velocity: boolean): Promise<void> {
  if (velocity) {
    const file = path.join(folder, 'velocity.toml');
    const text = await readTextIfExists(file);
    if (text === null) return;
    const next = text.replace(/^(\s*bind\s*=\s*"[^"]*):(\d+)(")/m, `$1:${port}$3`);
    if (next !== text) await writeFileAtomic(file, next);
    return;
  }
  const current = (await readProperties(folder))['server-port'];
  if (current !== String(port)) await writeProperties(folder, { 'server-port': String(port) });
}
