// FILE: src/main/services/content/http.ts
import { AppException } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import { assertAllowedUrl } from './allowedHosts';
import { sleep } from './util';

export interface Http {
  userAgent: string;
  /** GET a JSON document. 30s timeout, 2 retries on network errors and 5xx, one retry on 429. */
  getJson(url: string, opts?: { headers?: Record<string, string>; retries?: number }): Promise<unknown>;
  /** POST a JSON body and read a JSON answer. Same timeout and retry rules as getJson. */
  postJson(url: string, body: unknown, opts?: { headers?: Record<string, string>; retries?: number }): Promise<unknown>;
}

const TIMEOUT_MS = 30_000;

export function createHttp(deps: { userAgent: string; log: Logger }): Http {
  const { userAgent, log } = deps;

  async function requestJson(
    method: 'GET' | 'POST',
    rawUrl: string,
    body: unknown,
    opts?: { headers?: Record<string, string>; retries?: number }
  ): Promise<unknown> {
    const url = assertAllowedUrl(rawUrl);
    const maxRetries = opts?.retries ?? 2;
    let attempt = 0;
    let rateLimitedOnce = false;

    for (;;) {
      try {
        const res = await fetch(url.href, {
          method,
          headers: {
            'User-Agent': userAgent,
            Accept: 'application/json',
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            ...(opts?.headers ?? {})
          },
          body: method === 'POST' ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: 'follow'
        });
        assertAllowedUrl(res.url || url.href);

        if (res.status === 429 && !rateLimitedOnce) {
          rateLimitedOnce = true;
          const retryAfter = Number(res.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 2000;
          log.warn(`HTTP 429 from ${url.hostname}, waiting ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        if (res.status >= 500 || res.status === 429) {
          if (attempt < maxRetries) {
            attempt++;
            await sleep(600 * attempt);
            continue;
          }
          throw new AppException('NETWORK', `HTTP ${res.status} from ${url.hostname}`, { status: res.status });
        }
        if (res.status === 404) {
          throw new AppException('NOT_FOUND', `HTTP 404: ${url.href}`);
        }
        if (!res.ok) {
          throw new AppException('DOWNLOAD_FAILED', `HTTP ${res.status} from ${url.hostname}`, { status: res.status });
        }

        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new AppException('DOWNLOAD_FAILED', `Invalid JSON from ${url.hostname}`);
        }
      } catch (e) {
        if (e instanceof AppException) throw e;
        if (attempt < maxRetries) {
          attempt++;
          log.warn(`Network error for ${url.hostname}, retry ${attempt}:`, e);
          await sleep(600 * attempt);
          continue;
        }
        throw new AppException('NETWORK', `Network error for ${url.hostname}`, { host: url.hostname });
      }
    }
  }

  const getJson: Http['getJson'] = (url, opts) => requestJson('GET', url, undefined, opts);
  const postJson: Http['postJson'] = (url, body, opts) => requestJson('POST', url, body, opts);

  return { userAgent, getJson, postJson };
}
