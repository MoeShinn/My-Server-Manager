// FILE: src/main/services/engine/store.ts
import * as fsSync from 'fs';
import * as path from 'path';
import { AppException } from '../../../shared/types';
import type { ServerConfig, ServerSoftware, ModKind, JvmFlag } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import { DEFAULT_PORT, DEFAULT_RAM_MB, DEFAULT_STORAGE_LIMIT_MB, MOD_KIND_BY_SOFTWARE, SERVER_META_DIR } from '../../../shared/constants';
import { isRecord, isValidId, randomSuffix, slugify, writeFileAtomic } from './util';

const SOFTWARES: readonly ServerSoftware[] = ['vanilla', 'paper', 'purpur', 'folia', 'leaf', 'fabric', 'velocity', 'custom'];
const MOD_KINDS: readonly ModKind[] = ['plugin', 'mod', 'none'];
export const isServerSoftware = (v: unknown): v is ServerSoftware => typeof v === 'string' && (SOFTWARES as readonly string[]).includes(v);
export const isModKind = (v: unknown): v is ModKind => typeof v === 'string' && (MOD_KINDS as readonly string[]).includes(v);

const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function normalizeFlags(v: unknown): JvmFlag[] {
  if (!Array.isArray(v)) return [];
  const out: JvmFlag[] = [];
  for (const f of v) {
    if (isRecord(f) && typeof f.id === 'string' && typeof f.value === 'string') {
      out.push({ id: f.id, value: f.value, enabled: f.enabled !== false });
    }
  }
  return out;
}

/** Fill missing fields with defaults. Returns null when the data is unusable. */
export function normalizeConfig(raw: unknown, id: string, folder: string): ServerConfig | null {
  if (!isRecord(raw)) return null;
  const software: ServerSoftware = isServerSoftware(raw.software) ? raw.software : 'custom';
  const s = isRecord(raw.settings) ? raw.settings : {};
  const st = isRecord(raw.start) ? raw.start : {};
  const storage = s.storageLimitMb === null ? null : num(s.storageLimitMb, DEFAULT_STORAGE_LIMIT_MB);
  const override = typeof s.javaMajorOverride === 'number' && Number.isFinite(s.javaMajorOverride) ? s.javaMajorOverride : null;
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : id,
    software,
    modKind: isModKind(raw.modKind) ? raw.modKind : MOD_KIND_BY_SOFTWARE[software],
    mcVersion: strOrNull(raw.mcVersion),
    build: strOrNull(raw.build),
    customJarName: strOrNull(raw.customJarName),
    folder,
    createdAt: num(raw.createdAt, Date.now()),
    settings: {
      ramMb: num(s.ramMb, DEFAULT_RAM_MB),
      storageLimitMb: storage,
      autoStart: s.autoStart === true,
      autoRestartOnCrash: s.autoRestartOnCrash === true,
      port: num(s.port, DEFAULT_PORT),
      javaMajorOverride: override,
      customIpHost: strOrNull(s.customIpHost),
    },
    start: {
      jarFile: typeof st.jarFile === 'string' && st.jarFile ? st.jarFile : 'server.jar',
      flags: normalizeFlags(st.flags),
    },
  };
}

export class ServerStore {
  private readonly map = new Map<string, ServerConfig>();

  constructor(readonly serversDir: string, private readonly log: Logger) {}

  /** Synchronous scan so createEngineService can stay synchronous. */
  loadSync(): void {
    fsSync.mkdirSync(this.serversDir, { recursive: true });
    let entries: fsSync.Dirent[];
    try { entries = fsSync.readdirSync(this.serversDir, { withFileTypes: true }); } catch (e) {
      this.log.error('Cannot read servers dir', e); return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(this.serversDir, entry.name);
      const file = path.join(dir, SERVER_META_DIR, 'config.json');
      if (!fsSync.existsSync(file)) continue;
      if (!isValidId(entry.name)) { this.log.warn('Skipping server folder with invalid id', entry.name); continue; }
      try {
        const cfg = normalizeConfig(JSON.parse(fsSync.readFileSync(file, 'utf8')), entry.name, dir);
        if (cfg) this.map.set(cfg.id, cfg); else this.log.warn('Skipping unusable config', file);
      } catch (e) { this.log.error('Skipping broken config', file, e); }
    }
  }

  folderOf(id: string): string { return path.join(this.serversDir, id); }
  all(): ServerConfig[] { return [...this.map.values()]; }
  sorted(): ServerConfig[] {
    return this.all().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  find(id: string): ServerConfig | undefined { return isValidId(id) ? this.map.get(id) : undefined; }

  require(id: string): ServerConfig {
    const cfg = this.find(id);
    if (!cfg) throw new AppException('NOT_FOUND', 'Server not found');
    return cfg;
  }

  newId(name: string): string {
    for (;;) {
      const id = `${slugify(name)}-${randomSuffix()}`;
      if (!this.map.has(id) && !fsSync.existsSync(this.folderOf(id))) return id;
    }
  }

  async save(cfg: ServerConfig): Promise<void> {
    const next: ServerConfig = { ...cfg, folder: this.folderOf(cfg.id) };
    await writeFileAtomic(path.join(next.folder, SERVER_META_DIR, 'config.json'), JSON.stringify(next, null, 2));
    this.map.set(next.id, next);
  }

  forget(id: string): void { this.map.delete(id); }
}
