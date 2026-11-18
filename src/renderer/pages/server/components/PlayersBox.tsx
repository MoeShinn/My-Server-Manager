// FILE: src/renderer/pages/server/components/PlayersBox.tsx
import { useNavigate } from 'react-router-dom';
import { useT } from '@/i18n';
import { Box } from '@/components/ui';

const ROW_HEIGHT = 32;

export default function PlayersBox({ serverId, online }: { serverId: string; online: string[] }): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const goPlayers = (): void => navigate(`/server/${serverId}/players`);

  return (
    <Box title={t('srv.dash.playersOnline')}>
      {online.length === 0 ? (
        <div style={{ height: ROW_HEIGHT * 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {t('srv.dash.noPlayers')}
        </div>
      ) : (
        <div style={{ height: ROW_HEIGHT * 5, overflowY: 'auto' }}>
          {online.map((name) => (
            <button
              key={name}
              type="button"
              onClick={goPlayers}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                height: ROW_HEIGHT,
                padding: '0 8px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                color: 'var(--text)',
                textAlign: 'left',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            </button>
          ))}
        </div>
      )}
    </Box>
  );
}
