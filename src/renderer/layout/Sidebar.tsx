import { ArrowLeft, Blocks, FileText, Folder, Globe, LayoutDashboard, Puzzle, Rocket, Server, Settings, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom'
import type { ServerConfig } from '@shared/types'
import { api } from '@/api'
import { McText, cn } from '@/components/ui'
import { useT } from '@/i18n'
import { UpdateBanner } from './UpdateBanner'
import { useServersStore, useSettingsStore } from './stores'

const DOT: Record<string, string> = {
  running: 'bg-success',
  starting: 'bg-warning',
  stopping: 'bg-warning',
  crashed: 'bg-danger',
  stopped: 'bg-muted'
}

function NavItem({ to, end, icon: Icon, label }: { to: string; end?: boolean; icon: LucideIcon; label: string }): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-panel-2 font-medium text-accent' : 'text-muted hover:bg-panel-2 hover:text-fg'
        )
      }
    >
      <Icon size={17} />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function useServerConfig(id: string | undefined): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(null)
  useEffect(() => {
    if (!id) {
      setConfig(null)
      return
    }
    let cancelled = false
    const load = (): void => {
      api.servers
        .get(id)
        .then((c) => !cancelled && setConfig(c))
        .catch(() => !cancelled && setConfig(null))
    }
    load()
    const off = api.on('servers:changed', load)
    return () => {
      cancelled = true
      off()
    }
  }, [id])
  return config
}

export function Sidebar(): JSX.Element {
  const t = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const config = useSettingsStore((s) => s.config)
  const serverId = matchPath({ path: '/server/:id', end: false }, pathname)?.params.id
  const server = useServerConfig(serverId)
  const status = useServersStore((s) => s.servers.find((sv) => sv.id === serverId)?.status ?? 'stopped')

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Server size={20} className="shrink-0 text-accent" />
        <span className="truncate text-sm font-semibold">{config?.appName ?? ''}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-auto px-3 pb-3">
        {serverId ? (
          <>
            <button
              type="button"
              onClick={() => navigate('/servers')}
              className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-fg"
            >
              <ArrowLeft size={17} />
              {t('nav.back')}
            </button>
            <div className="mb-2 flex items-center gap-2 border-y border-line px-3 py-3">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[status])} />
              <span className="min-w-0 truncate text-sm font-semibold">{server ? <McText text={server.name} /> : ''}</span>
            </div>
            <NavItem to={`/server/${serverId}`} end icon={LayoutDashboard} label={t('nav.dashboard')} />
            {server && server.modKind !== 'none' && (
              <NavItem
                to={`/server/${serverId}/plugins`}
                icon={server.modKind === 'mod' ? Blocks : Puzzle}
                label={t(server.modKind === 'mod' ? 'nav.mods' : 'nav.plugins')}
              />
            )}
            <NavItem to={`/server/${serverId}/players`} icon={Users} label={t('nav.players')} />
            <NavItem to={`/server/${serverId}/files`} icon={Folder} label={t('nav.files')} />
            <NavItem to={`/server/${serverId}/start`} icon={Rocket} label={t('nav.startOptions')} />
            <NavItem to={`/server/${serverId}/ip`} icon={Globe} label={t('nav.ip')} />
            <NavItem to={`/server/${serverId}/properties`} icon={FileText} label={t('nav.properties')} />
          </>
        ) : (
          <>
            <NavItem to="/" end icon={LayoutDashboard} label={t('nav.dashboard')} />
            <NavItem to="/servers" icon={Server} label={t('nav.servers')} />
            <NavItem to="/settings" icon={Settings} label={t('nav.settings')} />
          </>
        )}
      </nav>

      {!serverId && (
        <div className="space-y-3 border-t border-line p-3">
          <UpdateBanner />
          <p className="px-1 text-xs text-muted">{t('app.update.version', { version: config?.appVersion ?? '' })}</p>
        </div>
      )}
    </aside>
  )
}
