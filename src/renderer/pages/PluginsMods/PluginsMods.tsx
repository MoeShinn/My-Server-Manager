// FILE: src/renderer/pages/PluginsMods/PluginsMods.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
  ConfirmDialog,
  Modal,
  Select,
  Spinner,
  TextInput,
  useToast
} from '@/components/ui';
import { useT } from '@/i18n';
import type { ContentItem, ServerConfig, ServerSoftware } from '@shared/types';
import ContentRow from './ContentRow';

const PAGE_SIZE = 20;

type FilterKey = 'author' | 'title' | 'description';
type Filters = Partial<Record<FilterKey, string>>;
type Tab = 'browse' | 'installed';

const SOFTWARE_NAMES: Record<Exclude<ServerSoftware, 'custom'>, string> = {
  vanilla: 'Vanilla',
  paper: 'Paper',
  purpur: 'Purpur',
  folia: 'Folia',
  leaf: 'Leaf',
  fabric: 'Fabric',
  velocity: 'Velocity'
};

function errorCodeOf(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'UNKNOWN';
}

/** Lower-case and strip accents, for matching without caring about diacritics. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
}

function matchesLocal(item: ContentItem, query: string, filters: Filters): boolean {
  const q = fold(query.trim());
  if (q && !fold(`${item.title} ${item.author} ${item.description}`).includes(q)) return false;
  const has = (value: string, needle: string | undefined): boolean =>
    !needle || needle.trim() === '' || fold(value).includes(fold(needle.trim()));
  return has(item.author, filters.author) && has(item.title, filters.title) && has(item.description, filters.description);
}

function mergeUnique(prev: ContentItem[], next: ContentItem[]): ContentItem[] {
  const seen = new Set(prev.map((i) => i.id));
  return [...prev, ...next.filter((i) => !seen.has(i.id))];
}

export default function PluginsMods() {
  const { id = '' } = useParams<{ id: string }>();
  const t = useT();
  const toast = useToast();
  // Keep the latest t/toast in refs so effects do not re-run when their identity changes.
  const tRef = useRef(t);
  tRef.current = t;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [server, setServer] = useState<ServerConfig | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('browse');
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [busy, setBusy] = useState<Record<string, 'install' | 'remove'>>({});
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [confirmItem, setConfirmItem] = useState<ContentItem | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftType, setDraftType] = useState<FilterKey | ''>('');
  const [draftText, setDraftText] = useState('');

  const seq = useRef(0);
  const filtersActive = Object.values(filters).some((v) => (v ?? '').trim() !== '');

  // ---- load the server ----
  useEffect(() => {
    let cancelled = false;
    setServer(null);
    setServerError(null);
    setItems([]);
    window.api.servers
      .get(id)
      .then((s) => {
        if (!cancelled) setServer(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setServerError(errorCodeOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ---- download progress for this server's items ----
  useEffect(() => {
    const prefix = `content-${id}-`;
    return window.api.on('download:progress', (p) => {
      if (!p.taskId.startsWith(prefix)) return;
      const itemId = p.taskId.slice(prefix.length);
      const percent = p.totalBytes && p.totalBytes > 0 ? Math.min(100, Math.round((p.receivedBytes / p.totalBytes) * 100)) : null;
      setProgress((prev) => ({ ...prev, [itemId]: percent }));
    });
  }, [id]);

  // ---- search / list ----
  const load = useCallback(
    async (pageToLoad: number) => {
      if (!server || server.modKind === 'none') return;
      const mySeq = ++seq.current;
      if (pageToLoad === 0) setLoading(true);
      else setLoadingMore(true);
      setErrorCode(null);
      try {
        if (tab === 'installed') {
          const all = await window.api.content.listInstalledContent(id);
          if (mySeq !== seq.current) return;
          const shown = all.filter((i) => matchesLocal(i, activeQuery, filters));
          setItems(shown);
          setTotal(shown.length);
          setPage(0);
        } else {
          const res = await window.api.content.searchContent({
            serverId: id,
            query: activeQuery,
            filters,
            page: pageToLoad,
            pageSize: PAGE_SIZE
          });
          if (mySeq !== seq.current) return;
          setItems((prev) => (pageToLoad === 0 ? res.items : mergeUnique(prev, res.items)));
          setTotal(res.total);
          setPage(pageToLoad);
        }
      } catch (e) {
        if (mySeq === seq.current) {
          setErrorCode(errorCodeOf(e));
          if (pageToLoad === 0) setItems([]);
        }
      } finally {
        if (mySeq === seq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [server, id, tab, activeQuery, filters]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  /** After an install/remove: refresh the installed flags of what is on screen. */
  const refreshInstalled = useCallback(async () => {
    if (tab === 'installed') {
      await load(0);
      return;
    }
    try {
      const installed = await window.api.content.listInstalledContent(id);
      const files = new Map(installed.map((i) => [i.id, i.installedFile]));
      setItems((prev) =>
        prev.map((it) => {
          const file = files.get(it.id) ?? null;
          return { ...it, installed: file !== null, installedFile: file };
        })
      );
    } catch {
      // flags stay as they were; the next search will fix them
    }
  }, [tab, load, id]);

  const finishBusy = (itemId: string): void => {
    setBusy((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setProgress((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleInstall = async (item: ContentItem): Promise<void> => {
    setBusy((prev) => ({ ...prev, [item.id]: 'install' }));
    try {
      await window.api.content.installContent(id, item.id);
      toastRef.current.success(tRef.current('plugins.installedToast', { name: item.title }));
      await refreshInstalled();
    } catch (e) {
      toastRef.current.error(tRef.current('errors.' + errorCodeOf(e)));
    } finally {
      finishBusy(item.id);
    }
  };

  const handleRemove = async (item: ContentItem): Promise<void> => {
    const fileName = item.installedFile;
    if (!fileName) return;
    setBusy((prev) => ({ ...prev, [item.id]: 'remove' }));
    try {
      await window.api.content.removeContent(id, fileName);
      toastRef.current.success(tRef.current('plugins.removedToast', { name: item.title }));
      await refreshInstalled();
    } catch (e) {
      toastRef.current.error(tRef.current('errors.' + errorCodeOf(e)));
    } finally {
      finishBusy(item.id);
    }
  };

  const runSearch = (): void => {
    const next = queryInput.trim();
    if (next === activeQuery) void load(0);
    else setActiveQuery(next);
  };

  const applyFilter = (): void => {
    if (draftType === '') return;
    const text = draftText.trim();
    setFilters((prev) => {
      const next = { ...prev };
      if (text) next[draftType] = text;
      else delete next[draftType];
      return next;
    });
    setFilterOpen(false);
    setDraftType('');
    setDraftText('');
  };

  const removeFilter = (key: FilterKey): void => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const switchTab = (next: Tab): void => {
    if (next === tab) return;
    setItems([]);
    setTotal(0);
    setTab(next);
  };

  // ---- render ----
  if (serverError) {
    return (
      <Box>
        <p className="text-[var(--danger)]">{t('errors.' + serverError)}</p>
      </Box>
    );
  }
  if (!server) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (server.modKind === 'none') {
    return (
      <Box>
        <p className="text-[var(--muted)]">{t('plugins.notSupported')}</p>
      </Box>
    );
  }

  const isMod = server.modKind === 'mod';
  const softwareName = server.software === 'custom' ? t('plugins.software.custom') : SOFTWARE_NAMES[server.software];
  const subtitle = t('plugins.subtitle', {
    kind: t(isMod ? 'plugins.kind.mods' : 'plugins.kind.plugins'),
    software: softwareName,
    version: server.mcVersion ?? t('plugins.anyVersion')
  });
  const hasMore = tab === 'browse' && !filtersActive && items.length < total;

  const filterOptions: { value: string; label: string }[] = [
    { value: 'author', label: t('plugins.filter.author') },
    { value: 'title', label: t('plugins.filter.name') },
    { value: 'description', label: t('plugins.filter.description') }
  ];
  const filterLabel = (key: FilterKey): string =>
    t(key === 'title' ? 'plugins.filter.name' : key === 'author' ? 'plugins.filter.author' : 'plugins.filter.description');

  const tabClass = (active: boolean): string =>
    `border-b-2 px-3 py-2 text-sm font-medium ${
      active ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--muted)]'
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">
          {t(isMod ? 'plugins.title.mods' : 'plugins.title.plugins')}
        </h1>
        <p className="text-sm text-[var(--muted)]">{subtitle}</p>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        <button type="button" className={tabClass(tab === 'browse')} onClick={() => switchTab('browse')}>
          {t('plugins.tab.browse')}
        </button>
        <button type="button" className={tabClass(tab === 'installed')} onClick={() => switchTab('installed')}>
          {t('plugins.tab.installed')}
        </button>
      </div>

      <Box>
        <div className="flex items-center gap-2">
          <div
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
          >
            <TextInput value={queryInput} onChange={setQueryInput} placeholder={t('plugins.search.placeholder')} />
          </div>
          <Button
            variant="secondary"
            icon={<Search size={16} />}
            aria-label={t('plugins.search.placeholder')}
            onClick={runSearch}
          />
          <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFilterOpen(true)}>
            {t('plugins.filter.button')}
          </Button>
        </div>
        {filtersActive && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(filters) as FilterKey[])
              .filter((k) => (filters[k] ?? '').trim() !== '')
              .map((k) => (
                <Badge key={k}>
                  <span className="inline-flex items-center gap-1">
                    {filterLabel(k)}: {filters[k]}
                    <button
                      type="button"
                      className="inline-flex"
                      title={t('plugins.filter.clear')}
                      aria-label={t('plugins.filter.clear')}
                      onClick={() => removeFilter(k)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                </Badge>
              ))}
          </div>
        )}
      </Box>

      {loading && items.length === 0 ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : errorCode !== null && items.length === 0 ? (
        <Box>
          <div className="flex flex-col items-start gap-3">
            <p className="text-[var(--danger)]">{t('errors.' + errorCode)}</p>
            <Button variant="secondary" onClick={() => void load(0)}>
              {t('plugins.retry')}
            </Button>
          </div>
        </Box>
      ) : items.length === 0 ? (
        <Box>
          <p className="text-[var(--muted)]">{t('plugins.empty')}</p>
        </Box>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ContentRow
              key={item.id}
              item={item}
              busy={busy[item.id] ?? null}
              progress={progress[item.id] ?? null}
              onInstall={(it) => void handleInstall(it)}
              onRemove={(it) => setConfirmItem(it)}
            />
          ))}
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={loadingMore} onClick={() => void load(page + 1)}>
                {t('plugins.loadMore')}
              </Button>
            </div>
          )}
          {errorCode !== null && (
            <p className="text-center text-sm text-[var(--danger)]">{t('errors.' + errorCode)}</p>
          )}
        </div>
      )}

      <Modal
        open={filterOpen}
        title={t('plugins.filter.title')}
        onClose={() => setFilterOpen(false)}
        footer={
          <Button variant="primary" disabled={draftType === '' || draftText.trim() === ''} onClick={applyFilter}>
            {t('plugins.filter.apply')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            value={draftType}
            options={filterOptions}
            onChange={(v) => {
              if (v === 'author' || v === 'title' || v === 'description') {
                setDraftType(v);
                setDraftText(filters[v] ?? '');
              }
            }}
          />
          {draftType !== '' && (
            <div
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftText.trim() !== '') applyFilter();
              }}
            >
              <TextInput value={draftText} onChange={setDraftText} placeholder={t('plugins.filter.valuePlaceholder')} />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmItem !== null}
        title={t('plugins.remove')}
        message={t('plugins.confirmRemove', { name: confirmItem?.title ?? '' })}
        confirmLabel={t('plugins.remove')}
        danger
        onConfirm={() => {
          const item = confirmItem;
          setConfirmItem(null);
          if (item) void handleRemove(item);
        }}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  );
}
