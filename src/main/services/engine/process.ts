// FILE: src/main/services/engine/process.ts
import { stripMcColors } from '../../../shared/mcText';
import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AppException } from '../../../shared/types';
import type { ConsoleLine, PlayerEntry, QuitProgress, ServerConfig, ServerStatus } from '../../../shared/types';
import type { ContentService, ServiceDeps } from '../../../shared/services';
import { CONSOLE_MAX_LINES, STOP_TIMEOUT_MS } from '../../../shared/constants';
import { ConsoleBuffer, LineSplitter, detectLevel, stripAnsi } from './console';
import { buildLaunchArgs } from './flags';
import { mergePlayers, parsePlayerEvent, readUserCache } from './players';
import { canBind } from './ports';
import { readMaxPlayers, syncPortToFiles } from './properties';
import { isJavaProcess, isPidAlive, killTree, readRunFile, removeRunFile, writeRunFile } from './proc';
import type { RunInfo } from './proc';
import { handleTpsLine, tpsCommand, TPS_PROBE_WINDOW_MS } from './tps';
import type { ActiveServer, DiskUsageCache } from './stats';
import type { ServerStore } from './store';
import { pathExists, readTextIfExists, sleep, toAppException } from './util';

const RESTART_DELAY_MS = 10000;
const RESTART_WINDOW_MS = 10 * 60000;
const RESTART_MAX = 3;
const WAIT_RUNNING_MS = 120000;
const SEQUENCE_GAP_MS = 3000;
const ADOPTED_FORCE_MS = 15000;

export interface Runtime {
  id: string;
  status: ServerStatus;
  child: ChildProcessWithoutNullStreams | null;
  pid: number | null;
  adopted: boolean;
  startedAt: number | null;
  stopRequested: boolean;
  exitCode: number | null;
  console: ConsoleBuffer;
  online: string[];
  maxPlayers: number;
  lineQueue: Promise<void>;
  stdout: LineSplitter;
  stderr: LineSplitter;
  stopTimer: NodeJS.Timeout | null;
  forceTimer: NodeJS.Timeout | null;
  restartTimer: NodeJS.Timeout | null;
  restartHistory: number[];
  storageWarned: boolean;
  storageExceeded: boolean;
  tailTimer: NodeJS.Timeout | null;
  watchTimer: NodeJS.Timeout | null;
  finalized: boolean;
  tps: number | null;
  tpsProbeUntil: number;
  tpsUnsupported: boolean;
}

function createRuntime(id: string): Runtime {
  return {
    id, status: 'stopped', child: null, pid: null, adopted: false, startedAt: null, stopRequested: false, exitCode: null,
    console: new ConsoleBuffer(CONSOLE_MAX_LINES), online: [], maxPlayers: 20, lineQueue: Promise.resolve(),
    stdout: new LineSplitter(), stderr: new LineSplitter(), stopTimer: null, forceTimer: null, restartTimer: null,
    restartHistory: [], storageWarned: false, storageExceeded: false, tailTimer: null, watchTimer: null, finalized: true,
    tps: null, tpsProbeUntil: 0, tpsUnsupported: false,
  };
}

export interface ProcessManagerDeps {
  deps: ServiceDeps & { content: ContentService };
  store: ServerStore;
  disk: DiskUsageCache;
  onActivity(): void;
}

export class ProcessManager {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly bus = new EventEmitter();
  private readonly locks = new Map<string, Promise<void>>();
  private shuttingDown = false;
  private sequenceRunning = false;

  constructor(private readonly d: ProcessManagerDeps) { this.bus.setMaxListeners(0); }

  // ---------- registry ----------
  rt(id: string): Runtime {
    let r = this.runtimes.get(id);
    if (!r) { r = createRuntime(id); this.runtimes.set(id, r); }
    return r;
  }
  peek(id: string): Runtime | undefined { return this.runtimes.get(id); }
  isAlive(rt: Runtime): boolean { return rt.status === 'starting' || rt.status === 'running' || rt.status === 'stopping'; }

  dropRuntime(id: string): void {
    const rt = this.runtimes.get(id);
    if (rt) this.clearTimers(rt);
    this.runtimes.delete(id);
  }

  runningServerIds(): string[] {
    return this.d.store.sorted().filter((c) => { const r = this.peek(c.id); return r ? this.isAlive(r) : false; }).map((c) => c.id);
  }

  activeProcesses(): ActiveServer[] {
    const out: ActiveServer[] = [];
    for (const rt of this.runtimes.values()) {
      if (this.isAlive(rt) && rt.pid !== null) out.push({ id: rt.id, pid: rt.pid, startedAt: rt.startedAt ?? Date.now() });
    }
    return out;
  }

  /** Per-server queue so start/stop/restart/remove/duplicate never overlap. */
  withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn);
    const tail = run.then(() => undefined, () => undefined);
    this.locks.set(id, tail);
    void tail.then(() => { if (this.locks.get(id) === tail) this.locks.delete(id); });
    return run;
  }

  // ---------- events and console ----------
  private setStatus(rt: Runtime, status: ServerStatus, exitCode: number | null = null): void {
    rt.status = status;
    this.d.deps.emit('server:status', { id: rt.id, status, exitCode });
    this.bus.emit(`status:${rt.id}`, status);
  }

  private pushLine(rt: Runtime, line: ConsoleLine): void {
    rt.console.push(line);
    this.d.deps.emit('server:console', { id: rt.id, line });
  }

  addSystem(rt: Runtime, textKey: string, params?: Record<string, string | number>): void {
    this.pushLine(rt, { ts: Date.now(), level: 'system', text: textKey, textKey, params });
  }

  private emitPlayers(rt: Runtime): void {
    this.d.deps.emit('server:players', { id: rt.id, online: [...rt.online], max: rt.maxPlayers });
  }

  async refreshMaxPlayers(id: string): Promise<void> {
    const cfg = this.d.store.find(id);
    if (!cfg) return;
    const rt = this.rt(id);
    rt.maxPlayers = await readMaxPlayers(cfg.folder);
    this.emitPlayers(rt);
  }

  waitForStatus(rt: Runtime, pred: (s: ServerStatus) => boolean, timeoutMs: number): Promise<boolean> {
    if (pred(rt.status)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const ev = `status:${rt.id}`;
      const onChange = (s: ServerStatus): void => { if (pred(s)) { cleanup(); resolve(true); } };
      const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
      const cleanup = (): void => { clearTimeout(timer); this.bus.off(ev, onChange); };
      this.bus.on(ev, onChange);
    });
  }
  private waitForExit(rt: Runtime, ms: number): Promise<boolean> {
    return this.waitForStatus(rt, (s) => s === 'stopped' || s === 'crashed', ms);
  }

  // ---------- log pipeline ----------
  private feed(rt: Runtime, lines: string[], after?: () => void): void {
    if (lines.length === 0 && !after) return;
    rt.lineQueue = rt.lineQueue.then(async () => {
      for (let i = 0; i < lines.length; i++) {
        this.processLine(rt, lines[i]);
        if ((i + 1) % 100 === 0) await new Promise<void>((r) => setImmediate(r));
      }
      after?.();
    }).catch((e) => this.d.deps.log.error('console pipeline failed', e));
  }

  private processLine(rt: Runtime, raw: string): void {
    const text = stripAnsi(raw).replace(/\r$/, '');
    if (text.trim() === '') return;
    if (handleTpsLine(rt, text)) return; // answer to our own hidden TPS query: keep it out of the console
    this.pushLine(rt, { ts: Date.now(), level: detectLevel(text), text });
    if (rt.status === 'starting' && /\bDone \(/.test(text)) this.setStatus(rt, 'running');
    const ev = parsePlayerEvent(text);
    if (!ev) return;
    const has = rt.online.includes(ev.name);
    if (ev.type === 'join' && !has) { rt.online.push(ev.name); this.emitPlayers(rt); }
    if (ev.type === 'leave' && has) { rt.online = rt.online.filter((n) => n !== ev.name); this.emitPlayers(rt); }
  }

  getConsole(id: string): ConsoleLine[] {
    this.d.store.require(id);
    return this.rt(id).console.toArray();
  }

  async getPlayers(id: string): Promise<PlayerEntry[]> {
    const cfg = this.d.store.require(id);
    return mergePlayers(await readUserCache(cfg.folder), this.rt(id).online);
  }

  /** Silently asks a running server for its TPS. The reply is parsed (and hidden) in processLine. */
  probeTps(id: string): void {
    const rt = this.peek(id);
    const cfg = this.d.store.find(id);
    if (!rt || !cfg || rt.status !== 'running' || rt.adopted || !rt.child || rt.tpsUnsupported) return;
    const cmd = tpsCommand(cfg.software);
    if (!cmd || !rt.child.stdin.writable) return;
    rt.tpsProbeUntil = Date.now() + TPS_PROBE_WINDOW_MS;
    rt.child.stdin.write(`${cmd}\n`);
  }

  // ---------- start ----------
  start(id: string): Promise<void> {
    this.d.store.require(id);
    return this.withLock(id, () => this.doStart(id));
  }

  private async resolveJava(cfg: ServerConfig): Promise<string> {
    const content = this.d.deps.content;
    const major = cfg.settings.javaMajorOverride ?? (await content.getDefaultJava(cfg.mcVersion));
    let exe = content.getJavaExecutable(major);
    if (!exe) {
      try { exe = await content.ensureJava(major, `java-${cfg.id}`); } catch (e) {
        const ex = toAppException(e);
        if (ex.code === 'CANCELLED') throw ex;
        throw new AppException('JAVA_MISSING', ex.message, { major });
      }
    }
    if (!(await pathExists(exe))) throw new AppException('JAVA_MISSING', 'Java executable not found', { major });
    return exe;
  }

  private async doStart(id: string): Promise<void> {
    if (this.shuttingDown) throw new AppException('CANCELLED');
    const cfg = this.d.store.require(id);
    const rt = this.rt(id);
    if (rt.status !== 'stopped' && rt.status !== 'crashed') throw new AppException('SERVER_RUNNING');
    if (rt.restartTimer) { clearTimeout(rt.restartTimer); rt.restartTimer = null; }
    const folder = cfg.folder;
    const velocity = cfg.software === 'velocity';

    if (!velocity) {
      const eula = await readTextIfExists(path.join(folder, 'eula.txt'));
      if (eula === null || !/^\s*eula\s*=\s*true\s*$/im.test(eula)) throw new AppException('EULA_NOT_ACCEPTED');
    }
    const limit = cfg.settings.storageLimitMb;
    if (limit !== null && (await this.d.disk.scan(id, folder)) >= limit) throw new AppException('STORAGE_LIMIT', 'Storage limit reached', { limit });
    if (!(await canBind(cfg.settings.port))) throw new AppException('PORT_IN_USE', 'Port is in use', { port: cfg.settings.port });
    await syncPortToFiles(folder, cfg.settings.port, velocity);
    const javaExe = await this.resolveJava(cfg);
    const maxPlayers = await readMaxPlayers(folder);

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(javaExe, buildLaunchArgs(cfg), { cwd: folder, windowsHide: true });
    } catch (e) {
      throw new AppException('JAVA_MISSING', e instanceof Error ? e.message : 'spawn failed');
    }
    rt.child = child;
    rt.pid = child.pid ?? null;
    rt.adopted = false;
    rt.startedAt = Date.now();
    rt.stopRequested = false;
    rt.exitCode = null;
    rt.finalized = false;
    rt.online = [];
    rt.maxPlayers = maxPlayers;
    rt.stdout = new LineSplitter();
    rt.stderr = new LineSplitter();
    rt.storageWarned = false;
    rt.storageExceeded = false;
    rt.tps = null;
    rt.tpsProbeUntil = 0;
    rt.tpsUnsupported = false;
    this.setStatus(rt, 'starting');
    this.addSystem(rt, 'engine.started', { name: stripMcColors(cfg.name), ram: cfg.settings.ramMb, port: cfg.settings.port });
    this.emitPlayers(rt);
    if (rt.pid !== null) void writeRunFile(folder, { pid: rt.pid, startedAt: rt.startedAt, javaPath: javaExe }).catch(() => undefined);

    child.stdout.on('data', (b: Buffer) => this.feed(rt, rt.stdout.push(b)));
    child.stderr.on('data', (b: Buffer) => this.feed(rt, rt.stderr.push(b)));
    child.stdin.on('error', () => undefined);
    child.once('error', (err) => {
      this.d.deps.log.error('spawn error', err);
      if (rt.child === child && child.pid === undefined) {
        this.addSystem(rt, 'engine.startFailed', { code: 'JAVA_MISSING' });
        this.finalize(rt, null, false);
      }
    });
    child.once('exit', (code) => {
      rt.exitCode = code;
      setTimeout(() => { if (rt.child === child) this.finalize(rt, code, false); }, 3000).unref();
    });
    child.once('close', (code) => { if (rt.child === child) this.finalize(rt, code ?? rt.exitCode, false); });
    this.d.onActivity();
  }

  // ---------- exit handling ----------
  private finalize(rt: Runtime, code: number | null, assumeClean: boolean): void {
    if (rt.finalized) return;
    rt.finalized = true;
    this.feed(rt, [...rt.stdout.flush(), ...rt.stderr.flush()], () => this.afterExit(rt, code, assumeClean));
  }

  private clearTimers(rt: Runtime): void {
    for (const key of ['stopTimer', 'forceTimer', 'restartTimer', 'tailTimer', 'watchTimer'] as const) {
      const t = rt[key];
      if (t) { clearTimeout(t); clearInterval(t); rt[key] = null; }
    }
  }

  private afterExit(rt: Runtime, code: number | null, assumeClean: boolean): void {
    const folder = this.d.store.find(rt.id)?.folder;
    this.clearTimers(rt);
    rt.child = null;
    rt.pid = null;
    rt.adopted = false;
    rt.exitCode = code;
    if (rt.online.length > 0) { rt.online = []; this.emitPlayers(rt); }
    if (folder) void removeRunFile(folder);
    const clean = assumeClean || rt.stopRequested || code === 0;
    this.setStatus(rt, clean ? 'stopped' : 'crashed', code);
    this.addSystem(rt, clean ? 'engine.stopped' : 'engine.crashed', { code: code ?? -1 });
    if (!clean) this.maybeAutoRestart(rt);
  }

  private maybeAutoRestart(rt: Runtime): void {
    const cfg = this.d.store.find(rt.id);
    if (!cfg || !cfg.settings.autoRestartOnCrash || this.shuttingDown) return;
    const now = Date.now();
    rt.restartHistory = rt.restartHistory.filter((t) => now - t < RESTART_WINDOW_MS);
    if (rt.restartHistory.length >= RESTART_MAX) { this.addSystem(rt, 'engine.autoRestartGaveUp', { max: RESTART_MAX }); return; }
    rt.restartHistory.push(now);
    this.addSystem(rt, 'engine.autoRestart', { attempt: rt.restartHistory.length, max: RESTART_MAX, seconds: RESTART_DELAY_MS / 1000 });
    rt.restartTimer = setTimeout(() => {
      rt.restartTimer = null;
      void this.withLock(rt.id, async () => {
        if (rt.status !== 'crashed' || this.shuttingDown || !this.d.store.find(rt.id)) return;
        try { await this.doStart(rt.id); } catch (e) {
          this.addSystem(rt, 'engine.startFailed', { code: toAppException(e).code });
        }
      }).catch(() => undefined);
    }, RESTART_DELAY_MS);
  }

  // ---------- stop / kill / restart ----------
  stop(id: string): Promise<void> {
    this.d.store.require(id);
    return this.withLock(id, () => this.doStop(id));
  }

  private async doStop(id: string): Promise<void> {
    const cfg = this.d.store.require(id);
    const rt = this.rt(id);
    if (!this.isAlive(rt)) throw new AppException('SERVER_NOT_RUNNING');
    if (rt.status === 'stopping') return;
    rt.stopRequested = true;
    if (rt.restartTimer) { clearTimeout(rt.restartTimer); rt.restartTimer = null; }
    this.setStatus(rt, 'stopping');
    this.addSystem(rt, 'engine.stopping');
    if (rt.adopted && rt.pid !== null) {
      const pid = rt.pid;
      await killTree(pid, false);
      rt.forceTimer = setTimeout(() => { rt.forceTimer = null; if (isPidAlive(pid)) void killTree(pid, true); }, ADOPTED_FORCE_MS);
    } else if (rt.child?.stdin.writable) {
      rt.child.stdin.write(cfg.software === 'velocity' ? 'end\n' : 'stop\n');
    }
    rt.stopTimer = setTimeout(() => {
      rt.stopTimer = null;
      if (rt.status === 'stopping') this.addSystem(rt, 'engine.stopTimeout');
    }, STOP_TIMEOUT_MS);
  }

  /** Not queued behind the lock on purpose: it must work while a restart is waiting. */
  async kill(id: string): Promise<void> {
    this.d.store.require(id);
    const rt = this.rt(id);
    if (!this.isAlive(rt) || rt.pid === null) throw new AppException('SERVER_NOT_RUNNING');
    rt.stopRequested = true;
    if (rt.restartTimer) { clearTimeout(rt.restartTimer); rt.restartTimer = null; }
    await killTree(rt.pid, true);
  }

  restart(id: string): Promise<void> {
    this.d.store.require(id);
    return this.withLock(id, async () => {
      const rt = this.rt(id);
      if (this.isAlive(rt)) {
        if (rt.status !== 'stopping') await this.doStop(id);
        if (!(await this.waitForExit(rt, STOP_TIMEOUT_MS))) throw new AppException('SERVER_RUNNING', 'Server did not stop in time');
      }
      await this.doStart(id);
    });
  }

  async sendCommand(id: string, command: string): Promise<void> {
    this.d.store.require(id);
    const rt = this.rt(id);
    if (typeof command !== 'string') throw new AppException('INVALID_INPUT');
    if (!this.isAlive(rt)) throw new AppException('SERVER_NOT_RUNNING');
    if (rt.adopted || !rt.child) throw new AppException('UNKNOWN', 'Console input is not available for a server adopted in limited mode');
    let cmd = command.trim();
    if (cmd.startsWith('/')) cmd = cmd.slice(1);
    cmd = cmd.replace(/[\r\n]+/g, '').slice(0, 1000).trim();
    if (!cmd) throw new AppException('INVALID_INPUT');
    if (!rt.child.stdin.writable) throw new AppException('SERVER_NOT_RUNNING');
    rt.child.stdin.write(`${cmd}\n`);
    this.pushLine(rt, { ts: Date.now(), level: 'command', text: `> ${cmd}` });
  }

  // ---------- bulk operations ----------
  async stopAllSequential(opts: { perServerTimeoutMs: number; onProgress: (p: QuitProgress) => void }): Promise<void> {
    this.shuttingDown = true;
    try {
      const ids = this.runningServerIds();
      const progress: QuitProgress = {
        state: 'stopping',
        servers: ids.map((id) => ({ id, name: this.d.store.require(id).name, state: 'waiting' as const })),
      };
      const report = (): void => opts.onProgress({ state: progress.state, servers: progress.servers.map((s) => ({ ...s })) });
      report();
      let anyTimeout = false;
      for (let i = 0; i < ids.length; i++) {
        const rt = this.rt(ids[i]);
        progress.servers[i].state = 'stopping';
        report();
        try { if (this.isAlive(rt) && rt.status !== 'stopping') await this.doStop(ids[i]); } catch (e) {
          this.d.deps.log.warn('stop during shutdown failed', ids[i], e);
        }
        const ok = await this.waitForExit(rt, opts.perServerTimeoutMs);
        if (!ok) anyTimeout = true;
        progress.servers[i].state = ok ? 'stopped' : 'timeout';
        report();
      }
      progress.state = anyTimeout ? 'timeout' : 'done';
      report();
    } finally {
      this.shuttingDown = false;
    }
  }

  async startSequentially(ids: string[]): Promise<void> {
    if (this.sequenceRunning) return;
    this.sequenceRunning = true;
    try {
      for (let i = 0; i < ids.length; i++) {
        if (this.shuttingDown) return;
        const rt = this.rt(ids[i]);
        try {
          await this.start(ids[i]);
          await this.waitForStatus(rt, (s) => s === 'running' || s === 'crashed' || s === 'stopped', WAIT_RUNNING_MS);
        } catch (e) {
          this.addSystem(rt, 'engine.startFailed', { code: toAppException(e).code });
          continue;
        }
        if (i < ids.length - 1) await sleep(SEQUENCE_GAP_MS);
      }
    } finally { this.sequenceRunning = false; }
  }

  startAll(): Promise<void> {
    const ids = this.d.store.sorted().filter((c) => { const r = this.peek(c.id); return !r || !this.isAlive(r); }).map((c) => c.id);
    return this.startSequentially(ids);
  }

  startAutoStartServers(): Promise<void> {
    const ids = this.d.store.sorted()
      .filter((c) => c.settings.autoStart && !(this.peek(c.id) && this.isAlive(this.rt(c.id))))
      .map((c) => c.id);
    return this.startSequentially(ids);
  }

  // ---------- storage limit ----------
  handleStorage(id: string, usedMb: number, limitMb: number): void {
    const rt = this.peek(id);
    if (!rt || !this.isAlive(rt)) return;
    const pct = (usedMb / limitMb) * 100;
    if (pct >= 100) {
      if (rt.storageExceeded) return;
      rt.storageExceeded = true;
      rt.storageWarned = true;
      this.addSystem(rt, 'engine.storageExceeded', { used: Math.round(usedMb), limit: limitMb });
      if (rt.status !== 'stopping') void this.doStop(id).catch(() => undefined);
      return;
    }
    rt.storageExceeded = false;
    if (pct >= 90) {
      if (!rt.storageWarned) {
        rt.storageWarned = true;
        this.addSystem(rt, 'engine.storageWarning', { percent: Math.floor(pct), used: Math.round(usedMb), limit: limitMb });
      }
    } else rt.storageWarned = false;
  }

  // ---------- orphans ----------
  async recoverOrphans(): Promise<void> {
    for (const cfg of this.d.store.all()) {
      try {
        const info = await readRunFile(cfg.folder);
        if (!info) continue;
        const rt = this.rt(cfg.id);
        if (this.isAlive(rt)) continue;
        if (!isPidAlive(info.pid) || !(await isJavaProcess(info.pid))) { await removeRunFile(cfg.folder); continue; }
        await this.adopt(cfg, info);
      } catch (e) { this.d.deps.log.error('recoverOrphans failed for', cfg.id, e); }
    }
  }

  private async adopt(cfg: ServerConfig, info: RunInfo): Promise<void> {
    const rt = this.rt(cfg.id);
    rt.adopted = true;
    rt.child = null;
    rt.pid = info.pid;
    rt.startedAt = info.startedAt;
    rt.stopRequested = false;
    rt.exitCode = null;
    rt.finalized = false;
    rt.online = [];
    rt.maxPlayers = await readMaxPlayers(cfg.folder);
    rt.storageWarned = false;
    rt.storageExceeded = false;
    this.setStatus(rt, 'running');
    this.addSystem(rt, 'engine.adoptedLimited');
    this.startTail(rt, path.join(cfg.folder, 'logs', 'latest.log'));
    rt.watchTimer = setInterval(() => { if (!isPidAlive(info.pid)) this.finalize(rt, null, true); }, 2000);
    this.d.onActivity();
  }

  /** Follow logs/latest.log for servers we could not attach to. */
  private startTail(rt: Runtime, logFile: string): void {
    const splitter = new LineSplitter();
    let busy = false;
    let pos = 0;
    void fs.stat(logFile).then((s) => { pos = s.size; }).catch(() => undefined).then(() => {
      rt.tailTimer = setInterval(() => {
        if (busy) return;
        busy = true;
        void (async () => {
          try {
            const st = await fs.stat(logFile).catch(() => null);
            if (!st) return;
            if (st.size < pos) pos = 0;
            if (st.size === pos) return;
            const len = Math.min(st.size - pos, 1048576);
            const fh = await fs.open(logFile, 'r');
            try {
              const buf = Buffer.alloc(len);
              const { bytesRead } = await fh.read(buf, 0, len, pos);
              pos += bytesRead;
              this.feed(rt, splitter.push(buf.subarray(0, bytesRead)));
            } finally { await fh.close(); }
          } catch (e) { this.d.deps.log.warn('tail failed', e); } finally { busy = false; }
        })();
      }, 1000);
    });
  }
}
