// FILE: src/main/services/content/download.ts
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { AppException } from '../../../shared/types';
import type { Emit, Logger } from '../../../shared/ipc';
import { assertAllowedUrl } from './allowedHosts';
import { sleep } from './util';

export interface HashSpec {
  algo: 'sha1' | 'sha256' | 'sha512';
  value: string;
}

export interface DownloadRequest {
  url: string;
  destPath: string;
  taskId: string;
  /** Name of the thing being downloaded (e.g. "Java 21"). Not a translatable string. */
  label: string;
  hash?: HashSpec;
  /** Only for Java URLs that come from data.json. */
  allowAnyHttps?: boolean;
}

export interface Downloader {
  downloadFile(req: DownloadRequest): Promise<void>;
  cancelDownload(taskId: string): void;
}

const IDLE_TIMEOUT_MS = 60_000;
const PROGRESS_INTERVAL_MS = 150;
const MAX_ATTEMPTS = 3;
const CANCEL_FLAG_TTL_MS = 30_000;

interface AttemptState {
  controller: AbortController;
  cancelled: boolean;
  idle: boolean;
}

/** Thrown inside an attempt for problems worth another try (5xx, truncated body...). */
class RetryableError extends Error {}

export function createDownloader(deps: { userAgent: string; emit: Emit; log: Logger }): Downloader {
  const { userAgent, emit, log } = deps;
  const active = new Map<string, Set<AttemptState>>();
  // cancelDownload() called while nothing is running (e.g. between two retries): remember it briefly.
  const cancelFlags = new Map<string, NodeJS.Timeout>();

  function consumeCancelFlag(taskId: string): boolean {
    const timer = cancelFlags.get(taskId);
    if (!timer) return false;
    clearTimeout(timer);
    cancelFlags.delete(taskId);
    return true;
  }

  function cancelDownload(taskId: string): void {
    const states = active.get(taskId);
    if (states && states.size > 0) {
      for (const s of states) {
        s.cancelled = true;
        s.controller.abort();
      }
      return;
    }
    const old = cancelFlags.get(taskId);
    if (old) clearTimeout(old);
    const timer = setTimeout(() => cancelFlags.delete(taskId), CANCEL_FLAG_TTL_MS);
    timer.unref();
    cancelFlags.set(taskId, timer);
  }

  async function removePart(partPath: string): Promise<void> {
    try {
      await fsp.rm(partPath, { force: true });
    } catch {
      // ignore
    }
  }

  async function downloadFile(req: DownloadRequest): Promise<void> {
    const { taskId, label, destPath } = req;
    const partPath = `${destPath}.part`;
    const url = assertAllowedUrl(req.url, { anyHttps: req.allowAnyHttps });
    let receivedBytes = 0;
    let totalBytes: number | null = null;
    let lastEmit = 0;

    const emitState = (state: 'running' | 'done' | 'error' | 'cancelled', force: boolean): void => {
      const now = Date.now();
      if (state === 'running' && !force && now - lastEmit < PROGRESS_INTERVAL_MS) return;
      lastEmit = now;
      emit('download:progress', { taskId, label, receivedBytes, totalBytes, state });
    };

    await fsp.mkdir(path.dirname(destPath), { recursive: true });

    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      if (consumeCancelFlag(taskId)) {
        emitState('cancelled', true);
        throw new AppException('CANCELLED', `Download cancelled: ${label}`);
      }

      const state: AttemptState = { controller: new AbortController(), cancelled: false, idle: false };
      let set = active.get(taskId);
      if (!set) {
        set = new Set<AttemptState>();
        active.set(taskId, set);
      }
      set.add(state);

      let idleTimer: NodeJS.Timeout | undefined;
      try {
        receivedBytes = 0;
        totalBytes = null;
        emitState('running', true);

        const res = await fetch(url.href, {
          headers: { 'User-Agent': userAgent },
          signal: state.controller.signal,
          redirect: 'follow'
        });
        assertAllowedUrl(res.url || url.href, { anyHttps: req.allowAnyHttps });

        if (res.status === 404) throw new AppException('NOT_FOUND', `HTTP 404 for ${label}`, { label });
        if (res.status >= 500 || res.status === 429) throw new RetryableError(`HTTP ${res.status}`);
        if (!res.ok || !res.body) {
          throw new AppException('DOWNLOAD_FAILED', `HTTP ${res.status} for ${label}`, { label, status: res.status });
        }

        const lengthHeader = Number(res.headers.get('content-length'));
        const compressed = res.headers.has('content-encoding');
        totalBytes = !compressed && Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;

        const hasher = req.hash ? createHash(req.hash.algo) : null;
        const handle = await fsp.open(partPath, 'w');
        const resetIdle = (): void => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            state.idle = true;
            state.controller.abort();
          }, IDLE_TIMEOUT_MS);
        };

        try {
          resetIdle();
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            resetIdle();
            if (value && value.byteLength > 0) {
              hasher?.update(value);
              let offset = 0;
              while (offset < value.byteLength) {
                const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset);
                offset += bytesWritten;
              }
              receivedBytes += value.byteLength;
              emitState('running', false);
            }
          }
        } finally {
          if (idleTimer) clearTimeout(idleTimer);
          await handle.close();
        }

        if (totalBytes !== null && receivedBytes !== totalBytes) {
          throw new RetryableError(`Truncated download: ${receivedBytes}/${totalBytes}`);
        }

        if (hasher && req.hash) {
          const digest = hasher.digest('hex');
          if (digest.toLowerCase() !== req.hash.value.trim().toLowerCase()) {
            await removePart(partPath);
            throw new AppException('HASH_MISMATCH', `Checksum mismatch for ${label}`, { label });
          }
        }

        await fsp.rm(destPath, { force: true });
        await fsp.rename(partPath, destPath);
        totalBytes = receivedBytes;
        emitState('done', true);
        return;
      } catch (e) {
        if (idleTimer) clearTimeout(idleTimer);
        await removePart(partPath);

        if (state.cancelled) {
          emitState('cancelled', true);
          throw new AppException('CANCELLED', `Download cancelled: ${label}`);
        }
        if (e instanceof AppException) {
          emitState('error', true);
          throw e;
        }
        if (n < MAX_ATTEMPTS) {
          log.warn(`Download attempt ${n} failed for ${label}:`, e instanceof Error ? e.message : e);
          await sleep(1000 * n);
          continue;
        }
        emitState('error', true);
        throw new AppException('NETWORK', `Download failed for ${label}`, { label });
      } finally {
        set.delete(state);
        if (set.size === 0) active.delete(taskId);
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new AppException('UNKNOWN', `Download failed for ${label}`);
  }

  return { downloadFile, cancelDownload };
}
