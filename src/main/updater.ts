import { app } from 'electron'
import { AppException } from '@shared/types'
import type { AppConfig, UpdateState } from '@shared/types'
import type { Emit, Logger } from '@shared/ipc'
import { parseRepo } from './config'
import type { SettingsStore } from './settings'

export interface UpdaterController {
  check(): Promise<UpdateState>
  download(): Promise<void>
  install(): Promise<void>
  start(): void
}

const FIRST_CHECK_MS = 10_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function createUpdater(opts: {
  config: AppConfig
  settings: SettingsStore
  emit: Emit
  log: Logger
  exitWith(action: () => void): Promise<void>
}): UpdaterController {
  const { config, settings, emit, log } = opts
  const repo = parseRepo(config.appRepo)
  const enabled = app.isPackaged && repo !== null
  let state: UpdateState = { state: 'none', version: null, percent: null }
  let ready: Promise<import('electron-updater').AppUpdater> | null = null

  function setState(next: UpdateState): void {
    state = next
    emit('app:update', state)
  }

  function getUpdater(): Promise<import('electron-updater').AppUpdater> {
    if (!ready) {
      ready = import('electron-updater').then(({ autoUpdater }) => {
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.allowPrerelease = false
        autoUpdater.setFeedURL({ provider: 'github', owner: repo!.owner, repo: repo!.repo })
        autoUpdater.on('update-available', (info) => setState({ state: 'available', version: info.version, percent: null }))
        autoUpdater.on('update-not-available', () => setState({ state: 'none', version: null, percent: null }))
        autoUpdater.on('download-progress', (p) =>
          setState({ state: 'downloading', version: state.version, percent: Math.round(p.percent) })
        )
        autoUpdater.on('update-downloaded', (info) => setState({ state: 'ready', version: info.version, percent: 100 }))
        autoUpdater.on('error', (err) => {
          log.error('autoUpdater error:', err)
          setState({ state: 'error', version: state.version, percent: null })
        })
        return autoUpdater
      })
    }
    return ready
  }

  return {
    async check() {
      if (!enabled) return state
      if (state.state === 'downloading' || state.state === 'ready') return state
      try {
        const updater = await getUpdater()
        await updater.checkForUpdates()
      } catch (err) {
        log.warn('checkForUpdates failed:', err)
        setState({ state: 'error', version: null, percent: null })
      }
      return state
    },
    async download() {
      if (!enabled || state.state !== 'available') return
      try {
        setState({ state: 'downloading', version: state.version, percent: 0 })
        const updater = await getUpdater()
        await updater.downloadUpdate()
      } catch (err) {
        log.error('downloadUpdate failed:', err)
        setState({ state: 'error', version: state.version, percent: null })
        throw new AppException('DOWNLOAD_FAILED')
      }
    },
    async install() {
      if (!enabled || state.state !== 'ready') throw new AppException('INVALID_INPUT', 'No update is ready to install')
      const updater = await getUpdater()
      // Servers are stopped one by one first, then the installer runs.
      await opts.exitWith(() => updater.quitAndInstall(true, true))
    },
    start() {
      if (!enabled) return
      const tick = (): void => {
        if (settings.get().autoCheckUpdate) void this.check()
      }
      setTimeout(tick, FIRST_CHECK_MS)
      setInterval(tick, CHECK_INTERVAL_MS)
    }
  }
}
