// FILE: src/main/services/content/json.ts
// Defensive JSON helpers: every value from the network is `unknown` until proven otherwise.

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Non-empty string or null. */
export function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

/** Accepts a string or a number and returns it as a non-empty string. */
export function asIdString(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return asString(v);
}
