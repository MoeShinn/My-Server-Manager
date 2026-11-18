// FILE: src/main/services/engine/stats.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import pidusage from 'pidusage';
import type { Emit, Logger } from '../../../shared/ipc';

async function dirBytes(root: string): Promise<number> {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: import('fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (let i = 0; i < entries.length; i += 100) {
      const batch = entries.slice(i, i + 100);
      const sizes = await Promise.all(batch.map(async (e) => {
        if (e.isSymbolicLink()) return 0;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { stack.push(full); return 0; }
        try { return (await fs.lstat(full)).size; } catch { return 0; }
      }));
      for (const s of sizes) total += s;
    }
  }
  return total;
}

/** Cached folder sizes. Rescans are deduplicated and rate-limited by the callers' maxAge. */
export class DiskUsageCache {
  private readonly entries = new Map<string, { mb: number; at: number }>();
  private readonly inflight = new Map<string, Promise<number>>();

  get(id: string): number | null { return this.entries.get(id)?.mb ?? null; }
  drop(id: string): void { this.entries.delete(id); this.inflight.delete(id); }

  scan(id: string, folder: string): Promise<number> {
    const running = this.inflight.get(id);
    if (running) return running;
    const p = dirBytes(folder).then((bytes) => {
      const mb = Math.round((bytes / 1048576) * 10) / 10;
      this.entries.set(id, { mb, at: Date.now() });
      return mb;
    }).finally(() => this.inflight.delete(id));
    this.inflight.set(id, p);
    return p;
  }

  isStale(id: string, maxAgeMs: number): boolean {
    const e = this.entries.get(id);
    return !e || Date.now() - e.at >= maxAgeMs;
  }

  refreshInBackground(id: string, folder: string, maxAgeMs: number): void {
    if (this.isStale(id, maxAgeMs)) void this.scan(id, folder).catch(() => undefined);
  }
}

export interface ActiveServer { id: string; pid: number; startedAt: number; }

export interface StatsDeps {
  cores: number;
  emit: Emit;
  log: Logger;
  disk: DiskUsageCache;
  getActive(): ActiveServer[];
  getFolder(id: string): string | null;
  getLimitMb(id: string): number | null;
  /** Asks the server for its TPS (answer arrives later through getTps). */
  probeTps(id: string): void;
  getTps(id: string): number | null;
  onStorage(id: string, usedMb: number, limitMb: number): void;
}

export class StatsMonitor {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly last = new Map<string, { cpuPercent: number; ramUsedMb: number }>();

  constructor(private readonly d: StatsDeps) {}

  getLast(id: string): { cpuPercent: number; ramUsedMb: number } {
    return this.last.get(id) ?? { cpuPercent: 0, ramUsedMb: 0 };
  }

  ensureRunning(): void {
    if (!this.timer) this.timer = setInterval(() => { void this.tick(); }, 3000);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const active = this.d.getActive();
      if (active.length === 0) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.last.clear();
        pidusage.clear();
        return;
      }
      for (const s of active) {
        const folder = this.d.getFolder(s.id);
        if (!folder) continue;
        this.d.probeTps(s.id);
        let cpuPercent = 0;
        let ramUsedMb = 0;
        try {
          const u = await pidusage(s.pid);
          cpuPercent = Math.round(Math.min(100, Math.max(0, u.cpu / this.d.cores)) * 10) / 10;
          ramUsedMb = Math.round(u.memory / 1048576);
        } catch { /* process may have just exited */ }
        this.last.set(s.id, { cpuPercent, ramUsedMb });
        this.d.disk.refreshInBackground(s.id, folder, 30000);
        const diskUsedMb = this.d.disk.get(s.id) ?? 0;
        this.d.emit('server:stats', {
          id: s.id,
          stats: { cpuPercent, ramUsedMb, diskUsedMb, uptimeSec: Math.floor((Date.now() - s.startedAt) / 1000), tps: this.d.getTps(s.id) },
        });
        const limit = this.d.getLimitMb(s.id);
        if (limit !== null) this.d.onStorage(s.id, diskUsedMb, limit);
      }
    } catch (e) {
      this.d.log.error('stats tick failed', e);
    } finally {
      this.busy = false;
    }
  }
}
