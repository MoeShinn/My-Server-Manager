import { create } from 'zustand'
import type { AppConfig, AppSettings, ServerStatus, ServerSummary } from '@shared/types'
import { api } from '@/api'
import { startStatsHistory } from './statsHistory'

interface SettingsState {
  settings: AppSettings | null
  config: AppConfig | null
  /** Bumped on every reload so dependants (e.g. the dictionary) can refresh. */
  reloadToken: number
  load(): Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  config: null,
  reloadToken: 0,
  async load() {
    try {
      const [settings, config] = await Promise.all([api.app.getSettings(), api.app.getConfig()])
      set((s) => ({ settings, config, reloadToken: s.reloadToken + 1 }))
    } catch (err) {
      console.error('Cannot load settings', err)
    }
  }
}))

interface ServersState {
  servers: ServerSummary[]
  loaded: boolean
  load(): Promise<void>
  setStatus(id: string, status: ServerStatus): void
  setPlayers(id: string, online: number, max: number): void
}

let loadSeq = 0

export const useServersStore = create<ServersState>()((set) => ({
  servers: [],
  loaded: false,
  async load() {
    const seq = ++loadSeq
    try {
      const servers = await api.servers.list()
      if (seq === loadSeq) set({ servers, loaded: true })
    } catch (err) {
      console.error('Cannot load servers', err)
      if (seq === loadSeq) set({ loaded: true })
    }
  },
  setStatus(id, status) {
    set((s) => ({
      servers: s.servers.map((sv) =>
        sv.id === id ? { ...sv, status, playersOnline: status === 'stopped' || status === 'crashed' ? 0 : sv.playersOnline } : sv
      )
    }))
  },
  setPlayers(id, online, max) {
    set((s) => ({ servers: s.servers.map((sv) => (sv.id === id ? { ...sv, playersOnline: online, playersMax: max } : sv)) }))
  }
}))

export const ACTIVE_STATUSES: readonly ServerStatus[] = ['starting', 'running', 'stopping']

/** Starts loading and subscribing once; returns the cleanup function. */
export function initStores(): () => void {
  void useSettingsStore.getState().load()
  void useServersStore.getState().load()
  const offs = [
    startStatsHistory(),
    api.on('servers:changed', () => void useServersStore.getState().load()),
    api.on('server:status', (p) => useServersStore.getState().setStatus(p.id, p.status)),
    api.on('server:players', (p) => useServersStore.getState().setPlayers(p.id, p.online.length, p.max))
  ]
  const onSettings = (): void => void useSettingsStore.getState().load()
  window.addEventListener('mcm:settings-changed', onSettings)
  return () => {
    offs.forEach((off) => off())
    window.removeEventListener('mcm:settings-changed', onSettings)
  }
}
