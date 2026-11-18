// FILE: src/renderer/pages/server/Players.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PlayerEntry } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Spinner, TextInput } from '@/components/ui';
import { useCopy, useErrorToast } from './hooks';
import { normalizeSearch } from './utils';

export default function Players(): JSX.Element {
  const t = useT();
  const { id = '' } = useParams<{ id: string }>();
  const toastError = useErrorToast();
  const copy = useCopy();
  const [players, setPlayers] = useState<PlayerEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const errorRef = useRef(toastError);
  errorRef.current = toastError;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setPlayers(null);

    const load = (): void => {
      window.api.servers
        .getPlayers(id)
        .then((list) => {
          if (alive) setPlayers(list);
        })
        .catch((e) => {
          if (alive) {
            setPlayers((prev) => prev ?? []);
            errorRef.current(e);
          }
        });
    };
    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 300);
    };

    load();
    const offPlayers = window.api.on('server:players', (p) => {
      if (p.id === id) schedule();
    });
    const offStatus = window.api.on('server:status', (p) => {
      if (p.id === id) schedule();
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      offPlayers();
      offStatus();
    };
  }, [id]);

  const filtered = useMemo(() => {
    if (!players) return [];
    const q = normalizeSearch(query.trim());
    if (!q) return players;
    return players.filter((p) => normalizeSearch(p.name).includes(q) || normalizeSearch(p.uuid ?? '').includes(q));
  }, [players, query]);

  if (players === null) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const onlineCount = players.filter((p) => p.online).length;

  return (
    <Box title={t('srv.players.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t('srv.players.summary', { online: onlineCount, known: players.length })}
        </div>
        <TextInput value={query} onChange={setQuery} placeholder={t('srv.players.search')} />

        {players.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>{t('srv.players.empty')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>{t('srv.players.noResults')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((p) => (
              <div
                key={`${p.uuid ?? ''}|${p.name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 4px',
                  borderBottom: '1px solid var(--border)'
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: p.online ? 'var(--success)' : 'var(--muted)'
                  }}
                />
                <span style={{ fontWeight: 600, minWidth: 120 }}>{p.name}</span>
                {p.uuid ? (
                  <button
                    type="button"
                    onClick={() => void copy(p.uuid ?? '')}
                    title={t('srv.players.clickToCopy')}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      color: 'var(--muted)',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {p.uuid}
                  </button>
                ) : (
                  <span style={{ flex: 1, color: 'var(--muted)', fontSize: 11 }}>{t('srv.players.noUuid')}</span>
                )}
                <span style={{ fontSize: 12, color: p.online ? 'var(--success)' : 'var(--muted)' }}>
                  {p.online ? t('srv.players.online') : t('srv.players.offline')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Box>
  );
}
