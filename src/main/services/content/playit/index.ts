// FILE: src/main/services/content/playit/index.ts
// The app only guides the user: start the agent, show the claim link. It never creates tunnels.
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { promises as fsp, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { AppException } from '../../../../shared/types';
import type { AppPaths, PlayitStatus } from '../../../../shared/types';
import type { Emit, Logger } from '../../../../shared/ipc';
import type { Downloader } from '../download';
import type { Http } from '../http';
import { asArray, asRecord, asString, isRecord } from '../json';
import { parsePlayitOutput } from './parser';

const RELEASE_URL = 'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest';
const RELEASE_CACHE_MS = 60 * 60 * 1000;
const EXE_NAME = process.platform === 'win32' ? 'playit.exe' : 'playit';

interface Asset {
  name: string;
  url: string;
  sha256: string | null;
}

export interface Playit {
  status(): Promise<PlayitStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  shutdown(): Promise<void>;
}

function pickAsset(assets: Asset[]): Asset | null {
  const lower = (a: Asset): string => a.name.toLowerCase();
  if (process.platform === 'win32') {
    const exes = assets.filter((a) => lower(a).includes('windows') && lower(a).endsWith('.exe'));
    const x64 = exes.filter((a) => /(x86_64|amd64|x64)/.test(lower(a)));
    const pool = x64.length > 0 ? x64 : exes;
    return pool.find((a) => lower(a).includes('signed')) ?? pool[0] ?? null;
  }
  const linux = assets.filter(
    (a) => lower(a).includes('linux') && /(amd64|x86_64|x64)/.test(lower(a)) && !/\.(sig|deb|rpm|asc|sha256|txt)$/.test(lower(a))
  );
  return linux[0] ?? null;
}

export function createPlayit(deps: {
  paths: AppPaths;
  http: Http;
  downloader: Downloader;
  emit: Emit;
  log: Logger;
}): Playit {
  const { paths, http, downloader, emit, log } = deps;
  const agentDir = path.join(paths.userData, 'playit');
  const exePath = path.join(agentDir, EXE_NAME);

  let child: ChildProcess | null = null;
  let stopRequested = false;
  let poll: NodeJS.Timeout | null = null;
  let current: PlayitStatus = { state: 'stopped', claimUrl: null };
  let installing: Promise<void> | null = null;
  let releaseCache: { at: number; assets: Asset[] } | null = null;

  function setState(state: PlayitStatus['state'], claimUrl: string | null): void {
    if (current.state === state && current.claimUrl === claimUrl) return;
    current = { state, claimUrl };
    emit('playit:status', current);
  }

  function clearPoll(): void {
    if (poll) clearInterval(poll);
    poll = null;
  }

  /** GUESS: the agent writes a *.toml config file into its folder after it is set up. */
  function configExists(): boolean {
    try {
      return readdirSync(agentDir).some((f) => /\.toml$/i.test(f));
    } catch {
      return false;
    }
  }

  async function latestAssets(): Promise<Asset[]> {
    if (releaseCache && Date.now() - releaseCache.at < RELEASE_CACHE_MS) return releaseCache.assets;
    const release = asRecord(await http.getJson(RELEASE_URL, { headers: { Accept: 'application/vnd.github+json' } }));
    const assets: Asset[] = [];
    for (const a of asArray(release.assets)) {
      if (!isRecord(a)) continue;
      const name = asString(a.name);
      const url = asString(a.browser_download_url);
      if (!name || !url) continue;
      const digest = asString(a.digest);
      assets.push({ name, url, sha256: digest && digest.startsWith('sha256:') ? digest.slice(7) : null });
    }
    releaseCache = { at: Date.now(), assets };
    return assets;
  }

  function install(): Promise<void> {
    if (installing) return installing;
    installing = (async () => {
      const asset = pickAsset(await latestAssets());
      if (!asset) throw new AppException('NOT_FOUND', 'No playit agent file for this system');
      await fsp.mkdir(agentDir, { recursive: true });
      await downloader.downloadFile({
        url: asset.url,
        destPath: exePath,
        taskId: 'playit-install',
        label: 'playit agent',
        hash: asset.sha256 ? { algo: 'sha256', value: asset.sha256 } : undefined
      });
      if (process.platform !== 'win32') await fsp.chmod(exePath, 0o755);
    })().finally(() => {
      installing = null;
    });
    return installing;
  }

  async function status(): Promise<PlayitStatus> {
    if (!child && !existsSync(exePath)) return { state: 'not-installed', claimUrl: null };
    return current;
  }

  async function start(): Promise<void> {
    if (child) return;
    if (!existsSync(exePath)) {
      setState('starting', null);
      try {
        await install();
      } catch (e) {
        setState('error', null);
        throw e;
      }
    }
    stopRequested = false;
    setState('starting', null);

    let proc: ChildProcess;
    try {
      proc = spawn(exePath, [], { cwd: agentDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      log.error('Could not start playit agent:', e);
      setState('error', null);
      throw new AppException('UNKNOWN', 'Could not start the playit agent');
    }
    child = proc;

    const onData = (data: Buffer): void => {
      const parsed = parsePlayitOutput(data.toString('utf8'));
      if (parsed.claimUrl && current.state !== 'running') {
        setState('needs-claim', parsed.claimUrl);
      } else if (parsed.connected && current.state !== 'running') {
        setState('running', null);
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    proc.on('error', (err) => {
      log.error('playit agent error:', err);
      if (child === proc) child = null;
      clearPoll();
      setState('error', null);
    });
    proc.on('exit', (code) => {
      if (child === proc) child = null;
      clearPoll();
      if (stopRequested || code === 0 || code === null) setState('stopped', null);
      else setState('error', null);
    });

    // GUESS: process alive for a few seconds + config file present => agent is set up and running.
    clearPoll();
    poll = setInterval(() => {
      if (child === proc && (current.state === 'starting' || current.state === 'needs-claim') && configExists()) {
        setState('running', null);
      }
    }, 3000);
    poll.unref();
  }

  async function stop(): Promise<void> {
    const proc = child;
    if (!proc) {
      if (current.state !== 'stopped' && existsSync(exePath)) setState('stopped', null);
      return;
    }
    stopRequested = true;
    const exited = new Promise<void>((resolve) => {
      proc.once('exit', () => resolve());
      setTimeout(resolve, 5000).unref();
    });
    if (process.platform === 'win32' && proc.pid !== undefined) {
      // Kill the whole process tree
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => resolve());
      });
    } else {
      proc.kill('SIGTERM');
    }
    await exited;
    if (child === proc) child = null;
    clearPoll();
    setState('stopped', null);
  }

  return { status, start, stop, shutdown: stop };
}
