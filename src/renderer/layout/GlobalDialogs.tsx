import { useEffect, useState } from 'react'
import type { QuitProgress } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, ConfirmDialog, Modal, Spinner, Toggle, useToast } from '@/components/ui'
import type { BadgeColor } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'
import { ACTIVE_STATUSES, useServersStore } from './stores'

const QUIT_STATE_COLOR: Record<QuitProgress['servers'][number]['state'], BadgeColor> = {
  waiting: 'muted',
  stopping: 'warning',
  stopped: 'success',
  timeout: 'danger'
}

export function GlobalDialogs(): JSX.Element {
  const t = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [closeOpen, setCloseOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const [quitCount, setQuitCount] = useState<number | null>(null)
  const [progress, setProgress] = useState<QuitProgress | null>(null)

  async function guard(fn: () => Promise<void>): Promise<void> {
    try {
      await fn()
    } catch (err) {
      toast.error(errText(err))
    }
  }

  useEffect(() => {
    const offClose = api.on('app:close-requested', () => {
      setRemember(false)
      setCloseOpen(true)
    })
    const offQuit = api.on('app:quit-requested', () => {
      const running = useServersStore.getState().servers.filter((s) => ACTIVE_STATUSES.includes(s.status)).length
      if (running === 0) void guard(() => api.app.confirmQuit())
      else setQuitCount(running)
    })
    const offProgress = api.on('app:quit-progress', (p) => {
      setQuitCount(null)
      setProgress(p)
    })
    return () => {
      offClose()
      offQuit()
      offProgress()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Modal
        open={closeOpen}
        title={t('app.close.title')}
        onClose={() => setCloseOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCloseOpen(false)
                void guard(() => api.app.respondClose('quit', remember))
              }}
            >
              {t('app.close.quit')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setCloseOpen(false)
                void guard(() => api.app.respondClose('tray', remember))
              }}
            >
              {t('app.close.toTray')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-fg">{t('app.close.message')}</p>
          <Toggle checked={remember} onChange={setRemember} label={t('app.close.remember')} />
        </div>
      </Modal>

      <ConfirmDialog
        open={quitCount !== null}
        title={t('app.quit.title')}
        message={t('app.quit.message', { count: quitCount ?? 0 })}
        confirmLabel={t('app.quit.confirm')}
        danger
        onCancel={() => setQuitCount(null)}
        onConfirm={() => {
          setQuitCount(null)
          void guard(() => api.app.confirmQuit())
        }}
      />

      <Modal
        open={progress !== null}
        title={t('app.quit.progressTitle')}
        dismissible={false}
        width={520}
        onClose={() => undefined}
        footer={
          progress?.state === 'timeout' ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setProgress(null)
                  void guard(() => api.app.cancelQuit())
                }}
              >
                {t('app.quit.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void guard(() => api.app.forceQuit())}>
                {t('app.quit.force')}
              </Button>
            </>
          ) : undefined
        }
      >
        {progress && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-fg">
              {progress.state !== 'timeout' && <Spinner />}
              {progress.state === 'timeout' ? t('app.quit.timeoutHint') : progress.state === 'done' ? t('app.quit.closing') : t('app.quit.progressHint')}
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {progress.servers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{s.name}</span>
                  <Badge color={QUIT_STATE_COLOR[s.state]}>{t(`app.quit.state.${s.state}`)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </>
  )
}
