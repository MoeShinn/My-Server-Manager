// FILE: src/renderer/pages/server/StartOptions.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FolderOpen, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { JvmFlag } from '@shared/types';
import { useT } from '@/i18n';
import { Box, Button, Select, Spinner, TextInput, Toggle, useToast } from '@/components/ui';
import { useErrorToast, useServerConfig, useServerStatus } from './hooks';
import { apiErrorInfo, dirOf } from './utils';

const JAVA_CHOICES = [7, 8, 11, 16, 17, 21, 25];
const MANUAL = '__manual__';

interface Draft {
  jarFile: string;
  flags: JvmFlag[];
  javaOverride: number | null;
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.jarFile === b.jarFile && a.javaOverride === b.javaOverride && JSON.stringify(a.flags) === JSON.stringify(b.flags);
}

function quoteIfNeeded(s: string): string {
  return /\s/.test(s) ? `"${s}"` : s;
}

export default function StartOptions(): JSX.Element {
  const t = useT();
  const { id = '' } = useParams<{ id: string }>();
  const toast = useToast();
  const toastError = useErrorToast();
  const { config, error, reload } = useServerConfig(id);
  const status = useServerStatus(id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const baseRef = useRef<Draft | null>(null);
  const [jars, setJars] = useState<string[]>([]);
  const [defaultJava, setDefaultJava] = useState<number | null>(null);
  const [manualJar, setManualJar] = useState(false);
  const [customFlag, setCustomFlag] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  // Sync the draft with the saved config, unless the user has unsaved edits.
  useEffect(() => {
    if (!config) return;
    const fresh: Draft = {
      jarFile: config.start.jarFile,
      flags: config.start.flags.map((f) => ({ ...f })),
      javaOverride: config.settings.javaMajorOverride
    };
    setDraft((prev) => (prev === null || (baseRef.current !== null && sameDraft(prev, baseRef.current)) ? fresh : prev));
    baseRef.current = fresh;
  }, [config]);

  // Jar files in the server root.
  useEffect(() => {
    let alive = true;
    window.api.files
      .list(id, '')
      .then((entries) => {
        if (alive) setJars(entries.filter((e) => !e.isDir && e.name.toLowerCase().endsWith('.jar')).map((e) => e.name).sort());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);

  const mcVersion = config?.mcVersion ?? null;
  useEffect(() => {
    let alive = true;
    window.api.content
      .getDefaultJava(mcVersion)
      .then((j) => {
        if (alive) setDefaultJava(j);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mcVersion]);

  const jarOptions = useMemo(() => {
    const names = new Set(jars);
    if (draft && draft.jarFile && !names.has(draft.jarFile)) names.add(draft.jarFile);
    return [...Array.from(names).map((n) => ({ value: n, label: n })), { value: MANUAL, label: t('srv.start.jarManual') }];
  }, [jars, draft, t]);

  if (!config || !draft) {
    if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>{t('errors.' + apiErrorInfo(error).code)}</div>;
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const base = baseRef.current ?? draft;
  const dirty = !sameDraft(draft, base);
  const running = status === 'running' || status === 'starting' || status === 'stopping';
  const ramMb = config.settings.ramMb;
  const appliedJava = draft.javaOverride ?? defaultJava;
  const isVelocity = config.software === 'velocity';

  const jarValid = draft.jarFile.toLowerCase().endsWith('.jar') && !/[\\/]/.test(draft.jarFile);
  const jarSelectValue = manualJar ? MANUAL : draft.jarFile;

  const javaOptions = [
    {
      value: 'default',
      label: defaultJava === null ? t('srv.start.javaDefaultPlain') : t('srv.start.javaDefault', { major: defaultJava })
    },
    ...JAVA_CHOICES.filter((j) => defaultJava === null || j >= defaultJava).map((j) => ({
      value: String(j),
      label: t('srv.start.javaVersion', { major: j })
    }))
  ];

  const updateFlag = (flagId: string, patch: Partial<JvmFlag>): void =>
    setDraft({ ...draft, flags: draft.flags.map((f) => (f.id === flagId ? { ...f, ...patch } : f)) });

  const customFlagTrim = customFlag.trim();
  let customFlagError: string | null = null;
  if (customFlagTrim.length > 0) {
    if (!customFlagTrim.startsWith('-')) customFlagError = 'srv.start.customFlagDash';
    else if (/\s/.test(customFlagTrim)) customFlagError = 'srv.start.customFlagSpaces';
    else if (draft.flags.some((f) => f.value === customFlagTrim)) customFlagError = 'srv.start.customFlagDuplicate';
  }

  const addCustomFlag = (): void => {
    if (customFlagTrim.length === 0 || customFlagError) return;
    const maxN = draft.flags.reduce((acc, f) => {
      const m = /^custom-(\d+)$/.exec(f.id);
      return m ? Math.max(acc, Number(m[1])) : acc;
    }, 0);
    setDraft({ ...draft, flags: [...draft.flags, { id: `custom-${maxN + 1}`, value: customFlagTrim, enabled: true }] });
    setCustomFlag('');
  };

  const suggest = async (): Promise<void> => {
    const major = appliedJava ?? 17;
    try {
      const flags = await window.api.servers.suggestFlags(ramMb, major);
      setDraft({ ...draft, flags });
    } catch (e) {
      toastError(e);
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await window.api.servers.setStartOptions(id, { jarFile: draft.jarFile, flags: draft.flags });
      if (draft.javaOverride !== base.javaOverride) {
        await window.api.servers.updateSettings(id, { javaMajorOverride: draft.javaOverride });
      }
      toast.success(t('srv.start.saved'));
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const exportScript = async (): Promise<void> => {
    setExporting(true);
    try {
      const path = await window.api.servers.exportStartScript(id);
      setExportedPath(path);
      toast.success(t('srv.start.exported', { path }));
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  const enabledFlags = draft.flags.filter((f) => f.enabled).map((f) => f.value);
  const preview = [
    'java',
    `-Xms${ramMb}M`,
    `-Xmx${ramMb}M`,
    ...enabledFlags,
    '-jar',
    quoteIfNeeded(draft.jarFile || '?'),
    ...(isVelocity ? [] : ['nogui'])
  ].join(' ');

  const sectionLabel = { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      <Box
        title={t('srv.start.title')}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dirty ? <span style={{ fontSize: 12, color: 'var(--warning)' }}>{t('srv.start.unsaved')}</span> : null}
            <Button variant="ghost" size="sm" icon={<Undo2 size={14} />} disabled={!dirty || saving} onClick={() => setDraft(base)}>
              {t('srv.start.undo')}
            </Button>
            <Button variant="primary" size="sm" loading={saving} disabled={!dirty || saving || !jarValid} onClick={() => void save()}>
              {t('srv.dash.save')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {running ? <div style={{ fontSize: 12, color: 'var(--warning)' }}>{t('srv.start.restartNeeded')}</div> : null}

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <span>
              <span style={{ color: 'var(--muted)' }}>{t('srv.start.ram')}: </span>
              {ramMb} MB
            </span>
            <span>
              <span style={{ color: 'var(--muted)' }}>{t('srv.start.javaApplied')}: </span>
              {appliedJava === null ? '...' : `Java ${appliedJava}`}
            </span>
          </div>

          <div>
            <div style={sectionLabel}>{t('srv.start.jarFile')}</div>
            <Select
              value={jarSelectValue}
              options={jarOptions}
              onChange={(v) => {
                if (v === MANUAL) {
                  setManualJar(true);
                } else {
                  setManualJar(false);
                  setDraft({ ...draft, jarFile: v });
                }
              }}
            />
            {manualJar ? (
              <div style={{ marginTop: 6 }}>
                <TextInput value={draft.jarFile} onChange={(v) => setDraft({ ...draft, jarFile: v.trim() })} placeholder="server.jar" />
              </div>
            ) : null}
            {!jarValid ? <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{t('srv.start.jarInvalid')}</div> : null}
          </div>

          <div>
            <div style={sectionLabel}>{t('srv.start.java')}</div>
            <Select
              value={draft.javaOverride === null ? 'default' : String(draft.javaOverride)}
              options={javaOptions}
              onChange={(v) => setDraft({ ...draft, javaOverride: v === 'default' ? null : Number(v) })}
            />
          </div>
        </div>
      </Box>

      <Box
        title={t('srv.start.flags')}
        actions={
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => void suggest()}>
            {t('srv.start.restoreSuggested')}
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.flags.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('srv.start.noFlags')}</div>
          ) : (
            draft.flags.map((f) => {
              const key = `srv.start.flag.${f.id}`;
              const desc = t(key);
              const known = desc !== key;
              const isCustom = f.id.startsWith('custom-');
              return (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <Toggle checked={f.enabled} onChange={(v) => updateFlag(f.id, { enabled: v })} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <code style={{ fontFamily: 'monospace', fontSize: 12.5, wordBreak: 'break-all' }}>{f.value}</code>
                    {known ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{desc}</div> : null}
                  </div>
                  {isCustom ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      aria-label={t('srv.start.removeFlag')}
                      onClick={() => setDraft({ ...draft, flags: draft.flags.filter((x) => x.id !== f.id) })}
                    />
                  ) : null}
                </div>
              );
            })
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={sectionLabel}>{t('srv.start.addCustomFlag')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <TextInput value={customFlag} onChange={setCustomFlag} placeholder="-Dexample=true" />
              </div>
              <Button variant="secondary" icon={<Plus size={14} />} disabled={customFlagTrim.length === 0 || customFlagError !== null} onClick={addCustomFlag}>
                {t('srv.start.add')}
              </Button>
            </div>
            {customFlagError ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>{t(customFlagError)}</span> : null}
          </div>
        </div>
      </Box>

      <Box title={t('srv.start.preview')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <pre
            style={{
              margin: 0,
              padding: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 12.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {preview}
          </pre>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" loading={exporting} disabled={exporting || dirty} onClick={() => void exportScript()}>
              {t('srv.start.exportScript')}
            </Button>
            {dirty ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('srv.start.saveFirst')}</span> : null}
          </div>
          {exportedPath ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>{t('srv.start.exportedTo')}:</span>
              <code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{exportedPath}</code>
              <Button
                variant="ghost"
                size="sm"
                icon={<FolderOpen size={14} />}
                onClick={() => void window.api.app.openPath(dirOf(exportedPath)).catch(toastError)}
              >
                {t('srv.start.openFolder')}
              </Button>
            </div>
          ) : null}
        </div>
      </Box>
    </div>
  );
}
