import { Menu, Tray } from 'electron'
import type { AppConfig } from '@shared/types'
import type { Logger } from '@shared/ipc'
import type { WindowController } from './window'

export interface TrayController {
  rebuild(): Promise<void>
  destroy(): void
}

// Used only when the dictionary has no entry yet (e.g. language files missing).
const FALLBACK: Record<string, string> = { 'app.tray.open': 'Open app', 'app.tray.quit': 'Quit completely' }

export function createTray(opts: {
  config: AppConfig
  windows: WindowController
  getDictionary(): Promise<Record<string, string>>
  onOpen(): void
  onQuit(): void
  log: Logger
}): TrayController | null {
  const icon = opts.windows.loadIcon()
  if (!icon) return null
  let tray: Tray
  try {
    tray = new Tray(icon.resize({ width: 32, height: 32 }))
  } catch (err) {
    opts.log.error('Cannot create tray icon:', err)
    return null
  }
  tray.setToolTip(opts.config.appName)
  tray.on('click', () => opts.onOpen())

  async function rebuild(): Promise<void> {
    let dict: Record<string, string> = {}
    try {
      dict = await opts.getDictionary()
    } catch (err) {
      opts.log.warn('Tray: cannot load dictionary', err)
    }
    const t = (key: string): string => dict[key] ?? FALLBACK[key] ?? key
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('app.tray.open'), click: () => opts.onOpen() },
        { type: 'separator' },
        { label: t('app.tray.quit'), click: () => opts.onQuit() }
      ])
    )
  }

  void rebuild()
  return {
    rebuild,
    destroy: () => {
      if (!tray.isDestroyed()) tray.destroy()
    }
  }
}

