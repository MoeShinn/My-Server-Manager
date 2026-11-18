import { app } from 'electron'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { AppException } from '@shared/types'
import type { AppConfig, AppSettings } from '@shared/types'
import type { Logger } from '@shared/ipc'
import { defaultDataDir } from './paths'

export interface SettingsStore {
  get(): AppSettings
  update(patch: Partial<AppSettings>): AppSettings
  reset(): AppSettings
  onChange(cb: (next: AppSettings, prev: AppSettings) => void): () => void
  setRunningServersCheck(fn: () => string[]): void
}

const THEMES = ['dark', 'light'] as const
const CLOSE_ACTIONS = ['tray', 'ask', 'quit'] as const
const BOOL_KEYS = ['launchAtLogin', 'autoCheckUpdate', 'alwaysFetchFreshVersions', 'showDuplicateBuilds', 'trayNoticeShown'] as const

export function createSettingsStore(opts: { userDataDir: string; config: AppConfig; log: Logger }): SettingsStore {
  const { config, log } = opts
  const file = join(opts.userDataDir, 'settings.json')
  const listeners = new Set<(next: AppSettings, prev: AppSettings) => void>()
  let runningCheck: () => string[] = () => []

  const defaults = (): AppSettings => ({
    language: config.defaultLanguage,
    dataDir: defaultDataDir(config.appName),
    theme: 'dark',
    closeAction: 'tray',
    launchAtLogin: false,
    autoCheckUpdate: true,
    versionCacheDays: 3,
    alwaysFetchFreshVersions: false,
    showDuplicateBuilds: false,
    trayNoticeShown: false
  })

  function sanitize(raw: unknown): AppSettings {
    const result = defaults()
    if (typeof raw !== 'object' || raw === null) return result
    const r = raw as Record<string, unknown>
    if (typeof r.language === 'string' && r.language.trim() !== '') result.language = r.language.trim()
    if (typeof r.dataDir === 'string' && isAbsolute(r.dataDir)) result.dataDir = r.dataDir
    if (THEMES.includes(r.theme as 'dark')) result.theme = r.theme as AppSettings['theme']
    if (CLOSE_ACTIONS.includes(r.closeAction as 'tray')) result.closeAction = r.closeAction as AppSettings['closeAction']
    if (typeof r.versionCacheDays === 'number' && Number.isInteger(r.versionCacheDays) && r.versionCacheDays >= 1 && r.versionCacheDays <= 30) {
      result.versionCacheDays = r.versionCacheDays
    }
    for (const key of BOOL_KEYS) {
      if (typeof r[key] === 'boolean') result[key] = r[key] as boolean
    }
    return result
  }

  function load(): AppSettings {
    if (!existsSync(file)) return defaults()
    try {
      return sanitize(JSON.parse(readFileSync(file, 'utf8')))
    } catch (err) {
      log.warn('settings.json is corrupted, using defaults:', err)
      return defaults()
    }
  }

  function save(s: AppSettings): void {
    mkdirSync(opts.userDataDir, { recursive: true })
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8')
    renameSync(tmp, file) // atomic replace
  }

  function applyLoginItem(enabled: boolean): void {
    if (!app.isPackaged) return // would register electron.exe in dev
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    } catch (err) {
      log.warn('setLoginItemSettings failed:', err)
    }
  }

  let current = load()

  function commit(next: AppSettings): void {
    const prev = current
    save(next)
    current = next
    for (const cb of [...listeners]) {
      try {
        cb(next, prev)
      } catch (err) {
        log.error('settings listener failed:', err)
      }
    }
  }

  function invalid(message: string): never {
    throw new AppException('INVALID_INPUT', message)
  }

  function update(patch: Partial<AppSettings>): AppSettings {
    if (typeof patch !== 'object' || patch === null) invalid('Settings patch must be an object')
    const next: AppSettings = { ...current }

    if (patch.language !== undefined) {
      if (typeof patch.language !== 'string' || patch.language.trim() === '') invalid('language must be a non-empty string')
      next.language = patch.language.trim()
    }
    if (patch.theme !== undefined) {
      if (!THEMES.includes(patch.theme)) invalid('theme must be dark or light')
      next.theme = patch.theme
    }
    if (patch.closeAction !== undefined) {
      if (!CLOSE_ACTIONS.includes(patch.closeAction)) invalid('closeAction must be tray, ask or quit')
      next.closeAction = patch.closeAction
    }
    if (patch.versionCacheDays !== undefined) {
      const v = patch.versionCacheDays
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 30) invalid('versionCacheDays must be an integer from 1 to 30')
      next.versionCacheDays = v
    }
    for (const key of BOOL_KEYS) {
      const v = patch[key]
      if (v === undefined) continue
      if (typeof v !== 'boolean') invalid(`${key} must be a boolean`)
      next[key] = v
    }

    let relaunch = false
    if (patch.dataDir !== undefined) {
      if (typeof patch.dataDir !== 'string' || !isAbsolute(patch.dataDir)) invalid('dataDir must be an absolute path')
      const dir = resolve(patch.dataDir)
      if (dir !== resolve(current.dataDir)) {
        if (runningCheck().length > 0) throw new AppException('SERVER_RUNNING')
        try {
          mkdirSync(dir, { recursive: true })
          accessSync(dir, constants.W_OK)
        } catch {
          invalid('dataDir is not writable')
        }
        next.dataDir = dir
        relaunch = true
      }
    }

    commit(next)
    if (next.launchAtLogin !== undefined && patch.launchAtLogin !== undefined) applyLoginItem(next.launchAtLogin)
    if (relaunch) {
      // Old data is NOT moved. Give the renderer time to receive the result first.
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 500)
    }
    return next
  }

  function reset(): AppSettings {
    const next = { ...defaults(), dataDir: current.dataDir } // never touch dataDir
    commit(next)
    applyLoginItem(false)
    return next
  }

  return {
    get: () => ({ ...current }),
    update,
    reset,
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    setRunningServersCheck(fn) {
      runningCheck = fn
    }
  }
}
