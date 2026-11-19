import { app } from 'electron'
import { gt, valid } from 'semver'
import { parse } from 'smol-toml'
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
const REQUEST_TIMEOUT_MS = 15_000
/** Branch whose config.toml holds the newest app_version. */
const VERSION_BRANCH = 'main'

/** Short technical reason for the UI/log, e.g. "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" or "HTTP 404". */
function describeError(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown } | null
  if (e && typeof e.code === 'string' && e.code !== '') return e.code
  const msg = e && typeof e.message === 'string' ? e.message : String(err)
  return msg.split('\n')[0].slice(0, 120)
}

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

  function fail(err: unknown, version: string | null = null): void {
    const detail = describeError(err)
    log.error('Update failed:', detail, err)
    setState({ state: 'error', version, percent: null, detail })
  }

  function getUpdater(): Promise<import('electron-updater').AppUpdater> {
    if (!ready) {
      ready = import('electron-updater').then(({ autoUpdater }) => {
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.allowPrerelease = false
        autoUpdater.on('update-available', (info) => setState({ state: 'available', version: info.version, percent: null }))
        autoUpdater.on('update-not-available', () => setState({ state: 'none', version: null, percent: null }))
        autoUpdater.on('download-progress', (p) =>
          setState({ state: 'downloading', version: state.version, percent: Math.round(p.percent) })
        )
        autoUpdater.on('update-downloaded', (info) => setState({ state: 'ready', version: info.version, percent: 100 }))
        // Errors are reported by check()/download() (they know the failure's context); only log here.
        autoUpdater.on('error', (err) => log.error('autoUpdater error:', err))
        return autoUpdater
      })
    }
    return ready
  }

  /** Reads app_version from config.toml on the main branch (raw.githubusercontent.com). */
  async function fetchRemoteVersion(): Promise<string> {
    const url = `https://raw.githubusercontent.com/${repo!.owner}/${repo!.repo}/${VERSION_BRANCH}/config.toml?t=${Date.now()}`
    const res = await fetch(url, {
      headers: { 'User-Agent': config.userAgent, 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} (config.toml)`)
    const table = parse(await res.text()) as Record<string, unknown>
    const raw = typeof table.app_version === 'string' ? table.app_version.trim() : ''
    const version = valid(raw)
    if (!version) throw new Error(`Invalid app_version in remote config.toml: '${raw}'`)
    return version
  }

  /**
   * Points electron-updater at the release folder of one exact version:
   *   https://github.com/<owner>/<repo>/releases/download/v<version>/latest.yml
   * so it never has to guess which release is "Latest" and other releases cannot interfere.
   * latest.yml still provides sha512 + blockmap for verified/differential downloads.
   */
  async function checkVersioned(updater: import('electron-updater').AppUpdater, version: string): Promise<void> {
    updater.setFeedURL({
      provider: 'generic',
      url: `https://github.com/${repo!.owner}/${repo!.repo}/releases/download/v${version}`
    })
    await updater.checkForUpdates()
  }

  return {
    async check() {
      if (!enabled) return state
      if (state.state === 'downloading' || state.state === 'ready') return state
      try {
        const updater = await getUpdater()

        let remote: string | null = null
        try {
          remote = await fetchRemoteVersion()
        } catch (err) {
          log.warn('Could not read remote config.toml, falling back to GitHub "latest" release:', err)
        }

        if (remote !== null) {
          const current = app.getVersion()
          log.info(`Update check: current ${current}, remote ${remote}`)
          if (!gt(remote, current)) {
            setState({ state: 'none', version: null, percent: null })
            return state
          }
          try {
            await checkVersioned(updater, remote)
          } catch (err) {
            // Version bumped in config.toml but the release (latest.yml / installer) is not published yet.
            fail(err, remote)
          }
          return state
        }

        // Fallback: previous behaviour (GitHub "Latest" release).
        updater.setFeedURL({ provider: 'github', owner: repo!.owner, repo: repo!.repo })
        await updater.checkForUpdates()
      } catch (err) {
        fail(err)
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
        fail(err, state.version)
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
