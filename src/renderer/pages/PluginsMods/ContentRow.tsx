// FILE: src/renderer/pages/PluginsMods/ContentRow.tsx
import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Box, Button, ProgressBar } from '@/components/ui';
import { useT } from '@/i18n';
import type { ContentItem } from '@shared/types';
import { authorColor, tileColor } from './colors';

export const MAX_DESC_CHARS = 120;

export function shortDescription(text: string): string {
  return text.length > MAX_DESC_CHARS ? `${text.slice(0, MAX_DESC_CHARS - 3)}...` : text;
}

interface Props {
  item: ContentItem;
  busy: 'install' | 'remove' | null;
  /** 0-100, or null when the size is unknown. Only used while installing. */
  progress: number | null;
  onInstall(item: ContentItem): void;
  onRemove(item: ContentItem): void;
}

export default function ContentRow({ item, busy, progress, onInstall, onRemove }: Props) {
  const t = useT();
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = item.iconUrl !== null && item.iconUrl !== '' && !iconFailed;
  const initial = (item.title.trim().charAt(0) || '?').toUpperCase();

  return (
    <Box>
      <div className="flex items-center gap-3">
        {showIcon ? (
          <img
            src={item.iconUrl ?? ''}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold"
            style={{ background: tileColor(item.title), color: 'var(--bg)' }}
          >
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--text)]">{item.title}</div>
          {item.description !== '' && (
            <div className="text-sm text-[var(--muted)]">{shortDescription(item.description)}</div>
          )}
          {item.author !== '' && (
            <div className="truncate text-xs font-medium" style={{ color: authorColor(item.author) }}>
              {item.author}
            </div>
          )}
          {busy === 'install' && (
            <div className="mt-2">
              <ProgressBar value={progress} />
            </div>
          )}
        </div>

        <div className="shrink-0">
          {item.installed ? (
            <Button
              variant="danger"
              size="sm"
              loading={busy === 'remove'}
              disabled={busy !== null || item.installedFile === null}
              icon={<Trash2 size={16} />}
              onClick={() => onRemove(item)}
            >
              {busy === 'remove' ? t('plugins.removing') : t('plugins.remove')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'install'}
              disabled={busy !== null}
              icon={<Download size={16} />}
              title={busy === 'install' ? t('plugins.installing') : t('plugins.install')}
              aria-label={busy === 'install' ? t('plugins.installing') : t('plugins.install')}
              onClick={() => onInstall(item)}
            />
          )}
        </div>
      </div>
    </Box>
  );
}
