import { Notification, app } from 'electron'
import { STOP_TIMEOUT_MS } from '@shared/constants'
import type { Emit, Logger } from '@shared/ipc'
import type { ContentService, EngineService, LanguageService } from '@shared/services'
import type { QuitProgress } from '@shared/types'
import type { SettingsStore } from './settings'
import type { TrayController } from './tray'
import type { WindowController } from './window'

export interface LifecycleController {
  attachTray(tray: TrayController | null): void
  isQuitting(): boolean
  /** User clicked the window X button. */
  handleCloseButton(): void
  requestQuit(): void
  confirmQuit(): Promise<void>
  cancelQuit(): void
  forceQuit(): Promise<void>
  respondClose(action: 'tray' | 'quit', remember: boolean): Promise<void>
  handleSessionEnd(): void
  /** Stops every server safely (same flow as quitting), then runs `action` instead of app.quit(). */
  exitWith(action: () => void): Promise<void>
  /** Quits immediately without touching servers (caller already made sure none are running). */
  exitImmediately(): void
}

export function createLifecycle(opts: {
  settings: SettingsStore
  engine: EngineService
  content: ContentService
  language: LanguageService
  windows: WindowController
  emit: Emit
  log: Logger
}): LifecycleController {
  const { settings, engine, content, language, windows, emit, log } = opts
  let tray: TrayController | null = null
  let allowQuit = false
  let phase: 'idle' | 'stopping' | 'timeout' = 'idle'
  let pendingExit: (() => void) | null = null

  async function finishAndExit(): Promise<void> {
    try {
      await content.shutdown()
    } catch (err) {
      log.error('content.shutdown failed:', err)
    }
    allowQuit = true
    phase = 'idle'
    const action = pendingExit
    pendingExit = null
    if (action) action()
    else app.quit()
  }

  async function runStopFlow(): Promise<void> {
    if (phase === 'stopping') return
    if (engine.runningServerIds().length === 0) {
      await finishAndExit()
      return
    }
    phase = 'stopping'
    let last: QuitProgress | null = null
    try {
      await engine.stopAllSequential({
        perServerTimeoutMs: STOP_TIMEOUT_MS,
        onProgress: (p) => {
          last = p
          emit('app:quit-progress', p)
        }
      })
    } catch (err) {
      log.error('stopAllSequential failed:', err)
    }
    const progress = last as QuitProgress | null
    let timedOut = progress?.state === 'timeout'
    if (!timedOut && progress?.state !== 'done') timedOut = engine.runningServerIds().length > 0
    if (timedOut) {
      phase = 'timeout'
      if (progress?.state !== 'timeout') {
        emit('app:quit-progress', {
          state: 'timeout',
          servers: progress?.servers ?? engine.runningServerIds().map((id) => ({ id, name: id, state: 'timeout' as const }))
        })
      }
      return // wait for forceQuit / cancelQuit from the renderer
    }
    await finishAndExit()
  }

  function requestQuit(): void {
    windows.reveal()
    emit('app:quit-requested', null)
  }

  async function showTrayNotice(): Promise<void> {
    if (!Notification.isSupported()) return
    try {
      const dict = await language.getDictionary(settings.get().language)
      new Notification({
        title: dict['app.tray.noticeTitle'] ?? 'app.tray.noticeTitle',
        body: dict['app.tray.noticeBody'] ?? 'app.tray.noticeBody',
        icon: windows.loadIcon()
      }).show()
    } catch (err) {
      log.warn('Cannot show tray notice:', err)
    }
  }

  function hideToTray(): void {
    if (!tray) {
      requestQuit() // no tray icon = no way to bring the window back
      return
    }
    windows.hide()
    if (!settings.get().trayNoticeShown) {
      settings.update({ trayNoticeShown: true })
      void showTrayNotice()
    }
  }

  // Every quit path (app.quit() from anywhere) must go through the safe-quit flow.
  app.on('before-quit', (event) => {
    if (allowQuit) return
    event.preventDefault()
    requestQuit()
  })

  return {
    attachTray(t) {
      tray = t
    },
    isQuitting: () => allowQuit,
    handleCloseButton() {
      const action = settings.get().closeAction
      if (action === 'tray') hideToTray()
      else if (action === 'ask') {
        windows.reveal()
        emit('app:close-requested', null)
      } else requestQuit()
    },
    requestQuit,
    async confirmQuit() {
      pendingExit = null
      await runStopFlow()
    },
    cancelQuit() {
      phase = 'idle'
      pendingExit = null
    },
    async forceQuit() {
      for (const id of engine.runningServerIds()) {
        try {
          await engine.kill(id)
        } catch (err) {
          log.error('kill failed for', id, err)
        }
      }
      await finishAndExit()
    },
    async respondClose(action, remember) {
      if (remember) settings.update({ closeAction: action })
      if (action === 'tray') hideToTray()
      else requestQuit()
    },
    handleSessionEnd() {
      // Windows gives us very little time: do our best, then exit.
      log.warn('session-end: stopping all servers without asking')
      allowQuit = true
      const done = Promise.race([engine.stopAll(), new Promise<void>((r) => setTimeout(r, 4000))])
      void done
        .catch((err) => log.error('stopAll on session-end failed:', err))
        .then(() => content.shutdown())
        .catch(() => undefined)
        .finally(() => app.exit(0))
    },
    async exitWith(action) {
      pendingExit = action
      await runStopFlow()
    },
    exitImmediately() {
      allowQuit = true
      app.quit()
    }
  }
}
