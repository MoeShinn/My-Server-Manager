import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, ChevronRight, Folder } from 'lucide-react';
import { Button, Modal, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { FileEntry } from '@shared/types';
import { readApiError } from './errorUtils';
import { parentOf } from './fileUtils';

interface MoveModalProps {
  open: boolean;
  serverId: string;
  startDir: string;
  /** Items being moved: their folders are hidden so nobody can move a folder into itself. */
  moving: FileEntry[];
  busy: boolean;
  onMove(destRelDir: string): void;
  onClose(): void;
}

export default function MoveModal({ open, serverId, startDir, moving, busy, onMove, onClose }: MoveModalProps) {
  const t = useT();
  const toast = useToast();
  const [browseDir, setBrowseDir] = useState(startDir);
  const [folders, setFolders] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (dir: string) => {
      setLoading(true);
      try {
        const entries = await window.api.files.list(serverId, dir);
        const hidden = new Set(moving.map((m) => m.relPath));
        setFolders(entries.filter((e) => e.isDir && !hidden.has(e.relPath)));
        setBrowseDir(dir);
      } catch (error) {
        const info = readApiError(error);
        toast.error(t('errors.' + info.code, info.params));
      } finally {
        setLoading(false);
      }
    },
    [serverId, moving, t, toast],
  );

  useEffect(() => {
    if (open) void load(startDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const segments = browseDir ? browseDir.split('/') : [];
  const sameFolder = browseDir === startDir;

  return (
    <Modal
      open={open}
      title={t('files.move.title')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('files.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={sameFolder || loading} onClick={() => onMove(browseDir)}>
            {t('files.move.here')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--muted)]">{t('files.move.hint')}</p>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" className="rounded px-1 text-[var(--accent)] hover:underline" onClick={() => void load('')}>
            {t('files.breadcrumb.root')}
          </button>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join('/');
            return (
              <span key={target} className="flex items-center gap-1">
                <ChevronRight size={12} className="text-[var(--muted)]" />
                <button type="button" className="rounded px-1 text-[var(--accent)] hover:underline" onClick={() => void load(target)}>
                  {segment}
                </button>
              </span>
            );
          })}
        </div>
        <div className="h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <ul>
              {browseDir !== '' && (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--border)]"
                    onClick={() => void load(parentOf(browseDir))}
                  >
                    <ArrowUp size={14} />
                    {t('files.move.up')}
                  </button>
                </li>
              )}
              {folders.map((folder) => (
                <li key={folder.relPath}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--border)]"
                    onClick={() => void load(folder.relPath)}
                  >
                    <Folder size={14} style={{ color: 'var(--warning)' }} />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
              {folders.length === 0 && browseDir === '' && (
                <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">{t('files.move.noFolders')}</li>
              )}
            </ul>
          )}
        </div>
        {sameFolder && <p className="text-xs text-[var(--muted)]">{t('files.move.sameFolder')}</p>}
      </div>
    </Modal>
  );
}
