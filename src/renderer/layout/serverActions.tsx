import { Play, Square } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { ServerSummary } from '@shared/types'
import { api } from '@/api'
import { Button, useToast } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'

/** Shared start/stop handlers (with per-server "busy" state) for Dashboard and ServerList. */
export function useServerActions(): { busy: ReadonlySet<string>; start(id: string): Promise<void>; stop(id: string): Promise<void> } {
  const toast = useToast()
  const errText = useErrorText()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())

  const run = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      setBusy((s) => new Set(s).add(id))
      try {
        await fn()
      } catch (err) {
        toast.error(errText(err))
      } finally {
        setBusy((s) => {
          const n = new Set(s)
          n.delete(id)
          return n
        })
      }
    },
    [toast, errText]
  )

  return {
    busy,
    start: (id) => run(id, () => api.servers.start(id)),
    stop: (id) => run(id, () => api.servers.stop(id))
  }
}

export function ServerToggleButton({ server, busy, onStart, onStop }: { server: ServerSummary; busy: boolean; onStart(): void; onStop(): void }): JSX.Element {
  const t = useT()
  const transitioning = server.status === 'starting' || server.status === 'stopping'
  const showStop = server.status === 'running' || server.status === 'stopping'
  return showStop ? (
    <Button
      size="sm"
      variant="danger"
      loading={busy || transitioning}
      icon={<Square size={13} />}
      onClick={(e) => {
        e.stopPropagation()
        onStop()
      }}
    >
      {t('servers.stop')}
    </Button>
  ) : (
    <Button
      size="sm"
      variant="primary"
      loading={busy || transitioning}
      icon={<Play size={13} />}
      onClick={(e) => {
        e.stopPropagation()
        onStart()
      }}
    >
      {t('servers.start')}
    </Button>
  )
}
