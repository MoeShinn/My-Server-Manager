// FILE: src/main/services/content/compare.ts
// Pure functions for Minecraft version numbers. Handles both the old style (1.21.11)
// and the new style (26.1, 26.2, 26.1.2), plus suffixes like -pre1, -rc1, -SNAPSHOT.

interface ParsedVersion {
  nums: number[];
  suffix: string;
}

function parse(version: string): ParsedVersion | null {
  const m = /^\s*v?(\d+(?:\.\d+)*)(?:[-_+ ]+(.+?))?\s*$/i.exec(version);
  if (!m) return null;
  const nums = (m[1] as string).split('.').map((x) => Number(x));
  return { nums, suffix: (m[2] ?? '').toLowerCase() };
}

/** Rank of a pre-release suffix. A real release always beats any suffix of the same number. */
function suffixRank(suffix: string): number {
  if (/^(snapshot|dev|alpha)/.test(suffix)) return 0;
  if (/^beta/.test(suffix)) return 1;
  if (/^pre/.test(suffix)) return 2;
  if (/^rc/.test(suffix)) return 3;
  return 2;
}

function suffixNumber(suffix: string): number {
  const m = /(\d+)/.exec(suffix);
  return m ? Number(m[1]) : 0;
}

/** Returns a negative number when a < b, 0 when equal, a positive number when a > b. */
export function compareMcVersion(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) {
    // Anything that does not look like a version (e.g. "24w14a") sorts below real versions.
    if (pa) return 1;
    if (pb) return -1;
    return a.localeCompare(b);
  }
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const x = pa.nums[i] ?? 0;
    const y = pb.nums[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (pa.suffix === pb.suffix) return 0;
  if (!pa.suffix) return 1;
  if (!pb.suffix) return -1;
  const ra = suffixRank(pa.suffix);
  const rb = suffixRank(pb.suffix);
  if (ra !== rb) return ra > rb ? 1 : -1;
  const na = suffixNumber(pa.suffix);
  const nb = suffixNumber(pb.suffix);
  if (na !== nb) return na > nb ? 1 : -1;
  return pa.suffix.localeCompare(pb.suffix);
}

/** First two numeric parts: 1.21.11 -> "1.21", 26.1.2 -> "26.1", Velocity 3.4.0-SNAPSHOT -> "3.4". */
export function groupOf(version: string): string {
  const p = parse(version);
  if (!p) return version;
  return p.nums.slice(0, 2).join('.');
}

/** True for plain release numbers such as "1.21.11" or "26.1" (no -pre/-rc/-snapshot suffix). */
export function isReleaseVersion(version: string): boolean {
  const p = parse(version);
  return p !== null && p.suffix === '';
}
