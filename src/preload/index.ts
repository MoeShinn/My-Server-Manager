import { contextBridge, ipcRenderer } from 'electron'
import type { EventChannel } from '@shared/ipc'

// Sandboxed preload: only 'electron' may be imported at runtime (everything else is type-only).
const EVENT_CHANNELS: { [K in EventChannel]: true } = {
  'servers:changed': true,
  'server:status': true,
  'server:console': true,
  'server:stats': true,
  'server:players': true,
  'download:progress': true,
  'playit:status': true,
  'app:quit-requested': true,
  'app:close-requested': true,
  'app:quit-progress': true,
  'app:update': true
}

const INVOKE_PATTERN = /^(servers|content|files|language|app):[A-Za-z][A-Za-z0-9]*$/

contextBridge.exposeInMainWorld('mcmBridge', {
  invoke(channel: string, args: unknown[]): Promise<unknown> {
    if (typeof channel !== 'string' || !INVOKE_PATTERN.test(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel, Array.isArray(args) ? args : [])
  },
  on(channel: string, cb: (payload: unknown) => void): () => void {
    if (!Object.prototype.hasOwnProperty.call(EVENT_CHANNELS, channel)) {
      throw new Error(`Unknown event channel: ${String(channel)}`)
    }
    const listener = (_event: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
})
