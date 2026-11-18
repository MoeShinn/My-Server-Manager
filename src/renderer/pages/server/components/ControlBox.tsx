// FILE: src/renderer/pages/server/components/ControlBox.tsx
import { useState } from 'react';
import { Pencil, Play, RotateCw, Skull, Square } from 'lucide-react';
import type { ServerConfig, ServerStatus } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Button, ConfirmDialog, McText } from '@/components/ui';
import { useErrorToast } from '../hooks';
import { apiErrorInfo, formatDuration } from '../utils';
import EditInfoModal from './EditInfoModal';
import StatusBadge from './StatusBadge';
import VersionBadge from './VersionBadge';

type Busy = 'start' | 'stop' | 'restart' | 'kill' | null;

interface Props {
  config: ServerConfig;
  status: ServerStatus | null;
  uptimeSec: number;
}

export default function ControlBox({ config, status, uptimeSec }: Props): JSX.Element {
  const t = useT();
  const toastError = useErrorToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [eulaOpen, setEulaOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const st: ServerStatus = status ?? 'stopped';
  const id = config.id;

  const start = async (): Promise<void> => {
    setBusy('start');
    try {
      await window.api.servers.start(id);
    } catch (e) {
      if (apiErrorInfo(e).code === 'EULA_NOT_ACCEPTED') setEulaOpen(true);
      else toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const acceptEulaAndStart = async (): Promise<void> => {
    setEulaOpen(false);
    setBusy('start');
    try {
      await window.api.servers.acceptEula(id);
      await window.api.servers.start(id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const run = async (kind: 'stop' | 'restart' | 'kill', fn: () => Promise<void>): Promise<void> => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const anyBusy = busy !== null;

  return (
    <Box title={t('srv.dash.control')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700, wordBreak: 'break-word' }}>
              <McText text={config.name} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', wordBreak: 'break-word' }}>
              {config.description.trim() !== '' ? <McText text={config.description} /> : <span style={{ fontStyle: 'italic' }}>{t('srv.info.noDescription')}</span>}
            </div>
          </div>
          <Button variant="ghost" size="sm" aria-label={t('srv.info.edit')} title={t('srv.info.edit')} icon={<Pencil size={14} />} onClick={() => setInfoOpen(true)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={st} />
          <VersionBadge
            software={config.software}
            mcVersion={config.mcVersion}
            build={config.build}
            customJarName={config.customJarName}
          />
        </div>
        {st === 'running' ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {t('srv.dash.uptime')}: <span style={{ color: 'var(--text)' }}>{formatDuration(uptimeSec)}</span>
          </div>
        ) : null}
        {st === 'crashed' ? (
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{t('srv.dash.crashed')}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {st === 'stopped' || st === 'crashed' ? (
            <Button
              variant="primary"
              icon={<Play size={14} />}
              loading={busy === 'start'}
              disabled={anyBusy}
              onClick={() => void start()}
            >
              {t('srv.dash.start')}
            </Button>
          ) : null}
          {st === 'running' ? (
            <>
              <Button
                variant="danger"
                icon={<Square size={14} />}
                loading={busy === 'stop'}
                disabled={anyBusy}
                onClick={() => void run('stop', () => window.api.servers.stop(id))}
              >
                {t('srv.dash.stop')}
              </Button>
              <Button
                variant="secondary"
                icon={<RotateCw size={14} />}
                loading={busy === 'restart'}
                disabled={anyBusy}
                onClick={() => void run('restart', () => window.api.servers.restart(id))}
              >
                {t('srv.dash.restart')}
              </Button>
            </>
          ) : null}
          {st === 'starting' ? (
            <Button
              variant="danger"
              icon={<Square size={14} />}
              loading={busy === 'stop'}
              disabled={anyBusy}
              onClick={() => void run('stop', () => window.api.servers.stop(id))}
            >
              {t('srv.dash.stop')}
            </Button>
          ) : null}
          {st === 'stopping' ? (
            <Button
              variant="danger"
              icon={<Skull size={14} />}
              loading={busy === 'kill'}
              disabled={anyBusy}
              onClick={() => setKillOpen(true)}
            >
              {t('srv.dash.forceStop')}
            </Button>
          ) : null}
        </div>
      </div>

      <EditInfoModal config={config} status={status} open={infoOpen} onClose={() => setInfoOpen(false)} />

      <ConfirmDialog
        open={killOpen}
        title={t('srv.dash.killTitle')}
        message={t('srv.dash.killMessage')}
        confirmLabel={t('srv.dash.forceStop')}
        danger
        onCancel={() => setKillOpen(false)}
        onConfirm={() => {
          setKillOpen(false);
          void run('kill', () => window.api.servers.kill(id));
        }}
      />

      <ConfirmDialog
        open={eulaOpen}
        title={t('srv.dash.eulaTitle')}
        message={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>{t('srv.dash.eulaMessage')}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void window.api.app.openExternal('https://aka.ms/MinecraftEULA').catch(toastError)}
            >
              {t('srv.dash.eulaRead')}
            </Button>
          </div>
        }
        confirmLabel={t('srv.dash.eulaAccept')}
        onCancel={() => setEulaOpen(false)}
        onConfirm={() => void acceptEulaAndStart()}
      />
    </Box>
  );
}
