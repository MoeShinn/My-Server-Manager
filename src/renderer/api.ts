import type { Api, EventChannel, EventPayloads } from '@shared/ipc'
import type { ErrorCode } from '@shared/types'

type BridgeResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: ErrorCode; message: string; params?: Record<string, string | number> } }

interface McmBridge {
  invoke(channel: string, args: unknown[]): Promise<BridgeResult>
  on(channel: string, cb: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    mcmBridge: McmBridge
  }
}

export const ERROR_CODES: readonly ErrorCode[] = [
  'PORT_IN_USE', 'EULA_NOT_ACCEPTED', 'SERVER_RUNNING', 'SERVER_NOT_RUNNING', 'NOT_FOUND', 'JAVA_MISSING', 'DOWNLOAD_FAILED',
  'HASH_MISMATCH', 'NETWORK', 'PATH_OUTSIDE_SERVER', 'STORAGE_LIMIT', 'INVALID_INPUT', 'CANCELLED', 'UNKNOWN'
]

export type ApiError = Error & { code: ErrorCode; params?: Record<string, string | number> }

export function getErrorCode(err: unknown): ErrorCode {
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined
  return typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code) ? (code as ErrorCode) : 'UNKNOWN'
}

export function getErrorParams(err: unknown): Record<string, string | number> | undefined {
  return err instanceof Error ? (err as { params?: Record<string, string | number> }).params : undefined
}

const GROUPS = ['servers', 'content', 'files', 'language', 'app'] as const
const bridge = window.mcmBridge

function notifySettingsChanged(): void {
  window.dispatchEvent(new CustomEvent('mcm:settings-changed'))
}

async function call(group: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await bridge.invoke(`${group}:${method}`, args)
  if (!res.ok) {
    throw Object.assign(new Error(res.error.message), { code: res.error.code, params: res.error.params })
  }
  // Settings may have changed (language service also writes settings.language in main).
  if ((group === 'app' && (method === 'updateSettings' || method === 'resetSettings')) || group === 'language') {
    notifySettingsChanged()
  }
  return res.value
}

function groupProxy(group: string): object {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string' || prop === 'then') return undefined
        return (...args: unknown[]) => call(group, prop, args)
      }
    }
  )
}

const raw = {
  on<C extends EventChannel>(channel: C, cb: (payload: EventPayloads[C]) => void): () => void {
    return bridge.on(channel, (payload) => cb(payload as EventPayloads[C]))
  }
} as Record<string, unknown>
for (const g of GROUPS) raw[g] = groupProxy(g)

const api = raw as unknown as Api
window.api = api

export { api }
