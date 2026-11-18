// FILE: src/renderer/pages/server/components/StatusBadge.tsx
import type { ServerStatus } from '@shared/types';
import { useT } from '@/i18n';

const STATUS_COLOR: Record<ServerStatus, string> = {
  stopped: 'var(--muted)',
  starting: 'var(--warning)',
  running: 'var(--success)',
  stopping: 'var(--warning)',
  crashed: 'var(--danger)'
};

export default function StatusBadge({ status }: { status: ServerStatus }): JSX.Element {
  const t = useT();
  const color = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {t(`srv.dash.status.${status}`)}
    </span>
  );
}
