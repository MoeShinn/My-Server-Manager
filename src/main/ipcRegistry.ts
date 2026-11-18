import { BrowserWindow, ipcMain } from 'electron'
import { INTERNAL_METHODS } from '@shared/constants'
import type { Emit, Logger } from '@shared/ipc'
import type { ErrorCode } from '@shared/types'

export type ServiceGroup = 'servers' | 'content' | 'files' | 'language' | 'app'
export const SERVICE_GROUPS: readonly ServiceGroup[] = ['servers', 'content', 'files', 'language', 'app']

const ERROR_CODES: ReadonlySet<string> = new Set([
  'PORT_IN_USE', 'EULA_NOT_ACCEPTED', 'SERVER_RUNNING', 'SERVER_NOT_RUNNING', 'NOT_FOUND', 'JAVA_MISSING', 'DOWNLOAD_FAILED',
  'HASH_MISMATCH', 'NETWORK', 'PATH_OUTSIDE_SERVER', 'STORAGE_LIMIT', 'INVALID_INPUT', 'CANCELLED', 'UNKNOWN'
])
const INTERNAL: ReadonlySet<string> = new Set(INTERNAL_METHODS)

export type IpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: ErrorCode; message: string; params?: Record<string, string | number> } }

function listMethodNames(target: object): string[] {
  const names = new Set<string>()
  let obj: object | null = target
  while (obj && obj !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === 'constructor' || key.startsWith('_')) continue
      const desc = Object.getOwnPropertyDescriptor(obj, key)
      if (desc && typeof desc.value === 'function') names.add(key)
    }
    obj = Object.getPrototypeOf(obj) as object | null
  }
  return [...names]
}

function toError(err: unknown, log: Logger, channel: string): IpcResult {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && ERROR_CODES.has(code)) {
      const params = (err as { params?: unknown }).params
      return {
        ok: false,
        error: { code: code as ErrorCode, message: err.message, params: params as Record<string, string | number> | undefined }
      }
    }
  }
  log.error(`Unexpected error in ${channel}:`, err)
  return { ok: false, error: { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) } }
}

export function registerServices(services: Record<ServiceGroup, object>, log: Logger): void {
  for (const group of SERVICE_GROUPS) {
    const service = services[group]
    for (const name of listMethodNames(service)) {
      if (INTERNAL.has(name)) continue
      const fn = (service as Record<string, unknown>)[name] as (...a: unknown[]) => unknown
      const channel = `${group}:${name}`
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (_event, args: unknown): Promise<IpcResult> => {
        try {
          const value = await fn.apply(service, Array.isArray(args) ? args : [])
          return { ok: true, value }
        } catch (err) {
          return toError(err, log, channel)
        }
      })
    }
  }
}

/** Sends an event to every open window. */
export const emit: Emit = (channel, payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload)
  }
}
