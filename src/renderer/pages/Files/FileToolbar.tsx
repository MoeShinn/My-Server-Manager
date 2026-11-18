import type { ReactNode } from 'react';
import { FilePlus, FolderInput, FolderOpen, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';

interface FileToolbarProps {
  selectedCount: number;
  loading: boolean;
  onDelete(): void;
  onMove(): void;
  onRename(): void;
  onReveal(): void;
  onNewFile(): void;
  onNewFolder(): void;
  onRefresh(): void;
}

interface ColorButtonProps {
  color: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick(): void;
}

/** A coloured toolbar button. When it is not active it turns pale, translucent and gray. */
function ColorButton({ color, label, icon, active, onClick }: ColorButtonProps) {
  return (
    <button
      type="button"
      disabled={!active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed"
      style={
        active
          ? {
              color,
              borderColor: color,
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              opacity: 1,
            }
          : {
              color: 'var(--muted)',
              borderColor: 'var(--border)',
              background: 'transparent',
              opacity: 0.4,
              filter: 'grayscale(1)',
            }
      }
    >
      {icon}
      {label}
    </button>
  );
}

export default function FileToolbar(props: FileToolbarProps) {
  const t = useT();
  const hasSelection = props.selectedCount > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ColorButton color="var(--danger)" label={t('files.toolbar.delete')} icon={<Trash2 size={14} />} active={hasSelection} onClick={props.onDelete} />
      <ColorButton color="var(--info, #60a5fa)" label={t('files.toolbar.move')} icon={<FolderInput size={14} />} active={hasSelection} onClick={props.onMove} />
      <ColorButton color="var(--warning)" label={t('files.toolbar.rename')} icon={<Pencil size={14} />} active={hasSelection} onClick={props.onRename} />
      <ColorButton color="var(--success)" label={t('files.toolbar.openFolder')} icon={<FolderOpen size={14} />} active onClick={props.onReveal} />
      <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
      <Button variant="secondary" size="sm" icon={<FilePlus size={14} />} onClick={props.onNewFile}>
        {t('files.toolbar.newFile')}
      </Button>
      <Button variant="secondary" size="sm" icon={<FolderPlus size={14} />} onClick={props.onNewFolder}>
        {t('files.toolbar.newFolder')}
      </Button>
      <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={props.loading} onClick={props.onRefresh}>
        {t('files.toolbar.refresh')}
      </Button>
    </div>
  );
}
