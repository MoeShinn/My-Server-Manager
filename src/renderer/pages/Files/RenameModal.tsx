import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, TextInput } from '@/components/ui';
import { useT } from '@/i18n';
import type { FileEntry } from '@shared/types';
import { isValidFileName } from './fileUtils';

interface RenameModalProps {
  open: boolean;
  items: FileEntry[];
  /** Every name in the current folder, used to detect clashes with items that are not being renamed. */
  siblingNames: string[];
  busy: boolean;
  onApply(items: { relPath: string; newName: string }[]): void;
  onClose(): void;
}

export default function RenameModal({ open, items, siblingNames, busy, onApply, onClose }: RenameModalProps) {
  const t = useT();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const item of items) initial[item.relPath] = item.name;
    setNames(initial);
  }, [open, items]);

  const errors = useMemo(() => {
    const result: Record<string, string | null> = {};
    const beingRenamed = new Set(items.map((i) => i.name.toLowerCase()));
    const external = new Set(siblingNames.filter((n) => !beingRenamed.has(n.toLowerCase())).map((n) => n.toLowerCase()));
    const counts = new Map<string, number>();
    for (const item of items) {
      const value = (names[item.relPath] ?? item.name).trim();
      counts.set(value.toLowerCase(), (counts.get(value.toLowerCase()) ?? 0) + 1);
    }
    for (const item of items) {
      const value = (names[item.relPath] ?? item.name).trim();
      if (!isValidFileName(value)) result[item.relPath] = t('files.nameError.invalid');
      else if ((counts.get(value.toLowerCase()) ?? 0) > 1 || external.has(value.toLowerCase())) result[item.relPath] = t('files.nameError.exists');
      else result[item.relPath] = null;
    }
    return result;
  }, [items, names, siblingNames, t]);

  const hasError = Object.values(errors).some((e) => e !== null);
  const changed = items.filter((item) => (names[item.relPath] ?? item.name).trim() !== item.name);

  return (
    <Modal
      open={open}
      title={t('files.rename.title')}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('files.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={hasError || changed.length === 0}
            onClick={() => onApply(changed.map((item) => ({ relPath: item.relPath, newName: (names[item.relPath] ?? item.name).trim() })))}
          >
            {t('files.rename.apply')}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.relPath} className="flex flex-col gap-1">
            <span className="truncate text-xs text-[var(--muted)]" title={item.name}>
              {item.name}
            </span>
            <TextInput
              value={names[item.relPath] ?? item.name}
              onChange={(value) => setNames((current) => ({ ...current, [item.relPath]: value }))}
            />
            {errors[item.relPath] && <span className="text-xs text-[var(--danger)]">{errors[item.relPath]}</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
