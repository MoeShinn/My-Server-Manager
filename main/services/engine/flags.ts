// FILE: src/main/services/engine/flags.ts
import { AppException } from '../../../shared/types';
import type { JvmFlag, ServerConfig } from '../../../shared/types';

/** Aikar-style flag set. Ids are fixed: the UI relies on them for descriptions. */
export function suggestFlags(ramMb: number, javaMajor: number): JvmFlag[] {
  if (javaMajor <= 7) return [];
  const big = ramMb > 12288;
  const f = (id: string, value: string, enabled = true): JvmFlag => ({ id, value, enabled });
  return [
    f('g1gc', '-XX:+UseG1GC'),
    f('parallel-ref-proc', '-XX:+ParallelRefProcEnabled'),
    f('max-gc-pause', '-XX:MaxGCPauseMillis=200'),
    f('unlock-experimental', '-XX:+UnlockExperimentalVMOptions'),
    f('disable-explicit-gc', '-XX:+DisableExplicitGC'),
    f('always-pre-touch', '-XX:+AlwaysPreTouch', ramMb >= 4096),
    f('g1-new-size', `-XX:G1NewSizePercent=${big ? 40 : 30}`),
    f('g1-max-new-size', `-XX:G1MaxNewSizePercent=${big ? 50 : 40}`),
    f('g1-heap-region', `-XX:G1HeapRegionSize=${big ? '16M' : '8M'}`),
    f('g1-reserve', `-XX:G1ReservePercent=${big ? 15 : 20}`),
    f('g1-heap-waste', '-XX:G1HeapWastePercent=5'),
    f('g1-mixed-count', '-XX:G1MixedGCCountTarget=4'),
    f('ihop', `-XX:InitiatingHeapOccupancyPercent=${big ? 20 : 15}`),
    f('g1-mixed-live', '-XX:G1MixedGCLiveThresholdPercent=90'),
    f('g1-rset', '-XX:G1RSetUpdatingPauseTimePercent=5'),
    f('survivor-ratio', '-XX:SurvivorRatio=32'),
    f('perf-disable', '-XX:+PerfDisableSharedMem'),
    f('max-tenuring', '-XX:MaxTenuringThreshold=1'),
    f('aikar-flag', '-Dusing.aikars.flags=https://mcflags.emc.gs'),
    f('aikar-new', '-Daikars.new.flags=true'),
  ];
}

export function flagsEqual(a: JvmFlag[], b: JvmFlag[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.value === b[i].value && x.enabled === b[i].enabled);
}

export function validateFlags(flags: unknown): JvmFlag[] {
  if (!Array.isArray(flags) || flags.length > 200) throw new AppException('INVALID_INPUT', 'flags must be an array');
  return flags.map((raw): JvmFlag => {
    const f = raw as Partial<JvmFlag> | null;
    if (!f || typeof f.id !== 'string' || !f.id || typeof f.value !== 'string' || typeof f.enabled !== 'boolean') {
      throw new AppException('INVALID_INPUT', 'Invalid flag entry');
    }
    if (!f.value.startsWith('-') || /\s/.test(f.value)) throw new AppException('INVALID_INPUT', `Invalid flag ${f.id}`);
    return { id: f.id, value: f.value, enabled: f.enabled };
  });
}

export function validateJarName(jarFile: unknown): string {
  if (typeof jarFile !== 'string' || !/\.jar$/i.test(jarFile) || /[\\/\0]/.test(jarFile) || jarFile.includes('..')) {
    throw new AppException('INVALID_INPUT', 'Invalid jar file name');
  }
  return jarFile;
}

/** Arguments after the java executable. Memory flags from the list are dropped to avoid duplicates. */
export function buildLaunchArgs(cfg: ServerConfig): string[] {
  const ram = cfg.settings.ramMb;
  const args = [`-Xms${ram}M`, `-Xmx${ram}M`];
  for (const f of cfg.start.flags) {
    if (f.enabled && !/^-Xm[sx]/i.test(f.value)) args.push(f.value);
  }
  args.push('-jar', cfg.start.jarFile);
  if (cfg.software !== 'velocity') args.push('nogui');
  return args;
}

const quoteBat = (s: string): string => `"${s.replace(/%/g, '%%')}"`;
const quoteSh = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export function buildScript(javaPath: string, args: string[], windows: boolean): string {
  if (windows) {
    const cmd = [quoteBat(javaPath), ...args.map((a) => (/[\s"]/.test(a) ? quoteBat(a) : a.replace(/%/g, '%%')))].join(' ');
    return ['@echo off', 'cd /d %~dp0', cmd, 'pause', ''].join('\r\n');
  }
  const cmd = [quoteSh(javaPath), ...args.map(quoteSh)].join(' ');
  return ['#!/bin/sh', 'cd "$(dirname "$0")" || exit 1', cmd, ''].join('\n');
}
