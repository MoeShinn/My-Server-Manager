import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useT } from '@/i18n';
import type { FileEntry } from '@shared/types';
import { Button, Spinner } from '@/components/ui';
import { ICONS, ICON_COLORS, baseSelectionLength, formatDate, formatSize, iconKindOf, isValidFileName } from './fileUtils';

interface FileTableProps {
  entries: FileEntry[];
  totalCount: number;
  loading: boolean;
  selected: Set<string>;
  renamingPath: string | null;
  openFilePath: string | null;
  compact: boolean;
  /** All names in the folder, to detect clashes while renaming in place. */
  siblingNames: string[];
  onRowClick(entry: FileEntry, event: MouseEvent): void;
  onToggle(entry: FileEntry): void;
  onToggleAll(): void;
  onOpen(entry: FileEntry): void;
  onRenameCommit(entry: FileEntry, newName: string): void;
  onRenameCancel(): void;
  onShowMore(): void;
}

interface InlineRenameProps {
  entry: FileEntry;
  siblingNames: string[];
  onCommit(newName: string): void;
  onCancel(): void;
}

function InlineRename({ entry, siblingNames, onCommit, onCancel }: InlineRenameProps) {
  const t = useT();
  const [value, setValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(0, baseSelectionLength(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = value.trim();
  let error: string | null = null;
  if (!isValidFileName(trimmed)) error = t('files.nameError.invalid');
  else if (trimmed !== entry.name && siblingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase() && n !== entry.name)) {
    error = t('files.nameError.exists');
  }

  function finish(commit: boolean) {
    if (finished.current) return;
    if (commit) {
      if (error) return;
      finished.current = true;
      if (trimmed === entry.name) onCancel();
      else onCommit(trimmed);
    } else {
      finished.current = true;
      onCancel();
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(false)}
        aria-invalid={error !== null}
        className="w-full rounded border bg-[var(--bg)] px-1.5 py-0.5 text-sm text-[var(--text)] outline-none"
        style={{ borderColor: error ? 'var(--danger)' : 'var(--accent)' }}
      />
      {error && (
        <span className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded border border-[var(--danger)] bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--danger)]">
          {error}
        </span>
      )}
    </div>
  );
}

export default function FileTable(props: FileTableProps) {
  const t = useT();
  const { entries, selected, compact } = props;
  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.relPath));
  const columns = compact ? '28px minmax(0,1fr) 84px' : '28px minmax(0,1fr) 96px 170px';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div
        className="grid items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--muted)]"
        style={{ gridTemplateColumns: columns }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={props.onToggleAll}
          aria-label={t('files.table.selectAll')}
          style={{ accentColor: 'var(--accent)' }}
        />
        <span>{t('files.table.name')}</span>
        <span className="text-right">{t('files.table.size')}</span>
        {!compact && <span>{t('files.table.modified')}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.loading && entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">{t('files.empty')}</div>
        ) : (
          entries.map((entry) => {
            const kind = iconKindOf(entry);
            const Icon = ICONS[kind];
            const isSelected = selected.has(entry.relPath);
            const isOpen = props.openFilePath === entry.relPath;
            const renaming = props.renamingPath === entry.relPath;
            return (
              <div
                key={entry.relPath}
                role="row"
                aria-selected={isSelected}
                onClick={(event) => props.onRowClick(entry, event)}
                onDoubleClick={() => props.onOpen(entry)}
                className="grid cursor-default select-none items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-sm last:border-b-0"
                style={{
                  gridTemplateColumns: columns,
                  background: isSelected
                    ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                    : isOpen
                      ? 'color-mix(in srgb, var(--accent) 7%, transparent)'
                      : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => props.onToggle(entry)}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  aria-label={entry.name}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex min-w-0 items-center gap-2">
                  <Icon size={16} className="shrink-0" style={{ color: ICON_COLORS[kind] }} />
                  {renaming ? (
                    <InlineRename
                      entry={entry}
                      siblingNames={props.siblingNames}
                      onCommit={(name) => props.onRenameCommit(entry, name)}
                      onCancel={props.onRenameCancel}
                    />
                  ) : (
                    <span className="truncate text-[var(--text)]" title={entry.name}>
                      {entry.name}
                    </span>
                  )}
                </div>
                <span className="text-right text-xs text-[var(--muted)]">{entry.isDir ? '' : formatSize(entry.sizeBytes)}</span>
                {!compact && <span className="truncate text-xs text-[var(--muted)]">{formatDate(entry.modifiedMs)}</span>}
              </div>
            );
          })
        )}
        {props.totalCount > entries.length && (
          <div className="flex items-center justify-center gap-3 p-3 text-xs text-[var(--muted)]">
            <span>{t('files.showing', { shown: entries.length, total: props.totalCount })}</span>
            <Button variant="secondary" size="sm" onClick={props.onShowMore}>
              {t('files.showMore')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
