// FILE: src/renderer/pages/server/hooks.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerEntry, ServerConfig, ServerStats, ServerStatus, SystemInfo } from '@shared/types';
import { useT } from '@/i18n';
import { useToast } from '@/components/ui';
import { apiErrorInfo, copyText } from './utils';

/** Loads servers.get(id); reloads on servers:changed. */
export function useServerConfig(id: string): {
  config: ServerConfig | null;
  error: unknown;
  reload: () => Promise<void>;
} {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reqRef = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    const req = ++reqRef.current;
    try {
      const c = await window.api.servers.get(id);
      if (req !== reqRef.current) return;
      setConfig(c);
      setError(null);
    } catch (e) {
      if (req !== reqRef.current) return;
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    setConfig(null);
    setError(null);
    void reload();
    const off = window.api.on('servers:changed', () => {
      void reload();
    });
    return () => {
      reqRef.current++;
      off();
    };
  }, [id, reload]);

  return { config, error, reload };
}

/** Status of one server: initial value from servers.list(), then server:status events. */
export function useServerStatus(id: string): ServerStatus | null {
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus(null);
    const fetchStatus = (): void => {
      window.api.servers
        .list()
        .then((list) => {
          if (!alive) return;
          const s = list.find((x) => x.id === id);
          if (s) setStatus(s.status);
        })
        .catch(() => undefined);
    };
    fetchStatus();
    const offStatus = window.api.on('server:status', (p) => {
      if (p.id !== id) return;
      setStatus(p.status);
    });
    const offChanged = window.api.on('servers:changed', fetchStatus);
    return () => {
      alive = false;
      offStatus();
      offChanged();
    };
  }, [id]);

  return status;
}

/** Stats: servers.getStats(id), then server:stats events. Refetched when the status changes. */
export function useServerStats(id: string): ServerStats | null {
  const [stats, setStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    let alive = true;
    setStats(null);
    const fetchStats = (): void => {
      window.api.servers
        .getStats(id)
        .then((s) => {
          if (alive) setStats(s);
        })
        .catch(() => undefined);
    };
    fetchStats();
    const offStats = window.api.on('server:stats', (p) => {
      if (p.id !== id) return;
      setStats(p.stats);
    });
    const offStatus = window.api.on('server:status', (p) => {
      if (p.id !== id) return;
      fetchStats();
    });
    return () => {
      alive = false;
      offStats();
      offStatus();
    };
  }, [id]);

  return stats;
}

/** Online player names and max players. */
export function useOnlinePlayers(id: string): { online: string[]; max: number | null } {
  const [online, setOnline] = useState<string[]>([]);
  const [max, setMax] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setOnline([]);
    setMax(null);
    window.api.servers
      .getPlayers(id)
      .then((list: PlayerEntry[]) => {
        if (alive) setOnline((prev) => (prev.length > 0 ? prev : list.filter((p) => p.online).map((p) => p.name)));
      })
      .catch(() => undefined);
    window.api.servers
      .list()
      .then((list) => {
        const s = list.find((x) => x.id === id);
        if (alive && s) setMax((prev) => prev ?? s.playersMax);
      })
      .catch(() => undefined);
    const off = window.api.on('server:players', (p) => {
      if (p.id !== id) return;
      setOnline(p.online);
      setMax(p.max);
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  return { online, max };
}

/** Total RAM etc. of the machine (read once). */
export function useSystemInfo(): SystemInfo | null {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    let alive = true;
    window.api.app
      .getSystemInfo()
      .then((i) => {
        if (alive) setInfo(i);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** Returns a function that shows t('errors.<code>') for any error thrown by window.api. */
export function useErrorToast(): (e: unknown) => void {
  const t = useT();
  const toast = useToast();
  return (e: unknown): void => {
    const { code, params } = apiErrorInfo(e);
    toast.error(t('errors.' + code, params));
  };
}

/** Returns a function that copies text and shows the "copied" toast. */
export function useCopy(): (text: string) => Promise<void> {
  const t = useT();
  const toast = useToast();
  return async (text: string): Promise<void> => {
    const ok = await copyText(text);
    if (ok) toast.success(t('srv.dash.copied'));
    else toast.error(t('srv.dash.copyFailed'));
  };
}
