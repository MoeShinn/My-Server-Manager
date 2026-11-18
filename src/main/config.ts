import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import type { AppConfig } from '@shared/types'
import type { Logger } from '@shared/ipc'

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'My Server Manager',
  appId: 'com.example.mcservermanager',
  appVersion: '1.0.0',
  appRepo: 'OWNER/REPO',
  dataRepo: 'OWNER/REPO',
  dataBranch: 'main',
  languageFolder: 'language',
  defaultLanguage: 'en',
  windowMode: 'maximized',
  windowWidth: 1280,
  windowHeight: 800,
  privacyPolicyUrl: '',
  licenseUrl: '',
  appIcon: 'assets/icon.png',
  installerIcon: '',
  userAgent: 'McServerManager/1.0'
}

/** Splits "owner/repo"; returns null for placeholders or malformed values. */
export function parseRepo(repo: string): { owner: string; repo: string } | null {
  if (repo === 'OWNER/REPO') return null
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo)
  return m ? { owner: m[1], repo: m[2] } : null
}

export function loadConfig(resourcesDir: string, log: Logger): AppConfig {
  const config: AppConfig = { ...DEFAULT_CONFIG }
  let table: Record<string, unknown> = {}
  try {
    table = parse(readFileSync(join(resourcesDir, 'config.toml'), 'utf8')) as Record<string, unknown>
  } catch (err) {
    log.warn('config.toml missing or invalid, using defaults:', err)
    return config
  }

  const str = (key: string, def: string, allowEmpty = false): string => {
    const v = table[key]
    if (v === undefined) return def
    if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) {
      log.warn(`config.toml: "${key}" must be ${allowEmpty ? 'a string' : 'a non-empty string'}, using default`)
      return def
    }
    return v.trim()
  }
  const int = (key: string, def: number, min: number, max: number): number => {
    const v = table[key]
    if (v === undefined) return def
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      log.warn(`config.toml: "${key}" must be an integer from ${min} to ${max}, using default`)
      return def
    }
    return v
  }

  config.appName = str('app_name', config.appName)
  config.appId = str('app_id', config.appId)
  config.appVersion = str('app_version', config.appVersion)
  config.appRepo = str('app_repo', config.appRepo)
  config.dataRepo = str('data_repo', config.dataRepo)
  config.dataBranch = str('data_branch', config.dataBranch)
  config.languageFolder = str('language_folder', config.languageFolder)
  config.defaultLanguage = str('default_language', config.defaultLanguage)
  const mode = table['window_mode']
  if (mode === undefined) {
    /* default */
  } else if (mode === 'maximized' || mode === 'normal') {
    config.windowMode = mode
  } else {
    log.warn('config.toml: "window_mode" must be "maximized" or "normal", using default')
  }
  config.windowWidth = int('window_width', config.windowWidth, 640, 10000)
  config.windowHeight = int('window_height', config.windowHeight, 480, 10000)
  config.privacyPolicyUrl = str('privacy_policy_url', '', true)
  config.licenseUrl = str('license_url', '', true)
  config.appIcon = str('app_icon', config.appIcon)
  config.installerIcon = str('installer_icon', '', true)
  config.userAgent = str('user_agent', config.userAgent)
  return config
}
