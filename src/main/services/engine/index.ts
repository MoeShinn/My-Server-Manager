// FILE: src/main/services/engine/index.ts
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { AppException } from '../../../shared/types';
import type { ServerConfig, ServerStats, ServerSummary, JvmFlag } from '../../../shared/types';
import type { ContentService, EngineService, ServiceDeps } from '../../../shared/services';
import { STOP_TIMEOUT_MS } from '../../../shared/constants';
import { buildLaunchArgs, buildScript, flagsEqual, suggestFlags, validateFlags, validateJarName } from './flags';
import { canBind, isPortFree, suggestPort, usedByApp } from './ports';
import { ProcessManager } from './process';
import { createServer, duplicateServer, importServer, removeServer, writeEula } from './provision';
import type { EngineCtx } from './provision';
import { readMaxPlayers, readProperties, syncPortToFiles, validatePropertiesPatch, writeProperties } from './properties';
import { validateIpHost, validateJavaOverride, validateName, validatePortNumber, validateRam, validateStorageLimit } from './settings';
import { DiskUsageCache, StatsMonitor } from './stats';
import { ServerStore } from './store';
import { clone, writeFileAtomic } from './util';

export function createEngineService(deps: ServiceDeps & { content: ContentService }): EngineService {
  const { paths, emit, log, content } = deps;
  const store = new ServerStore(paths.serversDir, log);
  store.loadSync();
  const disk = new DiskUsageCache();

  // pm and stats refer to each other through closures; both exist before any call is made.
  const stats: StatsMonitor = new StatsMonitor({
    cores: Math.max(1, os.cpus().length), emit, log, disk,
    getActive: () => pm.activeProcesses(),
    getFolder: (id) => store.find(id)?.folder ?? null,
    getLimitMb: (id) => store.find(id)?.settings.storageLimitMb ?? null,
    onStorage: (id, used, limit) => pm.handleStorage(id, used, limit),
  });
  const pm: ProcessManager = new ProcessManager({ deps, store, disk, onActivity: () => stats.ensureRunning() });
  const ctx: EngineCtx = { deps, store, pm, disk };

  // Prime max-players for servers that are not running yet.
  for (const c of store.all()) void readMaxPlayers(c.folder).then((n) => { pm.rt(c.id).maxPlayers = n; }).catch(() => undefined);

  const effectiveMajor = async (cfg: ServerConfig, override: number | null): Promise<number> =>
    override ?? content.getDefaultJava(cfg.mcVersion);

  async function assertPortUsable(cfg: ServerConfig, port: number): Promise<void> {
    if (usedByApp(store.all(), port, cfg.id)) throw new AppException('PORT_IN_USE', 'Port is used by another server', { port });
    const rt = pm.peek(cfg.id);
    const running = rt ? pm.isAlive(rt) : false;
    if (!running && !(await canBind(port))) throw new AppException('PORT_IN_USE', 'Port is in use', { port });
  }

  const service: EngineService = {
    async list(): Promise<ServerSummary[]> {
      return store.sorted().map((c) => {
        const rt = pm.peek(c.id);
        return {
          id: c.id, name: c.name, software: c.software, modKind: c.modKind, mcVersion: c.mcVersion, build: c.build,
          customJarName: c.customJarName, status: rt?.status ?? 'stopped', playersOnline: rt?.online.length ?? 0,
          playersMax: rt?.maxPlayers ?? 20, port: c.settings.port,
        };
      });
    },
    async get(id) { return clone(store.require(id)); },
    create: (input) => createServer(ctx, input),
    importFolder: (folderPath, name, software, mcVersion) => importServer(ctx, folderPath, name, software, mcVersion),
    remove: (id, deleteFiles) => removeServer(ctx, id, deleteFiles),
    duplicate: (id, newName) => duplicateServer(ctx, id, newName),

    async rename(id, name) {
      const cfg = store.require(id);
      await store.save({ ...cfg, name: validateName(name) });
      emit('servers:changed', null);
    },

    async updateSettings(id, patch) {
      const cfg = store.require(id);
      const old = cfg.settings;
      const next = { ...old };
      if (patch.ramMb !== undefined) next.ramMb = validateRam(patch.ramMb);
      if (patch.storageLimitMb !== undefined) next.storageLimitMb = validateStorageLimit(patch.storageLimitMb);
      if (patch.autoStart !== undefined) {
        if (typeof patch.autoStart !== 'boolean') throw new AppException('INVALID_INPUT');
        next.autoStart = patch.autoStart;
      }
      if (patch.autoRestartOnCrash !== undefined) {
        if (typeof patch.autoRestartOnCrash !== 'boolean') throw new AppException('INVALID_INPUT');
        next.autoRestartOnCrash = patch.autoRestartOnCrash;
      }
      if (patch.customIpHost !== undefined) next.customIpHost = validateIpHost(patch.customIpHost);
      if (patch.javaMajorOverride !== undefined) {
        const o = validateJavaOverride(patch.javaMajorOverride);
        if (o === null && cfg.software === 'custom' && cfg.mcVersion === null) throw new AppException('INVALID_INPUT', 'Java version is required for this server');
        if (o !== null && cfg.mcVersion !== null && o < (await content.getDefaultJava(cfg.mcVersion))) throw new AppException('INVALID_INPUT', 'Java version is too old');
        next.javaMajorOverride = o;
      }
      const portChanged = patch.port !== undefined && patch.port !== old.port;
      if (portChanged) {
        next.port = validatePortNumber(patch.port);
        await assertPortUsable(cfg, next.port);
      }
      let flags: JvmFlag[] = cfg.start.flags;
      if (next.ramMb !== old.ramMb || next.javaMajorOverride !== old.javaMajorOverride) {
        const oldSuggestion = suggestFlags(old.ramMb, await effectiveMajor(cfg, old.javaMajorOverride));
        if (flagsEqual(cfg.start.flags, oldSuggestion)) flags = suggestFlags(next.ramMb, await effectiveMajor(cfg, next.javaMajorOverride));
      }
      const updated: ServerConfig = { ...cfg, settings: next, start: { ...cfg.start, flags } };
      await store.save(updated);
      if (portChanged) {
        await syncPortToFiles(cfg.folder, next.port, cfg.software === 'velocity');
        emit('servers:changed', null);
      }
      return clone(updated);
    },

    async setStartOptions(id, start) {
      const cfg = store.require(id);
      const jarFile = validateJarName(start?.jarFile);
      const st = await fs.stat(path.join(cfg.folder, jarFile)).catch(() => null);
      if (!st || !st.isFile()) throw new AppException('INVALID_INPUT', 'Jar file not found in the server folder');
      const updated: ServerConfig = { ...cfg, start: { jarFile, flags: validateFlags(start.flags) } };
      await store.save(updated);
      return clone(updated);
    },

    async suggestFlags(ramMb, javaMajor) { return suggestFlags(ramMb, javaMajor); },

    async exportStartScript(id) {
      const cfg = store.require(id);
      const major = await effectiveMajor(cfg, cfg.settings.javaMajorOverride);
      const java = content.getJavaExecutable(major);
      if (!java) throw new AppException('JAVA_MISSING', 'Java is not installed', { major });
      const windows = process.platform === 'win32';
      const file = path.join(cfg.folder, windows ? 'start.bat' : 'start.sh');
      await writeFileAtomic(file, buildScript(java, buildLaunchArgs(cfg), windows));
      if (!windows) await fs.chmod(file, 0o755);
      return file;
    },

    start: (id) => pm.start(id),
    stop: (id) => pm.stop(id),
    restart: (id) => pm.restart(id),
    kill: (id) => pm.kill(id),
    startAll: () => pm.startAll(),
    stopAll: () => pm.stopAllSequential({ perServerTimeoutMs: STOP_TIMEOUT_MS, onProgress: () => undefined }),
    sendCommand: (id, command) => pm.sendCommand(id, command),
    async getConsole(id) { return pm.getConsole(id); },

    async acceptEula(id) { await writeEula(store.require(id).folder); },

    async getProperties(id) {
      const cfg = store.require(id);
      return cfg.software === 'velocity' ? {} : readProperties(cfg.folder);
    },

    async setProperties(id, patch) {
      const cfg = store.require(id);
      if (cfg.software === 'velocity') throw new AppException('INVALID_INPUT', 'Velocity has no server.properties');
      const clean = validatePropertiesPatch(patch);
      let newPort: number | null = null;
      if (clean['server-port'] !== undefined) {
        const n = Number(clean['server-port']);
        newPort = validatePortNumber(n);
        if (newPort !== cfg.settings.port) await assertPortUsable(cfg, newPort);
        clean['server-port'] = String(newPort);
      }
      await writeProperties(cfg.folder, clean);
      if (newPort !== null && newPort !== cfg.settings.port) {
        await store.save({ ...cfg, settings: { ...cfg.settings, port: newPort } });
        emit('servers:changed', null);
      }
      if (clean['max-players'] !== undefined) await pm.refreshMaxPlayers(id);
    },

    getPlayers: (id) => pm.getPlayers(id),

    async getStats(id): Promise<ServerStats> {
      const cfg = store.require(id);
      const rt = pm.peek(id);
      const alive = rt ? pm.isAlive(rt) : false;
      const cached = disk.get(id);
      const diskUsedMb = cached === null ? await disk.scan(id, cfg.folder) : cached;
      if (cached !== null) disk.refreshInBackground(id, cfg.folder, alive ? 30000 : 60000);
      const last = stats.getLast(id);
      return {
        cpuPercent: alive ? last.cpuPercent : 0,
        ramUsedMb: alive ? last.ramUsedMb : 0,
        diskUsedMb,
        uptimeSec: alive && rt?.startedAt ? Math.floor((Date.now() - rt.startedAt) / 1000) : 0,
      };
    },

    async isPortFree(port) { return isPortFree(store.all(), port); },
    async suggestPort() { return suggestPort(store.all()); },

    // ----- internal (not exposed over IPC) -----
    getServerFolder: (id) => store.require(id).folder,
    stopAllSequential: (opts) => pm.stopAllSequential(opts),
    runningServerIds: () => pm.runningServerIds(),
    recoverOrphans: () => pm.recoverOrphans(),
    startAutoStartServers: () => pm.startAutoStartServers(),
  };
  log.info(`Engine ready: ${store.all().length} server(s) loaded`);
  return service;
}
