import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Badge, ConfirmDialog, Modal, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { LanguageInfo } from '@shared/types';
import { readApiError } from './errorUtils';

interface LanguageModalProps {
  open: boolean;
  onClose(): void;
  /** Called after anything was installed, updated or removed, so the language picker can refresh. */
  onChanged(): void;
}

type BulkKind = 'installAll' | 'updateAll' | 'removeAll';

export default function LanguageModal({ open, onClose, onChanged }: LanguageModalProps) {
  const t = useT();
  const toast = useToast();
  const [items, setItems] = useState<LanguageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<BulkKind | null>(null);

  const showError = useCallback(
    (error: unknown) => {
      const info = readApiError(error);
      toast.error(t('errors.' + info.code, info.params));
    },
    [t, toast],
  );

  // refresh = download the language list from GitHub again, ignoring the cache. A failed refresh keeps the current list.
  const loadRemote = useCallback(async (refresh = false) => {
    setLoading(true);
    if (!refresh) setFailed(false);
    try {
      setItems(await window.api.language.listRemote(refresh));
      setFailed(false);
      if (refresh) toast.success(t('language.refreshed'));
    } catch (error) {
      if (!refresh) setFailed(true);
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [showError, t, toast]);

  useEffect(() => {
    if (open) void loadRemote();
  }, [open, loadRemote]);

  async function runForOne(code: string, action: 'install' | 'update' | 'remove') {
    setBusyCode(code);
    try {
      await window.api.language[action](code);
      onChanged();
      await loadRemote();
    } catch (error) {
      showError(error);
    } finally {
      setBusyCode(null);
    }
  }

  async function runBulk(kind: BulkKind) {
    setConfirmBulk(null);
    setBulkBusy(true);
    try {
      await window.api.language[kind]();
      onChanged();
      await loadRemote();
      toast.success(t('language.bulk.done'));
    } catch (error) {
      showError(error);
      onChanged();
      await loadRemote();
    } finally {
      setBulkBusy(false);
    }
  }

  function statusBadge(item: LanguageInfo) {
    if (!item.installed) return <Badge color="muted">{t('language.status.notInstalled')}</Badge>;
    if (item.updateAvailable) return <Badge color="warning">{t('language.status.updateAvailable')}</Badge>;
    return <Badge color="success">{t('language.status.installed')}</Badge>;
  }

  const bulkMessages: Record<BulkKind, { title: string; message: string; confirm: string; danger: boolean }> = {
    installAll: {
      title: t('language.bulk.installAll.title'),
      message: t('language.bulk.installAll.message'),
      confirm: t('language.bulk.installAll.confirm'),
      danger: false,
    },
    updateAll: {
      title: t('language.bulk.updateAll.title'),
      message: t('language.bulk.updateAll.message'),
      confirm: t('language.bulk.updateAll.confirm'),
      danger: false,
    },
    removeAll: {
      title: t('language.bulk.removeAll.title'),
      message: t('language.bulk.removeAll.message'),
      confirm: t('language.bulk.removeAll.confirm'),
      danger: true,
    },
  };
  const activeBulk = confirmBulk ? bulkMessages[confirmBulk] : null;
  const anyBusy = busyCode !== null || bulkBusy;

  return (
    <>
      <Modal
        open={open}
        title={t('language.modal.title')}
        onClose={onClose}
        width={640}
        footer={
          <>
            <Button variant="ghost" onClick={() => void window.api.language.openFolder().catch(showError)}>
              {t('language.openFolder')}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('language.close')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={anyBusy || loading || failed} onClick={() => setConfirmBulk('installAll')}>
              {t('language.bulk.installAll')}
            </Button>
            <Button variant="danger" size="sm" disabled={anyBusy || loading} onClick={() => setConfirmBulk('removeAll')}>
              {t('language.bulk.removeAll')}
            </Button>
            <Button variant="secondary" size="sm" disabled={anyBusy || loading || failed} onClick={() => setConfirmBulk('updateAll')}>
              {t('language.bulk.updateAll')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              loading={loading}
              disabled={anyBusy}
              title={t('language.refreshHint')}
              onClick={() => void loadRemote(true)}
            >
              {t('language.refresh')}
            </Button>
            {bulkBusy && <Spinner />}
          </div>

          {loading && items.length === 0 ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--muted)]">
              <Spinner />
              {t('language.loading')}
            </div>
          ) : failed ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] p-6 text-center">
              <p className="text-sm text-[var(--muted)]">{t('language.loadFailed')}</p>
              <Button variant="primary" size="sm" loading={loading} onClick={() => void loadRemote()}>
                {t('language.retry')}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {items.map((item) => {
                const removeBlockedReason =
                  item.code === 'en' ? t('language.remove.disabledEn') : item.inUse ? t('language.remove.disabledInUse') : null;
                const busy = busyCode === item.code;
                return (
                  <li key={item.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="truncate text-sm text-[var(--text)]">
                        {item.name} <span className="text-xs text-[var(--muted)]">({item.code})</span>
                      </div>
                      {item.installed && removeBlockedReason && <div className="text-xs text-[var(--muted)]">{removeBlockedReason}</div>}
                    </div>
                    {statusBadge(item)}
                    <div className="ml-auto flex items-center gap-2">
                      {item.installed && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeBlockedReason !== null || anyBusy}
                          loading={busy}
                          title={removeBlockedReason ?? undefined}
                          onClick={() => void runForOne(item.code, 'remove')}
                        >
                          {t('language.action.remove')}
                        </Button>
                      )}
                      {item.installed && item.updateAvailable && (
                        <Button variant="primary" size="sm" disabled={anyBusy} loading={busy} onClick={() => void runForOne(item.code, 'update')}>
                          {t('language.action.update')}
                        </Button>
                      )}
                      {!item.installed && (
                        <Button variant="primary" size="sm" disabled={anyBusy} loading={busy} onClick={() => void runForOne(item.code, 'install')}>
                          {t('language.action.install')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={activeBulk !== null}
        title={activeBulk?.title ?? ''}
        message={activeBulk?.message ?? ''}
        confirmLabel={activeBulk?.confirm}
        danger={activeBulk?.danger}
        onConfirm={() => confirmBulk && void runBulk(confirmBulk)}
        onCancel={() => setConfirmBulk(null)}
      />
    </>
  );
}
