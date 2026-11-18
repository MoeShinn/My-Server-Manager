// FILE: src/renderer/pages/server/ServerDashboard.tsx
import { useParams } from 'react-router-dom';
import { useT } from '@/i18n';
import { Spinner } from '@/components/ui';
import { apiErrorInfo } from './utils';
import { useOnlinePlayers, useServerConfig, useServerStats, useServerStatus } from './hooks';
import ControlBox from './components/ControlBox';
import StatsBox from './components/StatsBox';
import PlayersBox from './components/PlayersBox';
import IpBoxes from './components/IpBoxes';
import SettingsBox from './components/SettingsBox';
import ManageBox from './components/ManageBox';
import ConsoleBox from './components/ConsoleBox';

export default function ServerDashboard(): JSX.Element {
  const t = useT();
  const { id = '' } = useParams<{ id: string }>();
  const { config, error, reload } = useServerConfig(id);
  const status = useServerStatus(id);
  const stats = useServerStats(id);
  const { online, max } = useOnlinePlayers(id);

  if (!config) {
    if (error) {
      return (
        <div style={{ padding: 24, color: 'var(--danger)' }}>{t('errors.' + apiErrorInfo(error).code, apiErrorInfo(error).params)}</div>
      );
    }
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(max(320px, calc((100% - 48px) / 4)), 1fr))',
        gap: 16,
        alignItems: 'start'
      }}
    >
      <ControlBox config={config} status={status} uptimeSec={stats?.uptimeSec ?? 0} />
      <StatsBox config={config} status={status} stats={stats} onlineCount={online.length} maxPlayers={max} />
      <PlayersBox serverId={id} online={online} />
      <IpBoxes config={config} onChanged={() => void reload()} />
      <SettingsBox config={config} status={status} onSaved={() => void reload()} />
      <ManageBox config={config} status={status} onChanged={() => void reload()} />
      <div style={{ gridColumn: '1 / -1' }}>
        <ConsoleBox serverId={id} status={status} />
      </div>
    </div>
  );
}
