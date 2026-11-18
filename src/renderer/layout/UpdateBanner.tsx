import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { api } from '@/api'
import { Button, ProgressBar, useToast } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'

export function UpdateBanner(): JSX.Element | null {
  const t = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [update, setUpdate] = useState<UpdateState>({ state: 'none', version: null, percent: null })
  const [busy, setBusy] = useState(false)

  useEffect(() => api.on('app:update', setUpdate), [])

  if (update.state === 'none' || update.state === 'error') return null
  const version = update.version ?? ''

  async function run(fn: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
      {update.state === 'available' && (
        <>
          <p className="text-fg">{t('app.update.available', { version })}</p>
          <Button size="sm" variant="primary" loading={busy} className="w-full" onClick={() => void run(() => api.app.downloadUpdate())}>
            {t('app.update.download')}
          </Button>
        </>
      )}
      {update.state === 'downloading' && <ProgressBar value={update.percent} label={t('app.update.downloading', { version })} />}
      {update.state === 'ready' && (
        <>
          <p className="text-fg">{t('app.update.ready', { version })}</p>
          <Button size="sm" variant="primary" loading={busy} className="w-full" onClick={() => void run(() => api.app.installUpdate())}>
            {t('app.update.install')}
          </Button>
        </>
      )}
    </div>
  )
}
