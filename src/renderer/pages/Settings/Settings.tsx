import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, RotateCcw } from 'lucide-react';
import { Box, Button, ConfirmDialog, Select, Spinner, Toggle, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { AppConfig, AppPaths, AppSettings, ServerSoftware } from '@shared/types';
import AboutSection from './AboutSection';
import DangerZone from './DangerZone';
import JavaSection from './JavaSection';
import LanguageSection from './LanguageSection';
import SettingRow from './SettingRow';
import { readApiError } from './errorUtils';

const CACHE_DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
const REFRESH_SOFTWARE: ServerSoftware[] = ['vanilla', 'paper', 'purpur', 'folia', 'leaf', 'fabric', 'velocity'];

export default function Settings() {
  const t = useT();
  const toast = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [pendingDataDir, setPendingDataDir] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const showError = useCallback(
    (error: unknown) => {
      const info = readApiError(error);
      toast.error(t('errors.' + info.code, info.params));
    },
    [t, toast],
  );

  const reload = useCallback(async () => {
    try {
      const [nextSettings, nextPaths, nextConfig] = await Promise.all([
        window.api.app.getSettings(),
        window.api.app.getPaths(),
        window.api.app.getConfig(),
      ]);
      setSettings(nextSettings);
      setPaths(nextPaths);
      setConfig(nextConfig);
    } catch (error) {
      showError(error);
    }
  }, [showError]);

  useEffect(() => {
    void reload();
    // P3 dispatches this event after every successful updateSettings or resetSettings.
    const handler = () => void reload();
    window.addEventListener('mcm:settings-changed', handler);
    return () => window.removeEventListener('mcm:settings-changed', handler);
  }, [reload]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      try {
        setSettings(await window.api.app.updateSettings(patch));
      } catch (error) {
        showError(error);
        await reload();
      }
    },
    [reload, showError],
  );

  async function openPath(target: string | undefined) {
    if (!target) return;
    try {
      await window.api.app.openPath(target);
    } catch (error) {
      showError(error);
    }
  }

  async function pickDataDir() {
    try {
      const picked = await window.api.app.pickFolder();
      if (picked) setPendingDataDir(picked);
    } catch (error) {
      showError(error);
    }
  }

  async function applyDataDir() {
    const target = pendingDataDir;
    setPendingDataDir(null);
    if (!target) return;
    await updateSettings({ dataDir: target });
  }

  async function refreshVersions() {
    setRefreshing(true);
    const failed: string[] = [];
    for (const software of REFRESH_SOFTWARE) {
      try {
        await window.api.content.listVersions(software, { forceRefresh: true });
      } catch {
        failed.push(software);
      }
    }
    setRefreshing(false);
    if (failed.length === 0) toast.success(t('settings.versions.refreshDone'));
    else toast.error(t('settings.versions.refreshPartial', { names: failed.join(', ') }));
  }

  async function resetSettings() {
    setConfirmReset(false);
    try {
      setSettings(await window.api.app.resetSettings());
      toast.success(t('settings.tools.resetDone'));
    } catch (error) {
      showError(error);
    }
  }

  if (!settings) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-[var(--text)]">{t('settings.title')}</h1>

      {/* 1. Language */}
      <LanguageSection settings={settings} onSettingsChange={updateSettings} />

      {/* 2. Data folder */}
      <Box title={t('settings.dataDir.title')}>
        <SettingRow label={t('settings.dataDir.current')} description={paths?.dataDir ?? settings.dataDir}>
          <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void openPath(paths?.dataDir ?? settings.dataDir)}>
            {t('settings.dataDir.open')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void pickDataDir()}>
            {t('settings.dataDir.change')}
          </Button>
        </SettingRow>
        <ConfirmDialog
          open={pendingDataDir !== null}
          title={t('settings.dataDir.confirmTitle')}
          message={t('settings.dataDir.confirmMessage', { path: pendingDataDir ?? '' })}
          confirmLabel={t('settings.dataDir.confirm')}
          danger
          onConfirm={() => void applyDataDir()}
          onCancel={() => setPendingDataDir(null)}
        />
      </Box>

      {/* 3. Minecraft versions and cache */}
      <Box title={t('settings.versions.title')}>
        <SettingRow label={t('settings.versions.alwaysFresh')} description={t('settings.versions.alwaysFreshHint')}>
          <Toggle checked={settings.alwaysFetchFreshVersions} onChange={(checked) => void updateSettings({ alwaysFetchFreshVersions: checked })} />
        </SettingRow>
        <SettingRow label={t('settings.versions.cacheDays')} description={t('settings.versions.cacheDaysHint')}>
          <div className="min-w-[100px]">
            <Select
              value={String(settings.versionCacheDays)}
              options={CACHE_DAY_OPTIONS.map((days) => ({ value: String(days), label: String(days) }))}
              onChange={(value) => void updateSettings({ versionCacheDays: Number(value) })}
            />
          </div>
        </SettingRow>
        <SettingRow label={t('settings.versions.showDuplicates')} description={t('settings.versions.showDuplicatesHint')}>
          <Toggle checked={settings.showDuplicateBuilds} onChange={(checked) => void updateSettings({ showDuplicateBuilds: checked })} />
        </SettingRow>
        <SettingRow label={t('settings.versions.refreshLabel')} description={t('settings.versions.refreshHint')}>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={refreshing} onClick={() => void refreshVersions()}>
            {t('settings.versions.refreshNow')}
          </Button>
        </SettingRow>
      </Box>

      {/* 4. Java */}
      <JavaSection />

      {/* 5. Appearance and behavior */}
      <Box title={t('settings.ui.title')}>
        <SettingRow label={t('settings.ui.theme')}>
          <div className="min-w-[160px]">
            <Select
              value={settings.theme}
              options={[
                { value: 'dark', label: t('settings.ui.theme.dark') },
                { value: 'light', label: t('settings.ui.theme.light') },
              ]}
              onChange={(value) => void updateSettings({ theme: value === 'light' ? 'light' : 'dark' })}
            />
          </div>
        </SettingRow>
        <SettingRow label={t('settings.ui.closeAction')} description={t('settings.ui.closeActionHint')}>
          <div className="min-w-[220px]">
            <Select
              value={settings.closeAction}
              options={[
                { value: 'tray', label: t('settings.ui.closeAction.tray') },
                { value: 'ask', label: t('settings.ui.closeAction.ask') },
                { value: 'quit', label: t('settings.ui.closeAction.quit') },
              ]}
              onChange={(value) => void updateSettings({ closeAction: value === 'ask' || value === 'quit' ? value : 'tray' })}
            />
          </div>
        </SettingRow>
        <SettingRow label={t('settings.ui.launchAtLogin')}>
          <Toggle checked={settings.launchAtLogin} onChange={(checked) => void updateSettings({ launchAtLogin: checked })} />
        </SettingRow>
        <SettingRow label={t('settings.ui.autoCheckUpdate')}>
          <Toggle checked={settings.autoCheckUpdate} onChange={(checked) => void updateSettings({ autoCheckUpdate: checked })} />
        </SettingRow>
      </Box>

      {/* 6. About */}
      <AboutSection config={config} />

      {/* 7. Tools */}
      <Box title={t('settings.tools.title')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void openPath(paths?.logsDir)}>
            {t('settings.tools.openLogs')}
          </Button>
          <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void openPath(paths?.dataDir)}>
            {t('settings.tools.openData')}
          </Button>
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)}>
            {t('settings.tools.reset')}
          </Button>
        </div>
        <ConfirmDialog
          open={confirmReset}
          title={t('settings.tools.resetTitle')}
          message={t('settings.tools.resetMessage')}
          confirmLabel={t('settings.tools.reset')}
          danger
          onConfirm={() => void resetSettings()}
          onCancel={() => setConfirmReset(false)}
        />
      </Box>

      {/* 8. Danger zone (always last) */}
      <DangerZone />
    </div>
  );
}
