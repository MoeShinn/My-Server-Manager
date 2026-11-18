import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppPaths } from '@shared/types'
import type { Logger } from '@shared/ipc'

export function getUserDataDir(): string {
  return app.getPath('userData')
}

/** Dev: project root. Packaged: process.resourcesPath. */
export function getResourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath()
}

export function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned.length > 0 ? cleaned : 'MinecraftServerManager'
}

export function defaultDataDir(appName: string): string {
  return join(app.getPath('documents'), sanitizeFolderName(appName))
}

/** Builds the single AppPaths object shared by every service and creates the folders. */
export function createAppPaths(opts: { dataDir: string; log: Logger }): AppPaths {
  const userData = getUserDataDir()
  const paths: AppPaths = {
    userData,
    resourcesDir: getResourcesDir(),
    dataDir: opts.dataDir,
    serversDir: join(opts.dataDir, 'servers'),
    javaDir: join(opts.dataDir, 'java'),
    cacheDir: join(userData, 'cache'),
    languageDir: join(userData, 'language'),
    logsDir: join(userData, 'logs')
  }
  const dirs = [paths.userData, paths.dataDir, paths.serversDir, paths.javaDir, paths.cacheDir, paths.languageDir, paths.logsDir]
  for (const dir of dirs) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err) {
      opts.log.error('Cannot create folder', dir, err)
    }
  }
  return paths
}

/** Copies bundled language files to userData/language when they are not there yet (first run). */
export function seedBundledLanguages(paths: AppPaths, log: Logger): void {
  const source = join(paths.resourcesDir, 'language')
  if (!existsSync(source)) return
  try {
    for (const file of readdirSync(source)) {
      if (!file.toLowerCase().endsWith('.json')) continue
      const dest = join(paths.languageDir, file)
      if (!existsSync(dest)) copyFileSync(join(source, file), dest)
    }
  } catch (err) {
    log.warn('Cannot seed bundled language files', err)
  }
}
