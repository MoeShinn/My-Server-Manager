// FILE: src/main/services/engine/players.ts
import * as path from 'path';
import type { PlayerEntry } from '../../../shared/types';
import { readTextIfExists } from './util';

const JOIN_RE = /^([A-Za-z0-9_.]{1,16}) joined the game$/;
const LEAVE_RE = /^([A-Za-z0-9_.]{1,16}) left the game$/;

/** Only the exact join/leave message counts; chat lines never match. */
export function parsePlayerEvent(line: string): { type: 'join' | 'leave'; name: string } | null {
  const i = line.indexOf(']: ');
  if (i < 0) return null;
  const content = line.slice(i + 3).trim();
  const j = JOIN_RE.exec(content);
  if (j) return { type: 'join', name: j[1] };
  const l = LEAVE_RE.exec(content);
  return l ? { type: 'leave', name: l[1] } : null;
}

export async function readUserCache(folder: string): Promise<{ name: string; uuid: string }[]> {
  const text = await readTextIfExists(path.join(folder, 'usercache.json'));
  if (text === null) return [];
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    const out: { name: string; uuid: string }[] = [];
    for (const e of data) {
      if (typeof e === 'object' && e !== null) {
        const { name, uuid } = e as { name?: unknown; uuid?: unknown };
        if (typeof name === 'string' && typeof uuid === 'string') out.push({ name, uuid });
      }
    }
    return out;
  } catch { return []; }
}

export function mergePlayers(cache: { name: string; uuid: string }[], online: string[]): PlayerEntry[] {
  const onlineLower = new Set(online.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const list: PlayerEntry[] = [];
  for (const c of cache) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ name: c.name, uuid: c.uuid, online: onlineLower.has(key) });
  }
  for (const n of online) {
    if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); list.push({ name: n, uuid: null, online: true }); }
  }
  const byName = (a: PlayerEntry, b: PlayerEntry): number => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  return [...list.filter((p) => p.online).sort(byName), ...list.filter((p) => !p.online).sort(byName)];
}
