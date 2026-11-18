import { FileUp, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { stripMcColors } from '@shared/mcText'
import { api } from '@/api'
import { Badge, Box, Button, McText, StatusBadge, TextInput, normalizeText, useToast } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'
import { ServerToggleButton, useServerActions } from '@/layout/serverActions'
import { useServersStore } from '@/layout/stores'
import { ImportJarModal } from './ImportJarModal'

export default function ServerList(): JSX.Element {
  const t = useT()
  const toast = useToast()
  const errText = useErrorText()
  const navigate = useNavigate()
  const servers = useServersStore((s) => s.servers)
  const loaded = useServersStore((s) => s.loaded)
  const { busy, start, stop } = useServerActions()
  const [query, setQuery] = useState('')

  const [importPath, setImportPath] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim())
    return q ? servers.filter((s) => normalizeText(stripMcColors(s.name)).includes(q)) : servers
  }, [servers, query])

  async function pickImportJar(): Promise<void> {
    try {
      const file = await api.app.pickFile([{ name: 'JAR', extensions: ['jar'] }])
      if (file) setImportPath(file)
    } catch (err) {
      toast.error(errText(err))
    }
  }

  function versionLabel(s: (typeof servers)[number]): string {
    if (s.software === 'custom') return (s.customJarName ?? '').replace(/\.jar$/i, '')
    return s.mcVersion ?? ''
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-fg">{t('servers.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <TextInput value={query} onChange={setQuery} placeholder={t('servers.searchPlaceholder')} className="pl-9" />
          </div>
          <Button icon={<FileUp size={15} />} onClick={() => void pickImportJar()}>
            {t('servers.import')}
          </Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/servers/new')}>
            {t('servers.create')}
          </Button>
        </div>
      </div>

      {loaded && servers.length === 0 ? (
        <Box className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-base font-medium text-fg">{t('servers.emptyTitle')}</p>
          <p className="max-w-md text-sm text-muted">{t('servers.emptyHint')}</p>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/servers/new')}>
            {t('servers.create')}
          </Button>
        </Box>
      ) : loaded && filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('servers.noMatch')}</p>
      ) : (
        <div className="mcm-grid">
          {filtered.map((server) => (
            <Box
              key={server.id}
              role="link"
              tabIndex={0}
              className="flex cursor-pointer flex-col gap-3 transition-colors hover:border-accent"
              onClick={() => navigate(`/server/${server.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/server/${server.id}`)
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate text-base font-semibold text-fg">
                  <McText text={server.name} />
                </h3>
                <StatusBadge status={server.status} />
              </div>
              {server.description.trim() !== '' && <McText text={server.description} className="line-clamp-2 break-words text-sm text-muted" />}
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
                <Badge>{t(`create.software.${server.software}`)}</Badge>
                <span className="min-w-0 truncate">{versionLabel(server)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>{t('servers.players', { online: server.playersOnline, max: server.playersMax })}</span>
                <span>{t('servers.port', { port: server.port })}</span>
              </div>
              <div className="mt-auto">
                <ServerToggleButton server={server} busy={busy.has(server.id)} onStart={() => void start(server.id)} onStop={() => void stop(server.id)} />
              </div>
            </Box>
          ))}
        </div>
      )}

      <ImportJarModal
        jarPath={importPath}
        onClose={() => setImportPath(null)}
        onImported={(cfg) => {
          setImportPath(null)
          navigate(`/server/${cfg.id}`)
        }}
      />
    </div>
  )
}
