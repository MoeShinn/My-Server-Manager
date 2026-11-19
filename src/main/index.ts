import { Menu, app, session } from 'electron'
import { join } from 'node:path'
import type { ServiceDeps } from '@shared/services'
import { loadConfig } from './config'
import { createLifecycle } from './lifecycle'
import type { LifecycleController } from './lifecycle'
import { createLogger } from './logger'
import { emit, registerServices } from './ipcRegistry'
import { createAppPaths, getResourcesDir, getUserDataDir } from './paths'
import { createSettingsStore } from './settings'
import { createTray } from './tray'
import { createUpdater } from './updater'
import { createWindowController } from './window'
import { createAppService } from './services/app'
import { createContentService } from './services/content'
import { createEngineService } from './services/engine'
import { createFilesService } from './services/files'
import { createLanguageService } from './services/language'

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit() // another instance is already running and will be brought to front
    return
  }

  const startHidden = process.argv.includes('--hidden')
  const userDataDir = getUserDataDir()
  const log = createLogger(join(userDataDir, 'logs'))
  process.on('uncaughtException', (err) => log.error('uncaughtException:', err))
  process.on('unhandledRejection', (err) => log.error('unhandledRejection:', err))

  const config = loadConfig(getResourcesDir(), log)
  app.setAppUserModelId(config.appId)
  const settings = createSettingsStore({ userDataDir, config, log })
  const paths = createAppPaths({ dataDir: settings.get().dataDir, log })

  let lifecycle: LifecycleController | null = null
  const windows = createWindowController({
    config,
    paths,
    settings,
    log,
    startHidden,
    shouldAllowClose: () => lifecycle?.isQuitting() ?? false,
    onCloseRequest: () => lifecycle?.handleCloseButton(),
    onSessionEnd: () => lifecycle?.handleSessionEnd()
  })

  app.on('second-instance', () => windows.reveal())
  app.on('window-all-closed', () => {
    /* lifetime is controlled by the tray and the safe-quit flow */
  })

  await app.whenReady()
  if (app.isPackaged) Menu.setApplicationMenu(null)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  // Wiring order is fixed by the contract: content, engine, files, language, app.
  const deps: ServiceDeps = { paths, config, getSettings: () => settings.get(), emit, log }
  const content = createContentService(deps)
  const engine = createEngineService({ ...deps, content })
  const files = createFilesService({ ...deps, getServerFolder: (id) => engine.getServerFolder(id) })
  const language = createLanguageService({
    ...deps,
    getDataJson: (opts) => content.getDataJson(opts),
    setLanguage: async (code) => {
      settings.update({ language: code })
    }
  })
  settings.setRunningServersCheck(() => engine.runningServerIds())

  const lc = createLifecycle({ settings, engine, content, language, windows, emit, log })
  lifecycle = lc
  const updater = createUpdater({ config, settings, emit, log, exitWith: (action) => lc.exitWith(action) })
  const appService = createAppService({ paths, config, settings, emit, log, lifecycle: lc, updater, content, engine, windows })

  registerServices({ servers: engine, content, files, language, app: appService }, log)

  const tray = createTray({
    config,
    windows,
    getDictionary: () => language.getDictionary(settings.get().language),
    onOpen: () => windows.reveal(),
    onQuit: () => lc.requestQuit(),
    log
  })
  lc.attachTray(tray)
  settings.onChange((next, prev) => {
    if (next.language !== prev.language) void tray?.rebuild()
  })
  app.on('will-quit', () => tray?.destroy())

  windows.create()
  updater.start()

  void windows.whenReady().then(async () => {
    try {
      await engine.recoverOrphans()
    } catch (err) {
      log.error('recoverOrphans failed:', err)
    }
    engine.startAutoStartServers().catch((err) => log.error('startAutoStartServers failed:', err))
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  app.exit(1)
})
