// FILE: src/renderer/pages/server/components/IpBoxes.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import type { ServerConfig } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Button, Modal, TextInput, useToast } from '@/components/ui';
import { useCopy, useErrorToast, useSystemInfo } from '../hooks';
import { validateHost } from '../utils';

interface Props {
  config: ServerConfig;
  onChanged: () => void;
  /** 'stack' = one above the other (dashboard cell); 'row' = side by side (IP page). */
  layout?: 'stack' | 'row';
}

const addressStyle = {
  display: 'block',
  width: '100%',
  padding: '6px 10px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontFamily: 'monospace',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  wordBreak: 'break-all'
} as const;

export default function IpBoxes({ config, onChanged, layout = 'stack' }: Props): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const toastError = useErrorToast();
  const copy = useCopy();
  const sys = useSystemInfo();

  const port = config.settings.port;
  const customHost = config.settings.customIpHost;
  const localAddresses = (sys?.localIps ?? []).slice(0, 3).map((ip) => `${ip}:${port}`);

  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const check = validateHost(text);

  const openModal = (): void => {
    setText(customHost ?? '');
    setModalOpen(true);
  };

  const save = async (host: string | null): Promise<void> => {
    setSaving(true);
    try {
      await window.api.servers.updateSettings(config.id, { customIpHost: host });
      toast.success(t(host === null ? 'srv.ip.removed' : 'srv.ip.saved'));
      setModalOpen(false);
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: layout === 'row' ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
        alignContent: 'start'
      }}
    >
      <Box title={t('srv.ip.local')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {localAddresses.map((addr) => (
            <button key={addr} type="button" style={addressStyle} onClick={() => void copy(addr)} title={t('srv.ip.clickToCopy')}>
              {addr}
            </button>
          ))}
          <button type="button" style={addressStyle} onClick={() => void copy(`localhost:${port}`)} title={t('srv.ip.clickToCopy')}>
            {`localhost:${port}`}
          </button>
        </div>
      </Box>

      <Box title={t('srv.ip.custom')}>
        {customHost === null ? (
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 8,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'flex-start'
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.ip.customEmpty')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={openModal}>
                {t('srv.ip.add')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate(`/server/${config.id}/ip`)}>
                {t('srv.ip.usePlayit')}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <button type="button" style={addressStyle} onClick={() => void copy(customHost)} title={t('srv.ip.clickToCopy')}>
              {customHost}
            </button>
            <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={openModal}>
              {t('srv.ip.edit')}
            </Button>
          </div>
        )}
      </Box>

      <Modal
        open={modalOpen}
        title={customHost === null ? t('srv.ip.addTitle') : t('srv.ip.editTitle')}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            {customHost !== null ? (
              <Button variant="danger" disabled={saving} onClick={() => void save(null)}>
                {t('srv.ip.remove')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t('srv.dash.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!check.ok || saving}
              onClick={() => {
                if (check.ok) void save(check.value);
              }}
            >
              {t('srv.dash.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.ip.hostHelp')}</span>
          <TextInput value={text} onChange={setText} placeholder={t('srv.ip.hostPlaceholder')} />
          {text.trim().length > 0 && !check.ok ? (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>{t(check.errorKey)}</span>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
