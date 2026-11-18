import { BrowserWindow, app, nativeImage, shell } from 'electron'
import type { NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AppConfig, AppPaths } from '@shared/types'
import type { Logger } from '@shared/ipc'
import type { SettingsStore } from './settings'

// Same as --bg in styles/index.css (avoids a white flash before the page paints).
const BG_DARK = '#0f1318'
const BG_LIGHT = '#f2f4f7'

export interface WindowController {
  create(): BrowserWindow
  getWindow(): BrowserWindow | null
  /** Shows, restores and focuses the window (maximizes on first reveal when windowMode = maximized). */
  reveal(): void
  hide(): void
  whenReady(): Promise<void>
  loadIcon(): NativeImage | undefined
}

export function createWindowController(opts: {
  config: AppConfig
  paths: AppPaths
  settings: SettingsStore
  log: Logger
  startHidden: boolean
  shouldAllowClose(): boolean
  onCloseRequest(): void
  onSessionEnd(): void
}): WindowController {
  const { config, paths, log } = opts
  let win: BrowserWindow | null = null
  let revealedOnce = false
  let resolveReady: () => void = () => undefined
  const ready = new Promise<void>((r) => {
    resolveReady = r
  })

  function loadIcon(): NativeImage | undefined {
    const iconPath = join(paths.resourcesDir, config.appIcon)
    if (!existsSync(iconPath)) {
      log.warn('App icon not found:', iconPath)
      return undefined
    }
    const img = nativeImage.createFromPath(iconPath)
    return img.isEmpty() ? undefined : img
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const useDevServer = !!devUrl && !app.isPackaged

  function isInternalUrl(url: string): boolean {
    try {
      if (useDevServer && devUrl) return new URL(url).origin === new URL(devUrl).origin
      return url.startsWith('file://')
    } catch {
      return false
    }
  }

  function openExternalIfHttps(url: string): void {
    try {
      if (new URL(url).protocol === 'https:') void shell.openExternal(url)
    } catch {
      /* ignore invalid urls */
    }
  }

  function reveal(): void {
    if (!win || win.isDestroyed()) return
    if (!revealedOnce) {
      revealedOnce = true
      if (config.windowMode === 'maximized') win.maximize() // not fullscreen: taskbar stays visible
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function create(): BrowserWindow {
    const theme = opts.settings.get().theme
    const created = new BrowserWindow({
      show: false,
      width: config.windowWidth,
      height: config.windowHeight,
      minWidth: 960,
      minHeight: 600,
      title: config.appName,
      icon: loadIcon(),
      backgroundColor: theme === 'light' ? BG_LIGHT : BG_DARK,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win = created

    created.once('ready-to-show', () => {
      if (!opts.startHidden) reveal()
      resolveReady()
    })
    created.on('close', (event) => {
      if (opts.shouldAllowClose()) return
      event.preventDefault()
      opts.onCloseRequest()
    })
    created.on('session-end', () => opts.onSessionEnd())
    created.on('closed', () => {
      if (win === created) win = null
    })

    created.webContents.setWindowOpenHandler(({ url }) => {
      openExternalIfHttps(url)
      return { action: 'deny' }
    })
    const guardNavigation = (event: Electron.Event, url: string): void => {
      if (isInternalUrl(url)) return
      event.preventDefault()
      openExternalIfHttps(url)
    }
    created.webContents.on('will-navigate', guardNavigation)
    created.webContents.on('will-redirect', guardNavigation)

    if (useDevServer && devUrl) {
      void created.loadURL(devUrl)
    } else {
      void created.loadFile(join(__dirname, '../renderer/index.html'))
    }
    // Fallback so startup tasks never wait forever if the page fails to paint.
    setTimeout(resolveReady, 15000)
    return created
  }

  return {
    create,
    getWindow: () => (win && !win.isDestroyed() ? win : null),
    reveal,
    hide: () => {
      if (win && !win.isDestroyed()) win.hide()
    },
    whenReady: () => ready,
    loadIcon
  }
}
