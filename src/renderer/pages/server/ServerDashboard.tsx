// FILE: src/renderer/pages/server/ServerDashboard.tsx
import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useT } from '@/i18n';
import { Button, Spinner } from '@/components/ui';
import { apiErrorInfo } from './utils';
import { useOnlinePlayers, useServerConfig, useServerStats, useServerStatus } from './hooks';
import ControlBox from './components/ControlBox';
import StatsBox from './components/StatsBox';
import PlayersBox from './components/PlayersBox';
import IpBoxes from './components/IpBoxes';
import SettingsBox from './components/SettingsBox';
import ManageBox from './components/ManageBox';
import ConsoleBox from './components/ConsoleBox';
import ResourceChartBox from './components/ResourceChartBox';
import CustomizeDashboardModal from './components/CustomizeDashboardModal';
import { CARD_MIN_WIDTH, useDashboardLayout } from './dashboardLayout';

const GAP = 16;

export default function ServerDashboard(): JSX.Element {
  const t = useT();
  const { id = '' } = useParams<{ id: string }>();
  const { config, error, reload } = useServerConfig(id);
  const status = useServerStatus(id);
  const stats = useServerStats(id);
  const { online, max } = useOnlinePlayers(id);
  const [layout, setLayout] = useDashboardLayout();
  const [customizing, setCustomizing] = useState(false);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(1200);

  useEffect(() => {
    if (!gridEl) return;
    setGridWidth(gridEl.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setGridWidth(Math.floor(w));
    });
    ro.observe(gridEl);
    return () => ro.disconnect();
  }, [gridEl]);

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

  const minWidth = CARD_MIN_WIDTH[layout.cardSize];
  const shown = layout.blocks.filter((b) => b.visible);
  const left = shown.filter((b) => b.zone === 'left');
  const right = shown.filter((b) => b.zone === 'right');
  // Two columns (wide left, side column on the right) when there is room and both sides have something; otherwise one stack.
  const twoColumns = left.length > 0 && right.length > 0 && gridWidth >= minWidth * 2 + GAP;
  const stack = (items: typeof shown): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, minWidth: 0 }}>
      {items.map((b) => (
        <div key={b.id} style={{ minWidth: 0 }}>
          {renderBlock(b.id)}
        </div>
      ))}
    </div>
  );

  const renderBlock = (blockId: string): JSX.Element | null => {
    switch (blockId) {
      case 'control':
        return <ControlBox config={config} status={status} uptimeSec={stats?.uptimeSec ?? 0} />;
      case 'stats':
        return <StatsBox config={config} status={status} stats={stats} onlineCount={online.length} maxPlayers={max} />;
      case 'chart':
        return <ResourceChartBox config={config} minutes={layout.chartMinutes} />;
      case 'players':
        return <PlayersBox serverId={id} online={online} />;
      case 'ip':
        return <IpBoxes config={config} onChanged={() => void reload()} />;
      case 'settings':
        return <SettingsBox config={config} status={status} onSaved={() => void reload()} />;
      case 'manage':
        return <ManageBox config={config} status={status} onChanged={() => void reload()} />;
      case 'console':
        return <ConsoleBox serverId={id} status={status} />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={setGridEl}
      style={{
        display: 'grid',
        gridTemplateColumns: twoColumns ? `minmax(0, 2fr) minmax(${minWidth}px, 1fr)` : 'minmax(0, 1fr)',
        gap: GAP,
        alignItems: 'start'
      }}
    >
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={14} />} onClick={() => setCustomizing(true)}>
          {t('srv.dash.layout.button')}
        </Button>
      </div>
      {left.length > 0 && stack(left)}
      {right.length > 0 && stack(right)}
      <CustomizeDashboardModal open={customizing} layout={layout} onChange={setLayout} onClose={() => setCustomizing(false)} />
    </div>
  );
}
