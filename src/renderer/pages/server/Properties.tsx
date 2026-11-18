// FILE: src/renderer/pages/server/Properties.tsx
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { useT } from '@/i18n';
import { Box, Button, Select, Spinner, TextInput, Toggle, useToast } from '@/components/ui';
import { useErrorToast, useServerConfig, useServerStatus } from './hooks';
import { apiErrorInfo, normalizeSearch } from './utils';
import { PROPERTIES_SCHEMA, SCHEMA_KEYS, defaultAsString, validateProp } from './propertiesSchema';
import type { PropField } from './propertiesSchema';

export default function Properties(): JSX.Element {
  const t = useT();
  const { id = '' } = useParams<{ id: string }>();
  const toast = useToast();
  const toastError = useErrorToast();
  const { config, error: configError } = useServerConfig(id);
  const status = useServerStatus(id);

  const [original, setOriginal] = useState<Record<string, string> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const isVelocity = config?.software === 'velocity';

  const load = async (): Promise<void> => {
    try {
      const props = await window.api.servers.getProperties(id);
      setOriginal(props);
      setEdits({});
    } catch (e) {
      setOriginal((prev) => prev ?? {});
      toastError(e);
    }
  };

  useEffect(() => {
    if (!config || isVelocity) return;
    setOriginal(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, config?.id, isVelocity]);

  const otherKeys = useMemo(
    () => (original ? Object.keys(original).filter((k) => !SCHEMA_KEYS.has(k)).sort((a, b) => a.localeCompare(b)) : []),
    [original]
  );

  if (!config) {
    if (configError) return <div style={{ padding: 24, color: 'var(--danger)' }}>{t('errors.' + apiErrorInfo(configError).code)}</div>;
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (isVelocity) {
    return (
      <Box title={t('srv.props.title')}>
        <div style={{ color: 'var(--muted)' }}>{t('srv.props.notAvailable')}</div>
      </Box>
    );
  }

  if (original === null) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const running = status === 'running' || status === 'starting' || status === 'stopping';
  const noFile = Object.keys(original).length === 0;

  /** Value the file would have right now for a schema key (loaded value, or the default when missing). */
  const loadedValue = (key: string, def?: string): string => original[key] ?? def ?? '';
  const currentValue = (key: string, def?: string): string => (key in edits ? edits[key] : loadedValue(key, def));

  const setValue = (key: string, value: string, def?: string): void => {
    setEdits((prev) => {
      const next = { ...prev };
      if (value === loadedValue(key, def)) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const fieldError = (f: PropField): { key: string; params?: Record<string, string | number> } | null =>
    f.key in edits ? validateProp(f, edits[f.key]) : null;

  const otherError = (key: string): boolean => key in edits && /[\r\n]/.test(edits[key]);

  const hasError =
    PROPERTIES_SCHEMA.some((g) => g.fields.some((f) => fieldError(f) !== null)) || otherKeys.some(otherError);
  const changedKeys = Object.keys(edits);
  const dirty = changedKeys.length > 0;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      for (const k of changedKeys) patch[k] = edits[k];
      await window.api.servers.setProperties(id, patch);
      toast.success(t('srv.props.saved'));
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: PropField): JSX.Element => {
    const def = defaultAsString(f);
    const value = currentValue(f.key, def);
    const err = fieldError(f);
    const label = t(`srv.props.field.${f.key}`);
    const descKey = `srv.props.field.${f.key}.desc`;
    const desc = t(descKey);
    let control: JSX.Element;
    if (f.kind === 'bool') {
      control = (
        <Toggle
          checked={value.toLowerCase() === 'true'}
          onChange={(v) => setValue(f.key, v ? 'true' : 'false', def)}
        />
      );
    } else if (f.kind === 'enum') {
      const options = f.options.map((o) => ({ value: o, label: t(`srv.props.enum.${o}`) }));
      if (!f.options.includes(value)) options.push({ value, label: value });
      control = <Select value={value} options={options} onChange={(v) => setValue(f.key, v, def)} />;
    } else if (f.kind === 'number') {
      control = <TextInput type="number" value={value} onChange={(v) => setValue(f.key, v, def)} />;
    } else {
      control = <TextInput value={value} onChange={(v) => setValue(f.key, v, def)} />;
    }
    return (
      <div
        key={f.key}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) minmax(200px, 1.2fr)',
          gap: 12,
          alignItems: 'start',
          padding: '8px 0',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
          <code style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{f.key}</code>
          {desc !== descKey ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{desc}</div> : null}
          {f.key === 'server-port' ? (
            <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 2 }}>{t('srv.props.portNote')}</div>
          ) : null}
        </div>
        <div>
          <div style={f.kind === 'bool' ? { display: 'flex', alignItems: 'center', minHeight: 32 } : undefined}>{control}</div>
          {err ? <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{t(err.key, err.params)}</div> : null}
        </div>
      </div>
    );
  };

  const q = normalizeSearch(search.trim());
  const shownOthers = q ? otherKeys.filter((k) => normalizeSearch(k).includes(q)) : otherKeys;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      <Box
        title={t('srv.props.title')}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dirty ? <span style={{ fontSize: 12, color: 'var(--warning)' }}>{t('srv.props.unsaved', { count: changedKeys.length })}</span> : null}
            <Button variant="ghost" size="sm" icon={<Undo2 size={14} />} disabled={!dirty || saving} onClick={() => setEdits({})}>
              {t('srv.props.undo')}
            </Button>
            <Button variant="primary" size="sm" loading={saving} disabled={!dirty || hasError || saving} onClick={() => void save()}>
              {t('srv.dash.save')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {noFile ? <div style={{ fontSize: 13, color: 'var(--warning)' }}>{t('srv.props.noFile')}</div> : null}
          {running ? <div style={{ fontSize: 12, color: 'var(--warning)' }}>{t('srv.props.restartNeeded')}</div> : null}
        </div>
      </Box>

      {PROPERTIES_SCHEMA.map((g) => (
        <Box key={g.id} title={t(`srv.props.group.${g.id}`)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>{g.fields.map(renderField)}</div>
        </Box>
      ))}

      <Box title={t('srv.props.group.other')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <TextInput value={search} onChange={setSearch} placeholder={t('srv.props.searchOther')} />
          {otherKeys.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.props.noOther')}</div>
          ) : shownOthers.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.props.noOtherResults')}</div>
          ) : (
            shownOthers.map((k) => (
              <div
                key={k}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 1fr) minmax(200px, 1.2fr)',
                  gap: 12,
                  alignItems: 'start',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border)'
                }}
              >
                <code style={{ fontFamily: 'monospace', fontSize: 12.5, wordBreak: 'break-all', paddingTop: 6 }}>{k}</code>
                <div>
                  <TextInput value={currentValue(k)} onChange={(v) => setValue(k, v)} />
                  {otherError(k) ? <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{t('srv.props.error.newline')}</div> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Box>
    </div>
  );
}
