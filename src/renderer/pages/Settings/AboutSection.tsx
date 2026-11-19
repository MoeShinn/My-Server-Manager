import { useEffect, useState } from 'react';
import { Download, RefreshCw, RotateCw, ScrollText } from 'lucide-react';
import { Box, Button, Modal, ProgressBar, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { AppConfig, UpdateState } from '@shared/types';
import thirdPartyNotices from '../../../../legal/THIRD_PARTY_NOTICES.md?raw';
import SettingRow from './SettingRow';
import { readApiError } from './errorUtils';

interface AboutSectionProps {
  config: AppConfig | null;
}

export default function AboutSection({ config }: AboutSectionProps) {
  const t = useT();
  const toast = useToast();
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);

  useEffect(() => window.api.on('app:update', (state) => setUpdate(state)), []);

  function showError(error: unknown) {
    const info = readApiError(error);
    toast.error(t('errors.' + info.code, info.params));
  }

  async function checkUpdate() {
    setChecking(true);
    try {
      const state = await window.api.app.checkUpdate();
      setUpdate(state);
      if (state.state === 'none') toast.info(t('settings.about.upToDate'));
      else if (state.state === 'error') toast.error(state.detail ? `${t('settings.about.updateError')} (${state.detail})` : t('settings.about.updateError'));
    } catch (error) {
      showError(error);
    } finally {
      setChecking(false);
    }
  }

  async function downloadUpdate() {
    setWorking(true);
    try {
      await window.api.app.downloadUpdate();
    } catch (error) {
      showError(error);
    } finally {
      setWorking(false);
    }
  }

  async function installUpdate() {
    try {
      await window.api.app.installUpdate();
    } catch (error) {
      showError(error);
    }
  }

  async function openLink(url: string) {
    try {
      await window.api.app.openExternal(url);
    } catch (error) {
      showError(error);
    }
  }

  const licenseUrl = config?.licenseUrl ?? '';
  const privacyUrl = config?.privacyPolicyUrl ?? '';

  return (
    <Box title={t('settings.about.title')}>
      <SettingRow label={config?.appName ?? ''} description={t('settings.about.version', { version: config?.appVersion ?? '' })}>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={checking} onClick={() => void checkUpdate()}>
          {t('settings.about.checkUpdate')}
        </Button>
      </SettingRow>

      {update?.state === 'available' && (
        <SettingRow label={t('settings.about.updateAvailable', { version: update.version ?? '' })}>
          <Button variant="primary" size="sm" icon={<Download size={14} />} loading={working} onClick={() => void downloadUpdate()}>
            {t('settings.about.download')}
          </Button>
        </SettingRow>
      )}
      {update?.state === 'downloading' && (
        <div className="py-2">
          <ProgressBar value={update.percent} label={t('settings.about.downloading', { percent: Math.round(update.percent ?? 0) })} />
        </div>
      )}
      {update?.state === 'ready' && (
        <SettingRow label={t('settings.about.updateReady', { version: update.version ?? '' })}>
          <Button variant="primary" size="sm" icon={<RotateCw size={14} />} onClick={() => void installUpdate()}>
            {t('settings.about.install')}
          </Button>
        </SettingRow>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3">
        <div className="flex flex-col gap-1">
          <Button variant="secondary" size="sm" disabled={licenseUrl === ''} onClick={() => void openLink(licenseUrl)}>
            {t('settings.about.license')}
          </Button>
          {licenseUrl === '' && <span className="text-xs text-[var(--muted)]">{t('settings.about.noLink')}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="secondary" size="sm" disabled={privacyUrl === ''} onClick={() => void openLink(privacyUrl)}>
            {t('settings.about.privacy')}
          </Button>
          {privacyUrl === '' && <span className="text-xs text-[var(--muted)]">{t('settings.about.noLink')}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="secondary" size="sm" icon={<ScrollText size={14} />} onClick={() => setNoticesOpen(true)}>
            {t('settings.about.thirdParty')}
          </Button>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">{t('settings.about.disclaimer')}</p>

      <Modal
        open={noticesOpen}
        title={t('settings.about.thirdPartyTitle')}
        onClose={() => setNoticesOpen(false)}
        width={720}
        footer={
          <Button variant="secondary" onClick={() => setNoticesOpen(false)}>
            {t('settings.close')}
          </Button>
        }
      >
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text)]">{thirdPartyNotices}</pre>
      </Modal>
    </Box>
  );
}
