// FILE: src/renderer/pages/server/components/SettingsBox.tsx
import { useEffect, useState } from 'react';
import type { ServerConfig, ServerStatus } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Button, Toggle, useToast } from '@/components/ui';
import { useErrorToast, useSystemInfo } from '../hooks';
import RamSelect from './RamSelect';
import StorageSelect from './StorageSelect';

interface Props {
  config: ServerConfig;
  status: ServerStatus | null;
  onSaved: () => void;
}

const labelStyle = { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as const;

export default function SettingsBox({ config, status, onSaved }: Props): JSX.Element {
  const t = useT();
  const toast = useToast();
  const toastError = useErrorToast();
  const sys = useSystemInfo();
  const s = config.settings;

  const [ramMb, setRamMb] = useState(s.ramMb);
  const [storage, setStorage] = useState<number | null>(s.storageLimitMb);
  const [autoStart, setAutoStart] = useState(s.autoStart);
  const [autoRestart, setAutoRestart] = useState(s.autoRestartOnCrash);
  const [ramValid, setRamValid] = useState(true);
  const [storageValid, setStorageValid] = useState(true);
  const [saving, setSaving] = useState(false);

  // Re-sync when the saved settings change (after saving, or from another page).
  useEffect(() => {
    setRamMb(s.ramMb);
    setStorage(s.storageLimitMb);
    setAutoStart(s.autoStart);
    setAutoRestart(s.autoRestartOnCrash);
  }, [s.ramMb, s.storageLimitMb, s.autoStart, s.autoRestartOnCrash]);

  const dirty =
    ramMb !== s.ramMb ||
    storage !== s.storageLimitMb ||
    autoStart !== s.autoStart ||
    autoRestart !== s.autoRestartOnCrash;
  const running = status === 'running' || status === 'starting' || status === 'stopping';

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await window.api.servers.updateSettings(config.id, {
        ramMb,
        storageLimitMb: storage,
        autoStart,
        autoRestartOnCrash: autoRestart
      });
      toast.success(t('srv.dash.saved'));
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box title={t('srv.dash.quickSettings')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={labelStyle}>{t('srv.dash.ram')}</div>
          <RamSelect
            value={ramMb}
            totalRamMb={sys ? sys.totalRamMb : null}
            onChange={setRamMb}
            onValidChange={setRamValid}
          />
        </div>
        <div>
          <div style={labelStyle}>{t('srv.dash.maxStorage')}</div>
          <StorageSelect value={storage} onChange={setStorage} onValidChange={setStorageValid} />
        </div>
        <Toggle checked={autoStart} onChange={setAutoStart} label={t('srv.dash.autoStart')} />
        <Toggle checked={autoRestart} onChange={setAutoRestart} label={t('srv.dash.autoRestart')} />
        {running ? <div style={{ fontSize: 12, color: 'var(--warning)' }}>{t('srv.dash.restartNeeded')}</div> : null}
        <div>
          <Button
            variant="primary"
            loading={saving}
            disabled={!dirty || !ramValid || !storageValid || saving}
            onClick={() => void save()}
          >
            {t('srv.dash.save')}
          </Button>
        </div>
      </div>
    </Box>
  );
}
