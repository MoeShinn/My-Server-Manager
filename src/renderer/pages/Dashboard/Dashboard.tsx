import { Plus, Play, Square } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { Box, Button, ConfirmDialog, McText, StatusBadge, useToast } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'
import { ServerToggleButton, useServerActions } from '@/layout/serverActions'
import { ACTIVE_STATUSES, useServersStore } from '@/layout/stores'

export default function Dashboard(): JSX.Element {
  const t = useT()
  const toast = useToast()
  const errText = useErrorText()
  const navigate = useNavigate()
  const servers = useServersStore((s) => s.servers)
  const loaded = useServersStore((s) => s.loaded)
  const { busy, start, stop } = useServerActions()
  const [startingAll, setStartingAll] = useState(false)
  const [stoppingAll, setStoppingAll] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)

  const active = servers.filter((s) => ACTIVE_STATUSES.includes(s.status))
  const stoppedCount = servers.length - active.length

  async function startAll(): Promise<void> {
    setStartingAll(true)
    try {
      await api.servers.startAll()
      toast.success(t('dashboard.startAllDone'))
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setStartingAll(false)
    }
  }

  async function stopAll(): Promise<void> {
    setConfirmStop(false)
    setStoppingAll(true)
    try {
      await api.servers.stopAll()
      toast.success(t('dashboard.stopAllDone'))
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setStoppingAll(false)
    }
  }

  return (
    <div className="space-y-4">
      <Box className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-fg">{t('dashboard.title')}</h1>
          <p className="mt-0.5 text-sm text-muted">{t('dashboard.runningOf', { running: active.length, total: servers.length })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" icon={<Play size={15} />} loading={startingAll} disabled={stoppedCount === 0} onClick={() => void startAll()}>
            {t('dashboard.startAll')}
          </Button>
          <Button variant="danger" icon={<Square size={14} />} loading={stoppingAll} disabled={active.length === 0} onClick={() => setConfirmStop(true)}>
            {t('dashboard.stopAll')}
          </Button>
        </div>
      </Box>

      {loaded && active.length === 0 ? (
        <Box className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-base font-medium text-fg">{t('dashboard.emptyTitle')}</p>
          <p className="max-w-md text-sm text-muted">{t('dashboard.emptyHint')}</p>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/servers')}>
            {t('dashboard.goToServers')}
          </Button>
        </Box>
      ) : (
        <div className="mcm-grid">
          {active.map((server) => (
            <Box key={server.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate text-base font-semibold text-fg">
                  <McText text={server.name} />
                </h3>
                <StatusBadge status={server.status} />
              </div>
              <p className="text-sm text-muted">{t('dashboard.players', { online: server.playersOnline, max: server.playersMax })}</p>
              <div className="mt-auto flex items-center justify-between gap-2">
                <ServerToggleButton server={server} busy={busy.has(server.id)} onStart={() => void start(server.id)} onStop={() => void stop(server.id)} />
                <Button size="sm" onClick={() => navigate(`/server/${server.id}`)}>
                  {t('dashboard.open')}
                </Button>
              </div>
            </Box>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmStop}
        danger
        title={t('dashboard.stopAllTitle')}
        message={t('dashboard.stopAllMessage', { count: active.length })}
        confirmLabel={t('dashboard.stopAll')}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => void stopAll()}
      />
    </div>
  )
}
