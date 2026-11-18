// FILE: src/renderer/pages/server/ServerIp.tsx
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Copy, ExternalLink, LogIn, Power, PowerOff, RefreshCw } from 'lucide-react';
import type { DownloadProgress, PlayitStatus } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Button, ConfirmDialog, ProgressBar, Spinner, TextInput, useToast } from '@/components/ui';
import { useCopy, useErrorToast, useServerConfig } from './hooks';
import { apiErrorInfo, validateHost } from './utils';
import IpBoxes from './components/IpBoxes';

const PLAYIT_TASK_ID = 'playit-install';

const codeStyle = {
  fontFamily: 'monospace',
  fontSize: 13,
  padding: '2px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6
} as const;

export default function ServerIp(): JSX.Element {
  const t = useT();
  const { id = '' } = useParams<{ id: string }>();
  const toast = useToast();
  const toastError = useErrorToast();
  const copy = useCopy();
  const { config, error, reload } = useServerConfig(id);

  const [playit, setPlayit] = useState<PlayitStatus | null>(null);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [busy, setBusy] = useState<'start' | 'stop' | 'reset' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hostText, setHostText] = useState('');
  const [saving, setSaving] = useState(false);
  const hostInit = useRef(false);

  useEffect(() => {
    let alive = true;
    window.api.content
      .playitStatus()
      .then((s) => {
        if (alive) setPlayit((prev) => prev ?? s);
      })
      .catch(() => undefined);
    const offStatus = window.api.on('playit:status', (s) => setPlayit(s));
    const offDownload = window.api.on('download:progress', (p) => {
      if (p.taskId !== PLAYIT_TASK_ID) return;
      setDownload(p.state === 'running' ? p : null);
    });
    return () => {
      alive = false;
      offStatus();
      offDownload();
    };
  }, []);

  // Prefill the paste field once with the saved address.
  useEffect(() => {
    if (config && !hostInit.current) {
      hostInit.current = true;
      setHostText(config.settings.customIpHost ?? '');
    }
  }, [config]);

  if (!config) {
    if (error) {
      return <div style={{ padding: 24, color: 'var(--danger)' }}>{t('errors.' + apiErrorInfo(error).code)}</div>;
    }
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const port = config.settings.port;
  const state = playit?.state ?? 'stopped';
  const canStart = state === 'not-installed' || state === 'stopped' || state === 'error';
  const canStop = state === 'starting' || state === 'needs-claim' || state === 'running';
  const canReset = state === 'stopped' || state === 'needs-claim' || state === 'running' || state === 'error';
  const working = busy !== null || download !== null || state === 'starting';
  const check = validateHost(hostText);
  const percent =
    download && download.totalBytes ? Math.min(100, (download.receivedBytes / download.totalBytes) * 100) : null;

  const startPlayit = async (): Promise<void> => {
    setBusy('start');
    try {
      await window.api.content.playitStart();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const stopPlayit = async (): Promise<void> => {
    setBusy('stop');
    try {
      await window.api.content.playitStop();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const resetPlayit = async (): Promise<void> => {
    setBusy('reset');
    try {
      await window.api.content.playitReset();
      setConfirmReset(false);
      toast.success(t('srv.ip.playit.reloginDone'));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const checkAppUpdate = async (): Promise<void> => {
    try {
      await window.api.app.checkUpdate();
    } catch (e) {
      toastError(e);
    }
  };

  const saveHost = async (): Promise<void> => {
    if (!check.ok) return;
    setSaving(true);
    try {
      await window.api.servers.updateSettings(config.id, { customIpHost: check.value });
      toast.success(t('srv.ip.saved'));
      void reload();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const stepStyle = { display: 'flex', gap: 10, alignItems: 'flex-start' } as const;
  const numStyle = {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: 'var(--bg)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <IpBoxes config={config} onChanged={() => void reload()} layout="row" />

      <Box title={t('srv.ip.playit.title')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.ip.playit.intro')}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong>{t('srv.ip.playit.statusLabel')}:</strong>
            <span>{t(`srv.ip.playit.state.${state}`)}</span>
            {working ? <Spinner /> : null}
          </div>

          {download ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{t('srv.ip.playit.downloading')}</div>
              <ProgressBar value={percent} />
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              icon={<Power size={14} />}
              loading={busy === 'start'}
              disabled={!canStart || busy !== null || download !== null}
              onClick={() => void startPlayit()}
            >
              {t('srv.ip.playit.start')}
            </Button>
            <Button
              variant="secondary"
              icon={<PowerOff size={14} />}
              loading={busy === 'stop'}
              disabled={!canStop || busy !== null}
              onClick={() => void stopPlayit()}
            >
              {t('srv.ip.playit.stop')}
            </Button>
            <Button
              variant="ghost"
              icon={<LogIn size={14} />}
              disabled={!canReset || busy !== null || download !== null}
              onClick={() => setConfirmReset(true)}
            >
              {t('srv.ip.playit.relogin')}
            </Button>
            {state === 'unsupported' ? (
              <Button variant="primary" icon={<RefreshCw size={14} />} onClick={() => void checkAppUpdate()}>
                {t('srv.ip.playit.checkUpdate')}
              </Button>
            ) : null}
            {state === 'needs-claim' && playit?.claimUrl ? (
              <>
                <Button
                  variant="primary"
                  icon={<ExternalLink size={14} />}
                  onClick={() => void window.api.app.openExternal(playit.claimUrl ?? '').catch(toastError)}
                >
                  {t('srv.ip.playit.openClaim')}
                </Button>
                <Button variant="secondary" icon={<Copy size={14} />} onClick={() => void copy(playit.claimUrl ?? '')}>
                  {t('srv.ip.playit.copyClaim')}
                </Button>
              </>
            ) : null}
          </div>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <li style={stepStyle}>
              <span style={numStyle}>1</span>
              <span>{t('srv.ip.playit.step1')}</span>
            </li>
            <li style={stepStyle}>
              <span style={numStyle}>2</span>
              <span>{t('srv.ip.playit.step2')}</span>
            </li>
            <li style={stepStyle}>
              <span style={numStyle}>3</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {t('srv.ip.playit.step3')}
                <code style={codeStyle}>{`localhost:${port}`}</code>
                <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={() => void copy(`localhost:${port}`)}>
                  {t('srv.ip.playit.copy')}
                </Button>
              </span>
            </li>
            <li style={stepStyle}>
              <span style={numStyle}>4</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <span>{t('srv.ip.playit.step4')}</span>
                <TextInput value={hostText} onChange={setHostText} placeholder={t('srv.ip.hostPlaceholder')} />
                {hostText.trim().length > 0 && !check.ok ? (
                  <span style={{ fontSize: 12, color: 'var(--danger)' }}>{t(check.errorKey)}</span>
                ) : null}
                <div>
                  <Button variant="primary" loading={saving} disabled={!check.ok || saving} onClick={() => void saveHost()}>
                    {t('srv.dash.save')}
                  </Button>
                </div>
              </div>
            </li>
          </ol>

          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('srv.ip.playit.sharedNote')}</div>
        </div>
      </Box>

      <Box title={t('srv.ip.manual.title')}>
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--text)' }}>{t('srv.ip.manual.summary')}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, fontSize: 13 }}>
            <span>{t('srv.ip.manual.step1', { port })}</span>
            <span>{t('srv.ip.manual.step2')}</span>
            <span>{t('srv.ip.manual.step3')}</span>
            <span style={{ color: 'var(--muted)' }}>
              {t('srv.ip.manual.portLabel')}: <code style={codeStyle}>{`TCP ${port}`}</code>
            </span>
          </div>
        </details>
      </Box>
      <ConfirmDialog
        open={confirmReset}
        title={t('srv.ip.playit.reloginTitle')}
        message={t('srv.ip.playit.reloginMessage')}
        confirmLabel={t('srv.ip.playit.reloginConfirm')}
        danger
        loading={busy === 'reset'}
        onConfirm={() => void resetPlayit()}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
