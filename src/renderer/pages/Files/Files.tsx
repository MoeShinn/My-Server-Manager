import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, Info } from 'lucide-react';
import { Box, ConfirmDialog, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { FileEntry } from '@shared/types';
import FileTable from './FileTable';
import FileToolbar from './FileToolbar';
import MoveModal from './MoveModal';
import NameModal from './NameModal';
import RenameModal from './RenameModal';
import { readApiError } from './errorUtils';
import { PAGE_SIZE, joinRel, parentOf } from './fileUtils';

// Monaco is large, so the editor is loaded only when a file is opened.
const FileEditor = lazy(() => import('./FileEditor'));

interface OpenFile {
  relPath: string;
  name: string;
}

type PendingAction = { type: 'open'; file: OpenFile } | { type: 'close' } | null;

export default function Files() {
  const { id = '' } = useParams<{ id: string }>();
  const t = useT();
  const toast = useToast();

  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [newEntry, setNewEntry] = useState<'file' | 'folder' | null>(null);

  const [listWidthPercent, setListWidthPercent] = useState(45);
  const splitRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const showError = useCallback(
    (error: unknown) => {
      const info = readApiError(error);
      toast.error(t('errors.' + info.code, info.params));
    },
    [t, toast],
  );

  // ---------- loading ----------

  const load = useCallback(
    async (targetDir: string, options?: { keepSelection?: boolean }) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      try {
        const list = await window.api.files.list(id, targetDir);
        if (requestRef.current !== requestId) return;
        setEntries(list);
        setDir(targetDir);
        setVisibleCount(PAGE_SIZE);
        setRenamingPath(null);
        setSelected((current) => {
          if (!options?.keepSelection) return new Set();
          const present = new Set(list.map((e) => e.relPath));
          return new Set([...current].filter((p) => present.has(p)));
        });
      } catch (error) {
        if (requestRef.current !== requestId) return;
        showError(error);
        if (readApiError(error).code === 'NOT_FOUND' && targetDir !== '') {
          void load('');
        }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [id, showError],
  );

  useEffect(() => {
    setOpenFile(null);
    setDirty(false);
    setPending(null);
    anchorRef.current = null;
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Show a hint while the server runs, because changes may need a restart or reload.
  useEffect(() => {
    let alive = true;
    window.api.servers
      .list()
      .then((servers) => {
        if (!alive) return;
        const found = servers.find((s) => s.id === id);
        setRunning(found ? found.status === 'running' || found.status === 'starting' : false);
      })
      .catch(() => undefined);
    const off = window.api.on('server:status', (payload) => {
      if (payload.id !== id) return;
      setRunning(payload.status === 'running' || payload.status === 'starting');
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  // ---------- derived ----------

  const visibleEntries = useMemo(() => entries.slice(0, visibleCount), [entries, visibleCount]);
  const selectedEntries = useMemo(() => entries.filter((e) => selected.has(e.relPath)), [entries, selected]);
  const siblingNames = useMemo(() => entries.map((e) => e.name), [entries]);
  const segments = dir ? dir.split('/') : [];

  // ---------- open file guards ----------

  function affectsOpenFile(relPaths: string[]): boolean {
    if (!openFile) return false;
    return relPaths.some((p) => openFile.relPath === p || openFile.relPath.startsWith(`${p}/`));
  }

  /** Returns false (and tells the user) when the open file has unsaved changes and would be affected. */
  function guardOpenFile(relPaths: string[]): boolean {
    if (!affectsOpenFile(relPaths)) return true;
    if (dirty) {
      toast.info(t('files.editor.saveFirst'));
      return false;
    }
    setOpenFile(null);
    return true;
  }

  function closeEditorNow() {
    setOpenFile(null);
    setDirty(false);
  }

  function requestOpenFile(file: OpenFile) {
    if (openFile && openFile.relPath === file.relPath) return;
    if (openFile && dirty) {
      setPending({ type: 'open', file });
      return;
    }
    setDirty(false);
    setOpenFile(file);
  }

  function requestCloseEditor() {
    if (dirty) setPending({ type: 'close' });
    else closeEditorNow();
  }

  function confirmDiscard() {
    const action = pending;
    setPending(null);
    setDirty(false);
    if (action?.type === 'open') setOpenFile(action.file);
    else closeEditorNow();
  }

  // ---------- navigation and selection ----------

  function openEntry(entry: FileEntry) {
    if (entry.isDir) void load(entry.relPath);
    else requestOpenFile({ relPath: entry.relPath, name: entry.name });
  }

  function goUp() {
    if (dir !== '') void load(parentOf(dir));
  }

  function handleRowClick(entry: FileEntry, event: ReactMouseEvent) {
    if (renamingPath) return;
    if (event.shiftKey && anchorRef.current) {
      const from = entries.findIndex((e) => e.relPath === anchorRef.current);
      const to = entries.findIndex((e) => e.relPath === entry.relPath);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        setSelected(new Set(entries.slice(start, end + 1).map((e) => e.relPath)));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      toggleSelected(entry);
      return;
    }
    anchorRef.current = entry.relPath;
    setSelected(new Set([entry.relPath]));
  }

  function toggleSelected(entry: FileEntry) {
    anchorRef.current = entry.relPath;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(entry.relPath)) next.delete(entry.relPath);
      else next.add(entry.relPath);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => (entries.length > 0 && entries.every((e) => current.has(e.relPath)) ? new Set() : new Set(entries.map((e) => e.relPath))));
  }

  // ---------- actions ----------

  function startRename() {
    if (selectedEntries.length === 1) {
      if (!guardOpenFile([selectedEntries[0].relPath])) return;
      setRenamingPath(selectedEntries[0].relPath);
    } else if (selectedEntries.length > 1) {
      if (!guardOpenFile(selectedEntries.map((e) => e.relPath))) return;
      setShowRenameModal(true);
    }
  }

  async function applyRename(items: { relPath: string; newName: string }[]) {
    setBusy(true);
    try {
      await window.api.files.rename(id, items);
      setShowRenameModal(false);
      const renamed = items.map((item) => joinRel(parentOf(item.relPath), item.newName));
      await load(dir);
      setSelected(new Set(renamed));
      toast.success(t('files.rename.done'));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function commitInlineRename(entry: FileEntry, newName: string) {
    setRenamingPath(null);
    await applyRename([{ relPath: entry.relPath, newName }]);
  }

  function startDelete() {
    if (selectedEntries.length === 0) return;
    if (!guardOpenFile(selectedEntries.map((e) => e.relPath))) return;
    setShowDelete(true);
  }

  async function confirmDelete() {
    const targets = selectedEntries.map((e) => e.relPath);
    setShowDelete(false);
    setBusy(true);
    try {
      await window.api.files.remove(id, targets);
      toast.success(t('files.delete.done'));
      await load(dir);
    } catch (error) {
      showError(error);
      await load(dir, { keepSelection: true });
    } finally {
      setBusy(false);
    }
  }

  function startMove() {
    if (selectedEntries.length === 0) return;
    if (!guardOpenFile(selectedEntries.map((e) => e.relPath))) return;
    setShowMove(true);
  }

  async function confirmMove(destRelDir: string) {
    setBusy(true);
    try {
      await window.api.files.move(
        id,
        selectedEntries.map((e) => e.relPath),
        destRelDir,
      );
      setShowMove(false);
      toast.success(t('files.move.done'));
      await load(dir);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function createEntry(name: string) {
    const kind = newEntry;
    setNewEntry(null);
    if (!kind) return;
    try {
      const target = joinRel(dir, name);
      if (kind === 'file') await window.api.files.createFile(id, target);
      else await window.api.files.createFolder(id, target);
      await load(dir);
      setSelected(new Set([target]));
      if (kind === 'file') requestOpenFile({ relPath: target, name });
    } catch (error) {
      showError(error);
    }
  }

  async function revealCurrentFolder() {
    try {
      await window.api.files.reveal(id, dir);
    } catch (error) {
      showError(error);
    }
  }

  async function revealOpenFileFolder() {
    if (!openFile) return;
    try {
      await window.api.files.reveal(id, parentOf(openFile.relPath));
    } catch (error) {
      showError(error);
    }
  }

  // ---------- keyboard ----------

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type !== 'checkbox') return;
    if (target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Delete') {
      event.preventDefault();
      startDelete();
    } else if (event.key === 'F2') {
      event.preventDefault();
      startRename();
    } else if (event.key === 'Enter') {
      if (selectedEntries.length === 1) {
        event.preventDefault();
        openEntry(selectedEntries[0]);
      }
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      goUp();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelected(new Set(entries.map((e) => e.relPath)));
    }
  }

  // ---------- split pane resizing ----------

  function handleDividerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setListWidthPercent(Math.min(75, Math.max(20, percent)));
    };
    const up = (upEvent: PointerEvent) => {
      element.releasePointerCapture(upEvent.pointerId);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
  }

  // ---------- delete dialog text ----------

  const deleteMessage = useMemo(() => {
    if (selectedEntries.length === 1) return t('files.delete.messageOne', { name: selectedEntries[0].name });
    const names = selectedEntries
      .slice(0, 3)
      .map((e) => e.name)
      .join(', ');
    return t('files.delete.messageMany', { count: selectedEntries.length, names });
  }, [selectedEntries, t]);

  // ---------- render ----------

  const listPane = (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) setSelected(new Set());
      }}
    >
      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={t('files.breadcrumb.label')}>
        <button type="button" className="rounded px-1 text-[var(--accent)] hover:underline" onClick={() => void load('')}>
          {t('files.breadcrumb.root')}
        </button>
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join('/');
          const last = index === segments.length - 1;
          return (
            <span key={target} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-[var(--muted)]" />
              {last ? (
                <span className="px-1 text-[var(--text)]">{segment}</span>
              ) : (
                <button type="button" className="rounded px-1 text-[var(--accent)] hover:underline" onClick={() => void load(target)}>
                  {segment}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <FileTable
        entries={visibleEntries}
        totalCount={entries.length}
        loading={loading}
        selected={selected}
        renamingPath={renamingPath}
        openFilePath={openFile?.relPath ?? null}
        compact={openFile !== null}
        siblingNames={siblingNames}
        onRowClick={handleRowClick}
        onToggle={toggleSelected}
        onToggleAll={toggleAll}
        onOpen={openEntry}
        onRenameCommit={(entry, name) => void commitInlineRename(entry, name)}
        onRenameCancel={() => setRenamingPath(null)}
        onShowMore={() => setVisibleCount((count) => count + PAGE_SIZE)}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {running && (
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: 'var(--warning)',
            color: 'var(--warning)',
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          }}
        >
          <Info size={16} className="shrink-0" />
          {t('files.runningHint')}
        </div>
      )}

      <Box className="shrink-0">
        <FileToolbar
          selectedCount={selected.size}
          loading={loading}
          onDelete={startDelete}
          onMove={startMove}
          onRename={startRename}
          onReveal={() => void revealCurrentFolder()}
          onNewFile={() => setNewEntry('file')}
          onNewFolder={() => setNewEntry('folder')}
          onRefresh={() => void load(dir, { keepSelection: true })}
        />
      </Box>

      <div ref={splitRef} className="flex min-h-0 flex-1">
        {openFile ? (
          <>
            <div className="flex min-h-0 min-w-0" style={{ width: `${listWidthPercent}%` }}>
              {listPane}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={handleDividerPointerDown}
              className="mx-1 w-1.5 shrink-0 cursor-col-resize rounded bg-[var(--border)] transition-colors hover:bg-[var(--accent)]"
            />
            <div className="min-h-0 min-w-0 flex-1">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Spinner />
                  </div>
                }
              >
                <FileEditor
                  key={openFile.relPath}
                  serverId={id}
                  relPath={openFile.relPath}
                  name={openFile.name}
                  onDirtyChange={setDirty}
                  onRequestClose={requestCloseEditor}
                  onRevealFolder={() => void revealOpenFileFolder()}
                />
              </Suspense>
            </div>
          </>
        ) : (
          listPane
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        title={t('files.delete.title')}
        message={`${deleteMessage} ${t('files.delete.note')}`}
        confirmLabel={t('files.delete.confirm')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDelete(false)}
      />

      <ConfirmDialog
        open={pending !== null}
        title={t('files.discard.title')}
        message={t('files.discard.message')}
        confirmLabel={t('files.discard.confirm')}
        danger
        onConfirm={confirmDiscard}
        onCancel={() => setPending(null)}
      />

      <RenameModal
        open={showRenameModal}
        items={selectedEntries}
        siblingNames={siblingNames}
        busy={busy}
        onApply={(items) => void applyRename(items)}
        onClose={() => setShowRenameModal(false)}
      />

      <MoveModal
        open={showMove}
        serverId={id}
        startDir={dir}
        moving={selectedEntries}
        busy={busy}
        onMove={(dest) => void confirmMove(dest)}
        onClose={() => setShowMove(false)}
      />

      <NameModal
        open={newEntry !== null}
        title={newEntry === 'folder' ? t('files.new.folderTitle') : t('files.new.fileTitle')}
        label={t('files.new.nameLabel')}
        confirmLabel={t('files.new.create')}
        siblingNames={siblingNames}
        onSubmit={(name) => void createEntry(name)}
        onClose={() => setNewEntry(null)}
      />
    </div>
  );
}
