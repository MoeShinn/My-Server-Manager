// FILE: src/renderer/pages/server/utils.ts
import type { ErrorCode } from '@shared/types';

/** Lowercase, strip diacritics (NFD) and map đ to d, for accent-insensitive search. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/** Under 1024 -> "512 MB"; from 1024 -> "10.0 GB". */
export function formatMb(mb: number): string {
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** MB -> GB text with one decimal, no unit (e.g. "2.0"). */
export function mbToGbText(mb: number): string {
  return (mb / 1024).toFixed(1);
}

/** Seconds -> "hh:mm:ss" (hours are not capped, e.g. "49:03:04"). */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Copies text to the clipboard. Returns true on success. The "copied" toast is shown by useCopy() in hooks.ts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** "1.21.4" -> "1.21", "26.1.2" -> "26.1". Anything unparsable is returned as-is. */
export function groupOf(mcVersion: string | null): string {
  if (!mcVersion) return 'unknown';
  const m = /^(\d+)\.(\d+)/.exec(mcVersion);
  return m ? `${m[1]}.${m[2]}` : mcVersion;
}

/** Directory part of an absolute path (handles both / and \). */
export function dirOf(absPath: string): string {
  const i = Math.max(absPath.lastIndexOf('/'), absPath.lastIndexOf('\\'));
  return i > 0 ? absPath.slice(0, i) : absPath;
}

export function stripJarExt(name: string): string {
  return name.replace(/\.jar$/i, '');
}

/** Removes Minecraft colour codes (the section sign followed by one character). */
export function stripMcColors(s: string): string {
  return s.replace(/\u00a7./g, '');
}

/** Safely reads code/params from an error thrown by window.api. */
export function apiErrorInfo(e: unknown): { code: ErrorCode; params?: Record<string, string | number> } {
  if (typeof e === 'object' && e !== null) {
    const o = e as { code?: unknown; params?: unknown };
    const code = typeof o.code === 'string' ? (o.code as ErrorCode) : 'UNKNOWN';
    const params =
      typeof o.params === 'object' && o.params !== null ? (o.params as Record<string, string | number>) : undefined;
    return { code, params };
  }
  return { code: 'UNKNOWN' };
}

export type HostCheck = { ok: true; value: string } | { ok: false; errorKey: string };

/** Validation for the custom IP / domain field. */
export function validateHost(raw: string): HostCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, errorKey: 'srv.ip.error.empty' };
  if (value.length > 253) return { ok: false, errorKey: 'srv.ip.error.tooLong' };
  if (value.includes('://')) return { ok: false, errorKey: 'srv.ip.error.scheme' };
  if (/\s/.test(value)) return { ok: false, errorKey: 'srv.ip.error.spaces' };
  return { ok: true, value };
}

/** Fixed palette (about 10 colours) for version badges; text on top is always white. */
const VERSION_PALETTE: string[] = [
  'hsl(210 45% 30%)',
  'hsl(150 45% 26%)',
  'hsl(280 40% 34%)',
  'hsl(30 55% 32%)',
  'hsl(340 45% 34%)',
  'hsl(180 45% 26%)',
  'hsl(60 45% 28%)',
  'hsl(250 42% 36%)',
  'hsl(10 50% 32%)',
  'hsl(120 38% 27%)'
];

export function versionColor(group: string): string {
  let hash = 0;
  for (let i = 0; i < group.length; i++) hash = (hash * 31 + group.charCodeAt(i)) >>> 0;
  return VERSION_PALETTE[hash % VERSION_PALETTE.length];
}
