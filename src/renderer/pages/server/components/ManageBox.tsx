// FILE: src/renderer/pages/server/components/ManageBox.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { ServerConfig, ServerStatus } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Button, ConfirmDialog, Modal, TextInput, Toggle, useToast } from '@/components/ui';
import { useErrorToast } from '../hooks';

interface Props {
  config: ServerConfig;
  status: ServerStatus | null;
  onChanged: () => void;
}

export default function ManageBox({ config, status, onChanged }: Props): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const toastError = useErrorToast();

  const [renameOpen, setRenameOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [busy, setBusy] = useState(false);

  const stopped = status === null || status === 'stopped' || status === 'crashed';
  const nameOk = newName.trim().length > 0;

  const doRename = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.api.servers.rename(config.id, newName.trim());
      setRenameOpen(false);
      toast.success(t('srv.dash.renamed'));
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const doDuplicate = async (): Promise<void> => {
    setBusy(true);
    try {
      const created = await window.api.servers.duplicate(config.id, newName.trim());
      setDupOpen(false);
      toast.success(t('srv.dash.duplicated'));
      navigate(`/server/${created.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (): Promise<void> => {
    setDeleteOpen(false);
    try {
      await window.api.servers.remove(config.id, deleteFiles);
      toast.success(t('srv.dash.deleted'));
      navigate('/servers');
    } catch (e) {
      toastError(e);
    }
  };

  const nameModal = (
    kind: 'rename' | 'duplicate',
    open: boolean,
    onClose: () => void,
    onSubmit: () => void
  ): JSX.Element => (
    <Modal
      open={open}
      title={kind === 'rename' ? t('srv.dash.renameTitle') : t('srv.dash.duplicateTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('srv.dash.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!nameOk || busy} onClick={onSubmit}>
            {kind === 'rename' ? t('srv.dash.rename') : t('srv.dash.duplicate')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.dash.nameLabel')}</span>
        <TextInput value={newName} onChange={setNewName} placeholder={t('srv.dash.namePlaceholder')} />
      </div>
    </Modal>
  );

  return (
    <Box title={t('srv.dash.manage')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            icon={<Pencil size={14} />}
            onClick={() => {
              setNewName(config.name);
              setRenameOpen(true);
            }}
          >
            {t('srv.dash.rename')}
          </Button>
          <Button
            variant="secondary"
            icon={<Copy size={14} />}
            disabled={!stopped}
            onClick={() => {
              setNewName(`${config.name} (2)`);
              setDupOpen(true);
            }}
          >
            {t('srv.dash.duplicate')}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={14} />}
            disabled={!stopped}
            onClick={() => {
              setDeleteFiles(true);
              setDeleteOpen(true);
            }}
          >
            {t('srv.dash.delete')}
          </Button>
        </div>
        {!stopped ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('srv.dash.manageNeedsStopped')}</div> : null}
      </div>

      {nameModal('rename', renameOpen, () => setRenameOpen(false), () => void doRename())}
      {nameModal('duplicate', dupOpen, () => setDupOpen(false), () => void doDuplicate())}

      <ConfirmDialog
        open={deleteOpen}
        title={t('srv.dash.deleteTitle')}
        message={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span>{t('srv.dash.deleteMessage', { name: config.name })}</span>
            <Toggle checked={deleteFiles} onChange={setDeleteFiles} label={t('srv.dash.deleteFiles')} />
          </div>
        }
        confirmLabel={t('srv.dash.delete')}
        danger
        requireText={config.name}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void doRemove()}
      />
    </Box>
  );
}
