// FILE: src/main/services/engine/tps.ts
import type { ServerSoftware } from '../../../shared/types';

/** How long after sending the probe command its output is recognised and hidden from the console. */
export const TPS_PROBE_WINDOW_MS = 1500;

/** Console command that reports tick speed, per software. null = no TPS for this software. */
export function tpsCommand(software: ServerSoftware): string | null {
  switch (software) {
    case 'paper':
    case 'purpur':
    case 'folia':
    case 'leaf':
      return 'tps';
    case 'vanilla':
    case 'fabric':
      return 'tick query'; // vanilla 1.20.3+; older versions answer "Unknown command" and probing stops
    default:
      return null;
  }
}

interface TpsState { tps: number | null; tpsProbeUntil: number; tpsUnsupported: boolean; }

// Paper family: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0" (a leading * means "above 20").
const PAPER_TPS_RE = /TPS from last[^:]*:\s*\*?(\d+(?:\.\d+)?)/i;
// Vanilla: "Average time per tick: 2.5ms (Target: 50.0ms)".
const MSPT_RE = /Average time per tick:\s*(\d+(?:\.\d+)?)\s*ms/i;
// Other lines printed by "tick query"; hidden while the probe is active.
const TICK_NOISE_RE = /Target tick rate|Percentiles|\bP(?:50|95|99)\b|running (?:normally|slow)|sprinting|frozen/i;
const UNKNOWN_RE = /Unknown or incomplete command|Unknown command|<--\[HERE\]/i;

const clampTps = (n: number): number => Math.round(Math.min(20, Math.max(0, n)) * 10) / 10;

/** Returns true when the line belongs to the hidden TPS probe (and was consumed). */
export function handleTpsLine(rt: TpsState, text: string): boolean {
  if (Date.now() > rt.tpsProbeUntil) return false;
  const i = text.indexOf(']: ');
  const content = i >= 0 ? text.slice(i + 3) : text;

  if (UNKNOWN_RE.test(content)) { rt.tpsUnsupported = true; rt.tps = null; return true; }
  const paper = PAPER_TPS_RE.exec(content);
  if (paper) { rt.tps = clampTps(Number(paper[1])); return true; }
  const mspt = MSPT_RE.exec(content);
  if (mspt) { const ms = Number(mspt[1]); rt.tps = ms > 0 ? clampTps(1000 / ms) : 20; return true; }
  return TICK_NOISE_RE.test(content);
}
