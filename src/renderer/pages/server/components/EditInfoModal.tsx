import { useEffect, useState } from 'react';
import { cleanDescription, stripMcColors } from '@shared/mcText';
import type { ServerConfig, ServerStatus } from '@shared/types';
import { useT } from '@/i18n';
import { Button, Field, McTextEditor, Modal, useToast } from '@/components/ui';
import { useErrorToast } from '../hooks';

interface Props {
  config: ServerConfig;
  status: ServerStatus | null;
  open: boolean;
  onClose: () => void;
}

/** Edit the server name and description (MOTD). Both accept § and & colour codes. */
export default function EditInfoModal({ config, status, open, onClose }: Props): JSX.Element {
  const t = useT();
  const toast = useToast();
  const toastError = useErrorToast();
  const [name, setName] = useState(config.name);
  const [description, setDescription] = useState(config.description);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setName(config.name);
      setDescription(config.description);
      setShowErrors(false);
    }
    // Only reset when the dialog opens; do not overwrite what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nameError = stripMcColors(name).trim() === '' ? t('create.error.name') : null;
  const descError = cleanDescription(description) === null ? t('info.error.description') : null;
  const running = status === 'running' || status === 'starting' || status === 'stopping';
  const dirty = name.trim() !== config.name || (cleanDescription(description) ?? description) !== config.description;

  const save = async (): Promise<void> => {
    setShowErrors(true);
    if (nameError || descError) return;
    setBusy(true);
    try {
      await window.api.servers.setInfo(config.id, { name: name.trim(), description: cleanDescription(description) ?? '' });
      toast.success(t('srv.info.saved'));
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('srv.info.title')}
      width={560}
      onClose={() => (busy ? undefined : onClose())}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('srv.dash.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!dirty || busy} onClick={() => void save()}>
            {t('srv.dash.save')}
          </Button>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-4 overflow-auto pr-1">
        <Field label={t('srv.info.name')} error={showErrors ? nameError : null}>
          <McTextEditor value={name} onChange={setName} maxLength={100} invalid={showErrors && !!nameError} />
        </Field>
        <Field label={t('info.description.label')} error={showErrors ? descError : null}>
          <McTextEditor multiline value={description} onChange={setDescription} maxLength={256} placeholder={t('info.description.placeholder')} invalid={showErrors && !!descError} />
        </Field>
        {config.software === 'velocity' ? <p className="text-xs text-muted">{t('srv.info.velocityNote')}</p> : null}
        {running ? <p className="text-xs text-warning">{t('srv.info.restartNeeded')}</p> : null}
      </div>
    </Modal>
  );
}
