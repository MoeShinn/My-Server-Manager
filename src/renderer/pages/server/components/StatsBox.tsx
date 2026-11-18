// FILE: src/renderer/pages/server/components/StatsBox.tsx
import type { CSSProperties } from 'react';
import type { ServerConfig, ServerStats, ServerStatus } from '@shared/types';
import { useT } from '@/i18n';
import { Box, ProgressBar } from '@/components/ui';
import { formatMb } from '../utils';

interface Props {
  config: ServerConfig;
  status: ServerStatus | null;
  stats: ServerStats | null;
  onlineCount: number;
  maxPlayers: number | null;
}

const WARN_STYLE = { ['--accent' as string]: 'var(--warning)' } as CSSProperties;

function Row({ label, value, children }: { label: string; value: string; children?: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span>{value}</span>
      </div>
      {children}
    </div>
  );
}

export default function StatsBox({ config, status, stats, onlineCount, maxPlayers }: Props): JSX.Element {
  const t = useT();
  const running = status === 'running' || status === 'starting' || status === 'stopping';
  const ramUsed = running && stats ? stats.ramUsedMb : 0;
  const cpu = running && stats ? stats.cpuPercent : 0;
  const disk = stats ? stats.diskUsedMb : 0;
  const ramMax = config.settings.ramMb;
  const limit = config.settings.storageLimitMb;

  const ramPct = Math.min(100, ramMax > 0 ? (ramUsed / ramMax) * 100 : 0);
  const diskPct = limit !== null && limit > 0 ? Math.min(100, (disk / limit) * 100) : 0;
  const diskWarn = limit !== null && diskPct >= 90;

  return (
    <Box title={t('srv.dash.stats')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Row label={t('srv.dash.ram')} value={`${formatMb(ramUsed)} / ${formatMb(ramMax)}`}>
          <ProgressBar value={ramPct} />
        </Row>
        <Row label={t('srv.dash.cpu')} value={`${cpu.toFixed(1)}%`} />
        <Row
          label={t('srv.dash.storage')}
          value={`${formatMb(disk)} / ${limit === null ? t('srv.dash.unlimited') : formatMb(limit)}`}
        >
          <div style={diskWarn ? WARN_STYLE : undefined}>
            <ProgressBar value={diskPct} />
          </div>
        </Row>
        <Row
          label={t('srv.dash.playersLabel')}
          value={`${onlineCount}/${maxPlayers === null ? '?' : maxPlayers}`}
        />
      </div>
    </Box>
  );
}
