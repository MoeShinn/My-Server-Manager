// FILE: src/renderer/pages/server/components/VersionBadge.tsx
import type { ServerConfig } from '@shared/types';
import { useT } from '@/i18n';
import { Badge } from '@/components/ui';
import { groupOf, stripJarExt, versionColor } from '../utils';

type Props = Pick<ServerConfig, 'software' | 'mcVersion' | 'build' | 'customJarName'>;

export default function VersionBadge({ software, mcVersion, build, customJarName }: Props): JSX.Element {
  const t = useT();
  const isCustom = software === 'custom';
  const label = isCustom
    ? customJarName
      ? stripJarExt(customJarName)
      : t('srv.dash.customJar')
    : (mcVersion ?? '?');
  const background = isCustom ? 'var(--border)' : versionColor(groupOf(mcVersion));
  const color = isCustom ? 'var(--text)' : '#fff';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 8,
          background,
          color,
          fontSize: 12,
          fontWeight: 600,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
        title={label}
      >
        {label}
        {!isCustom && build ? <span style={{ opacity: 0.65, fontWeight: 400 }}>({build})</span> : null}
      </span>
      <Badge>{t(`srv.dash.software.${software}`)}</Badge>
    </span>
  );
}
