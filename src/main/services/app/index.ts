import { app, dialog, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { readdir, rm, statfs } from 'node:fs/promises'
import { arch, cpus, freemem, networkInterfaces, totalmem } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { AppException } from '@shared/types'
import type { AppApi, ContentService, EngineService } from '@shared/services'
import type { AppConfig, AppPaths, SystemInfo } from '@shared/types'
import type { Emit, Logger } from '@shared/ipc'
import type { LifecycleController } from '../../lifecycle'
import type { SettingsStore } from '../../settings'
import type { UpdaterController } from '../../updater'
import type { WindowController } from '../../window'

export interface AppServiceDeps {
  paths: AppPaths
  config: AppConfig
  settings: SettingsStore
  emit: Emit
  log: Logger
  lifecycle: LifecycleController
  updater: UpdaterController
  content: ContentService
  engine: EngineService
  windows: WindowController
}

function isInside(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function realOrResolved(p: string): string {
  const abs = resolve(p)
  try {
    return realpathSync(abs)
  } catch {
    return abs
  }
}

export function createAppService(deps: AppServiceDeps): AppApi {
  const { paths, config, settings, log, lifecycle, updater, content, engine, windows } = deps

  async function freeDiskMb(): Promise<number> {
    try {
      const s = await statfs(paths.dataDir)
      return Math.floor((Number(s.bavail) * Number(s.bsize)) / (1024 * 1024))
    } catch (err) {
      log.warn('statfs failed:', err)
      return 0
    }
  }

  function localIps(): string[] {
    const ips: string[] = []
    for (const list of Object.values(networkInterfaces())) {
      for (const a of list ?? []) {
        const family = String(a.family)
        if ((family === 'IPv4' || family === '4') && !a.internal) ips.push(a.address)
      }
    }
    return ips
  }

  return {
    async getConfig() {
      return config
    },
    async getSettings() {
      return settings.get()
    },
    async updateSettings(patch) {
      return settings.update(patch)
    },
    async resetSettings() {
      return settings.reset()
    },
    async getPaths() {
      return paths
    },
    async getSystemInfo(): Promise<SystemInfo> {
      return {
        totalRamMb: Math.floor(totalmem() / (1024 * 1024)),
        freeRamMb: Math.floor(freemem() / (1024 * 1024)),
        cpuCores: cpus().length,
        freeDiskMb: await freeDiskMb(),
        localIps: localIps()
      }
    },
    async pickFile(filters) {
      const win = windows.getWindow()
      const options = { properties: ['openFile' as const], filters }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
    async pickFolder() {
      const win = windows.getWindow()
      const options = { properties: ['openDirectory' as const, 'createDirectory' as const] }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
    async openExternal(url) {
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new AppException('INVALID_INPUT', 'Invalid URL')
      }
      if (parsed.protocol !== 'https:') throw new AppException('INVALID_INPUT', 'Only https links can be opened')
      await shell.openExternal(parsed.toString())
    },
    async openPath(absPath) {
      if (typeof absPath !== 'string' || !isAbsolute(absPath)) throw new AppException('INVALID_INPUT', 'Path must be absolute')
      const target = realOrResolved(absPath)
      const allowed = [paths.userData, paths.dataDir].map(realOrResolved)
      if (!allowed.some((base) => isInside(base, target))) throw new AppException('PATH_OUTSIDE_SERVER')
      if (!existsSync(target)) throw new AppException('NOT_FOUND')
      const error = await shell.openPath(target)
      if (error) throw new AppException('UNKNOWN', error)
    },
    checkUpdate: () => updater.check(),
    downloadUpdate: () => updater.download(),
    installUpdate: () => updater.install(),
    confirmQuit: () => lifecycle.confirmQuit(),
    async cancelQuit() {
      lifecycle.cancelQuit()
    },
    forceQuit: () => lifecycle.forceQuit(),
    respondClose: (action, remember) => {
      if (action !== 'tray' && action !== 'quit') return Promise.reject(new AppException('INVALID_INPUT'))
      return lifecycle.respondClose(action, remember === true)
    },
    async uninstall({ deleteAllData }) {
      if (!app.isPackaged) throw new AppException('INVALID_INPUT', 'Uninstall only works in the installed app')
      if (engine.runningServerIds().length > 0) throw new AppException('SERVER_RUNNING')
      const uninstaller = join(dirname(process.execPath), `Uninstall ${config.appName}.exe`)
      if (process.platform === 'win32' && !existsSync(uninstaller)) throw new AppException('NOT_FOUND', 'Uninstaller not found')

      await content.shutdown()

      if (deleteAllData) {
        // Only the folders this app owns are removed (never the whole dataDir: the user may have chosen e.g. Documents).
        for (const dir of [paths.serversDir, paths.javaDir]) {
          await rm(dir, { recursive: true, force: true })
        }
        try {
          if ((await readdir(paths.dataDir)).length === 0) await rm(paths.dataDir, { recursive: true, force: true })
        } catch {
          /* already gone */
        }
      }

      if (process.platform === 'win32') {
        spawn(uninstaller, [], { detached: true, stdio: 'ignore' }).unref()
        if (deleteAllData) {
          // Wait for this app to exit, then remove userData.
          spawn('cmd.exe', ['/d', '/s', '/c', `"ping 127.0.0.1 -n 8 >nul & rmdir /s /q "${paths.userData}""`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            windowsVerbatimArguments: true
          }).unref()
        }
      } else if (deleteAllData) {
        spawn('sh', ['-c', `sleep 6; rm -rf "${paths.userData}"`], { detached: true, stdio: 'ignore' }).unref()
      }
      log.info('Uninstall started on', arch())
      lifecycle.exitImmediately()
    }
  }
}
