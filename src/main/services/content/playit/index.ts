// FILE: src/main/services/content/playit/index.ts
// The app only guides the user: start the agent, show the claim link. It never creates tunnels.
//
// Which agent version is used depends on the app version (rules in data.json, "playit.rules"):
//   { "app": "1.0", "agent": "v0.17.1" }  -> app 1.0.x uses playit v0.17.1
//   { "app": "1.1", "agent": "unsupported" } -> this app version must be updated to use playit
// Upgrading the agent only replaces the executable; the key file (playit.toml) is never touched,
// so the user stays linked to the same agent (and keeps its tunnels).
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';
import { satisfies } from 'semver';
import { AppException } from '../../../../shared/types';
import type { AppPaths, DataJson, PlayitStatus } from '../../../../shared/types';
import type { Emit, Logger } from '../../../../shared/ipc';
import type { Downloader } from '../download';
import type { Http } from '../http';
import { asArray, asRecord, asString, isRecord } from '../json';
import { parsePlayitOutput } from './parser';

const RELEASE_BASE = 'https://api.github.com/repos/playit-cloud/playit-agent/releases';
/** Used when data.json has no rule for this app version (or cannot be read at all). */
const DEFAULT_AGENT_TAG = 'v0.17.1';
const UNSUPPORTED = 'unsupported';
const RULES_WAIT_MS = 4000;
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
  /** Stops the agent and forgets the saved login, so the next start asks the user to link it again. */
  reset(): Promise<void>;
  shutdown(): Promise<void>;
}

function normalizeTag(value: string): string | null {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(value.trim());
  return m ? `v${m[1]}` : null;
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
  getDataJson(): Promise<DataJson>;
  appVersion: string;
}): Playit {
  const { paths, http, downloader, emit, log, getDataJson, appVersion } = deps;
  const agentDir = path.join(paths.userData, 'playit');
  const exePath = path.join(agentDir, EXE_NAME);
  const exeBak = `${exePath}.bak`;
  const versionFile = path.join(agentDir, 'agent-version.txt');
  const versionBak = `${versionFile}.bak`;
  const failedFile = path.join(agentDir, 'upgrade-failed.txt');
  const secretPath = path.join(agentDir, 'playit.toml'); // the agent's key = the user's link to their playit account
  const secretBak = `${secretPath}.bak`;

  let child: ChildProcess | null = null;
  let stopRequested = false;
  let poll: NodeJS.Timeout | null = null;
  let current: PlayitStatus = { state: 'stopped', claimUrl: null };
  let installing: Promise<void> | null = null;
  const releaseCache = new Map<string, { at: number; assets: Asset[] }>();

  function setState(state: PlayitStatus['state'], claimUrl: string | null): void {
    if (current.state === state && current.claimUrl === claimUrl) return;
    current = { state, claimUrl };
    emit('playit:status', current);
  }

  function clearPoll(): void {
    if (poll) clearInterval(poll);
    poll = null;
  }

  // ---------------------------------------------------------------- which agent version?

  /** Agent tag for this app version, or null when this app version must be updated ("unsupported"). */
  async function resolveTarget(): Promise<string | null> {
    let rules: DataJson['playitRules'] = [];
    try {
      rules = (await getDataJson()).playitRules;
    } catch (e) {
      log.warn('Could not read playit rules from data.json, using the default agent:', e instanceof Error ? e.message : e);
    }
    for (const rule of rules) {
      let match = false;
      try {
        match = satisfies(appVersion, rule.app, { includePrerelease: true });
      } catch {
        log.warn(`Ignoring playit rule with an invalid app range: "${rule.app}"`);
      }
      if (!match) continue;
      if (rule.agent.trim().toLowerCase() === UNSUPPORTED) return null;
      const tag = normalizeTag(rule.agent);
      if (tag) return tag;
      log.warn(`Ignoring playit rule with an invalid agent version: "${rule.agent}"`);
    }
    return DEFAULT_AGENT_TAG;
  }

  /** Like resolveTarget but never waits long (used by status(), which the UI calls when a page opens). */
  async function resolveTargetQuick(): Promise<string | null> {
    const timeout = new Promise<string | null>((resolve) => {
      setTimeout(() => resolve(DEFAULT_AGENT_TAG), RULES_WAIT_MS).unref();
    });
    return Promise.race([resolveTarget(), timeout]);
  }

  async function readText(file: string): Promise<string> {
    try {
      return (await fsp.readFile(file, 'utf8')).trim();
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------- download / upgrade

  async function assetsFor(tag: string): Promise<Asset[]> {
    const hit = releaseCache.get(tag);
    if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.assets;
    const release = asRecord(
      await http.getJson(`${RELEASE_BASE}/tags/${tag}`, { headers: { Accept: 'application/vnd.github+json' } })
    );
    const assets: Asset[] = [];
    for (const a of asArray(release.assets)) {
      if (!isRecord(a)) continue;
      const name = asString(a.name);
      const url = asString(a.browser_download_url);
      if (!name || !url) continue;
      const digest = asString(a.digest);
      assets.push({ name, url, sha256: digest && digest.startsWith('sha256:') ? digest.slice(7) : null });
    }
    releaseCache.set(tag, { at: Date.now(), assets });
    return assets;
  }

  function install(tag: string): Promise<void> {
    if (installing) return installing;
    installing = (async () => {
      const asset = pickAsset(await assetsFor(tag));
      if (!asset) throw new AppException('NOT_FOUND', `No playit agent ${tag} file for this system`);
      await fsp.mkdir(agentDir, { recursive: true });
      await downloader.downloadFile({
        url: asset.url,
        destPath: exePath,
        taskId: 'playit-install',
        label: `playit agent ${tag}`,
        hash: asset.sha256 ? { algo: 'sha256', value: asset.sha256 } : undefined
      });
      if (process.platform !== 'win32') await fsp.chmod(exePath, 0o755);
      await fsp.writeFile(versionFile, tag, 'utf8');
    })().finally(() => {
      installing = null;
    });
    return installing;
  }

  /** Keeps the old executable as *.bak so we can go back if the new one does not work. Returns true if there was one. */
  async function backupAgent(): Promise<boolean> {
    if (!existsSync(exePath)) return false;
    await fsp.rm(exeBak, { force: true });
    await fsp.rename(exePath, exeBak);
    try {
      await fsp.copyFile(versionFile, versionBak);
    } catch {
      await fsp.rm(versionBak, { force: true });
    }
    return true;
  }

  async function restoreAgent(): Promise<void> {
    if (!existsSync(exeBak)) return;
    await fsp.rm(exePath, { force: true });
    await fsp.rename(exeBak, exePath);
    if (existsSync(versionBak)) {
      await fsp.copyFile(versionBak, versionFile);
      await fsp.rm(versionBak, { force: true });
    } else {
      await fsp.rm(versionFile, { force: true });
    }
  }

  async function dropAgentBackup(): Promise<void> {
    await fsp.rm(exeBak, { force: true });
    await fsp.rm(versionBak, { force: true });
  }

  // ---------------------------------------------------------------- key file (the user's playit login)

  async function backupSecret(): Promise<void> {
    try {
      const st = await fsp.stat(secretPath);
      if (st.size > 0) await fsp.copyFile(secretPath, secretBak);
    } catch {
      /* no key yet: nothing to back up */
    }
  }

  /** The key file vanished but we still have a copy: put it back so the user stays signed in. */
  async function restoreSecretIfMissing(): Promise<void> {
    if (existsSync(secretPath) || !existsSync(secretBak)) return;
    try {
      await fsp.copyFile(secretBak, secretPath);
      log.warn('playit key file was missing, restored it from the backup copy.');
    } catch (e) {
      log.warn('Could not restore the playit key file backup:', e);
    }
  }

  // ---------------------------------------------------------------- public API

  async function status(): Promise<PlayitStatus> {
    if (child) return current;
    const target = await resolveTargetQuick();
    if (target === null) return { state: 'unsupported', claimUrl: null };
    if (!existsSync(exePath)) return { state: 'not-installed', claimUrl: null };
    if (current.state === 'unsupported') return { state: 'stopped', claimUrl: null };
    return current;
  }

  async function start(): Promise<void> {
    if (child) return;
    setState('starting', null);

    const target = await resolveTarget();
    if (target === null) {
      setState('unsupported', null);
      return;
    }

    await restoreSecretIfMissing();

    // Install, or upgrade when the installed agent is not the one this app version wants.
    let rollbackTag: string | null = null; // set when a working old agent is kept as a backup
    const installed = await readText(versionFile);
    if (!existsSync(exePath) || installed !== target) {
      const failedBefore = (await readText(failedFile)) === target;
      if (existsSync(exePath) && failedBefore) {
        log.warn(`Upgrading playit to ${target} failed before, keeping the installed agent ${installed || '(unknown)'}.`);
      } else {
        try {
          await backupSecret();
          const hadOld = await backupAgent();
          try {
            await install(target);
          } catch (e) {
            if (hadOld) await restoreAgent();
            throw e;
          }
          if (hadOld) rollbackTag = target;
        } catch (e) {
          log.error('Could not install the playit agent:', e);
          setState('error', null);
          throw e;
        }
      }
    } else {
      await dropAgentBackup();
    }

    stopRequested = false;
    setState('starting', null);

    /** The new agent did not work: go back to the previous one and remember not to retry this version. */
    const rollbackNow = (why: string): void => {
      const tag = rollbackTag;
      if (!tag) return;
      rollbackTag = null;
      log.error(`playit ${tag} failed (${why}), going back to the previous agent.`);
      void (async () => {
        try {
          await fsp.writeFile(failedFile, tag, 'utf8');
          await restoreAgent();
        } catch (e) {
          log.error('Rollback of the playit agent failed:', e);
        }
      })();
    };

    const accepted = (): void => {
      if (!rollbackTag) return;
      rollbackTag = null;
      void dropAgentBackup();
      void fsp.rm(failedFile, { force: true });
    };

    let proc: ChildProcess;
    try {
      // --stdout: plain text log instead of the TUI (a TUI shows nothing when the agent runs inside this app).
      // --secret_path: keep the key in the app's folder so we know when the user has linked the agent.
      proc = spawn(exePath, ['--stdout', '--secret_path', secretPath], {
        cwd: agentDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (e) {
      log.error('Could not start playit agent:', e);
      rollbackNow('spawn failed');
      setState('error', null);
      throw new AppException('UNKNOWN', 'Could not start the playit agent');
    }
    child = proc;

    const onData = (data: Buffer): void => {
      const text = data.toString('utf8');
      log.info('[playit]', text.trim().slice(0, 500)); // so we know later what the agent printed
      const parsed = parsePlayitOutput(text);
      if (parsed.claimUrl && current.state !== 'running') {
        accepted();
        setState('needs-claim', parsed.claimUrl);
      } else if (parsed.connected && current.state !== 'running') {
        accepted();
        setState('running', null);
        void backupSecret();
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    proc.on('error', (err) => {
      log.error('playit agent error:', err);
      if (child === proc) child = null;
      clearPoll();
      rollbackNow('process error');
      setState('error', null);
    });
    proc.on('exit', (code) => {
      if (child === proc) child = null;
      clearPoll();
      if (stopRequested || code === 0 || code === null) {
        setState('stopped', null);
      } else {
        rollbackNow(`exit code ${code}`);
        setState('error', null);
      }
    });

    // The key file only appears after the user has linked the agent: process alive + key present = running.
    clearPoll();
    poll = setInterval(() => {
      if (child === proc && (current.state === 'starting' || current.state === 'needs-claim') && existsSync(secretPath)) {
        accepted();
        setState('running', null);
        void backupSecret();
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

  async function reset(): Promise<void> {
    await stop();
    // Both files go: if only the key stayed, the backup would be restored and the old key used again.
    await fsp.rm(secretPath, { force: true });
    await fsp.rm(secretBak, { force: true });
    setState(existsSync(exePath) ? 'stopped' : 'not-installed', null);
  }

  return { status, start, stop, reset, shutdown: stop };
}
