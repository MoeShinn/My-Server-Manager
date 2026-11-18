import { useEffect, useState } from 'react';
import { Button, Modal, TextInput } from '@/components/ui';
import { useT } from '@/i18n';
import { isValidFileName } from './fileUtils';

interface NameModalProps {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  siblingNames: string[];
  onSubmit(name: string): void;
  onClose(): void;
}

export default function NameModal({ open, title, label, confirmLabel, siblingNames, onSubmit, onClose }: NameModalProps) {
  const t = useT();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const trimmed = name.trim();
  let error: string | null = null;
  if (trimmed !== '') {
    if (!isValidFileName(trimmed)) error = t('files.nameError.invalid');
    else if (siblingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) error = t('files.nameError.exists');
  }
  const canSubmit = trimmed !== '' && error === null;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('files.cancel')}
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => canSubmit && onSubmit(trimmed)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div
        className="flex flex-col gap-2"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canSubmit) {
            event.preventDefault();
            onSubmit(trimmed);
          }
        }}
      >
        <label className="text-sm text-[var(--muted)]">{label}</label>
        <TextInput value={name} onChange={setName} />
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
