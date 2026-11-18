import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import { Box, Button, ConfirmDialog, ProgressBar, Select, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { DownloadProgress, JavaInstall } from '@shared/types';
import SettingRow from './SettingRow';
import { readApiError } from './errorUtils';
import { formatMb } from './format';

const JAVA_MAJORS = [8, 11, 16, 17, 21, 25];

export default function JavaSection() {
  const t = useT();
  const toast = useToast();
  const [installs, setInstalls] = useState<JavaInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMajor, setSelectedMajor] = useState('21');
  const [installing, setInstalling] = useState<number | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);

  const showError = useCallback(
    (error: unknown) => {
      const info = readApiError(error);
      toast.error(t('errors.' + info.code, info.params));
    },
    [t, toast],
  );

  const reload = useCallback(async () => {
    try {
      setInstalls(await window.api.content.listJava());
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return window.api.on('download:progress', (payload) => {
      if (/^java-\d+$/.test(payload.taskId)) setProgress(payload);
    });
  }, []);

  const total = useMemo(() => installs.reduce((sum, item) => sum + item.sizeMb, 0), [installs]);
  const installedMajors = useMemo(() => new Set(installs.map((i) => i.major)), [installs]);
  const selected = Number(selectedMajor);
  const percent =
    progress && progress.totalBytes && progress.totalBytes > 0 ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100) : null;

  async function install() {
    setInstalling(selected);
    setProgress(null);
    try {
      await window.api.content.installJava(selected);
      toast.success(t('settings.java.installed', { major: selected }));
      await reload();
    } catch (error) {
      const info = readApiError(error);
      if (info.code === 'NOT_FOUND') toast.error(t('settings.java.notFound', { major: selected }));
      else if (info.code === 'CANCELLED') toast.info(t('settings.java.cancelled'));
      else showError(error);
    } finally {
      setInstalling(null);
      setProgress(null);
    }
  }

  async function confirmRemove() {
    const major = removeTarget;
    setRemoveTarget(null);
    if (major === null) return;
    try {
      await window.api.content.removeJava(major);
      toast.success(t('settings.java.removed', { major }));
      await reload();
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Box title={t('settings.java.title')}>
      <p className="mb-2 text-xs text-[var(--muted)]">{t('settings.java.description')}</p>

      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Spinner />
        </div>
      ) : installs.length === 0 ? (
        <p className="py-2 text-sm text-[var(--muted)]">{t('settings.java.none')}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {installs.map((item) => (
            <li key={item.major} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1 basis-56">
                <div className="text-sm text-[var(--text)]">{t('settings.java.version', { major: item.major })}</div>
                <div className="truncate text-xs text-[var(--muted)]" title={item.path}>
                  {item.path}
                </div>
              </div>
              <span className="text-xs text-[var(--muted)]">{formatMb(item.sizeMb)}</span>
              <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setRemoveTarget(item.major)}>
                {t('settings.java.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 text-xs text-[var(--muted)]">{t('settings.java.total', { size: formatMb(total) })}</div>

      <SettingRow label={t('settings.java.installLabel')} description={t('settings.java.installDescription')}>
        <div className="min-w-[140px]">
          <Select
            value={selectedMajor}
            options={JAVA_MAJORS.map((major) => ({ value: String(major), label: t('settings.java.version', { major }) }))}
            onChange={setSelectedMajor}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Download size={14} />}
          loading={installing !== null}
          disabled={installing !== null || installedMajors.has(selected)}
          onClick={() => void install()}
        >
          {installedMajors.has(selected) ? t('settings.java.alreadyInstalled') : t('settings.java.install')}
        </Button>
      </SettingRow>

      {installing !== null && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ProgressBar value={percent} label={t('settings.java.downloading', { major: installing })} />
          </div>
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => void window.api.content.cancelDownload(`java-${installing}`).catch(showError)}>
            {t('settings.java.cancel')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={t('settings.java.removeTitle')}
        message={t('settings.java.removeMessage', { major: removeTarget ?? 0 })}
        confirmLabel={t('settings.java.remove')}
        danger
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </Box>
  );
}
