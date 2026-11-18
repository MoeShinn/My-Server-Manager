import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { FolderOpen, Save, WrapText, X } from 'lucide-react';
import { Button, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import './monacoSetup';
import { readApiError } from './errorUtils';
import { monacoLanguageOf, tabSizeOf } from './fileUtils';
import { useAppTheme } from './useAppTheme';

interface FileEditorProps {
  serverId: string;
  relPath: string;
  name: string;
  onDirtyChange(dirty: boolean): void;
  onRequestClose(): void;
  onRevealFolder(): void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'cannot'; reason: 'binary' | 'tooLarge' }
  | { kind: 'ready'; initial: string };

export default function FileEditor({ serverId, relPath, name, onDirtyChange, onRequestClose, onRevealFolder }: FileEditorProps) {
  const t = useT();
  const toast = useToast();
  const theme = useAppTheme();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wrap, setWrap] = useState(false);
  const contentRef = useRef('');
  const savedRef = useRef('');
  const saveRef = useRef<() => void>(() => undefined);
  const dirtyRef = useRef(false);

  const updateDirty = useCallback(
    (value: boolean) => {
      if (dirtyRef.current === value) return;
      dirtyRef.current = value;
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );

  // Load the file once per mount (Files.tsx remounts this component with a new key per file).
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    window.api.files
      .readText(serverId, relPath)
      .then((result) => {
        if (cancelled) return;
        if (result.binary) setState({ kind: 'cannot', reason: 'binary' });
        else if (result.tooLarge) setState({ kind: 'cannot', reason: 'tooLarge' });
        else {
          contentRef.current = result.content;
          savedRef.current = result.content;
          setState({ kind: 'ready', initial: result.content });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const info = readApiError(error);
        toast.error(t('errors.' + info.code, info.params));
        setState({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
      if (dirtyRef.current) onDirtyChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, relPath]);

  const save = useCallback(async () => {
    if (saving) return;
    const content = contentRef.current;
    setSaving(true);
    try {
      await window.api.files.writeText(serverId, relPath, content);
      savedRef.current = content;
      updateDirty(contentRef.current !== savedRef.current);
      toast.success(t('files.editor.saved'));
    } catch (error) {
      const info = readApiError(error);
      toast.error(t('errors.' + info.code, info.params));
    } finally {
      setSaving(false);
    }
  }, [saving, serverId, relPath, t, toast, updateDirty]);

  saveRef.current = () => {
    void save();
  };

  const handleMount: OnMount = (editor, monacoApi) => {
    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => saveRef.current());
  };

  const language = monacoLanguageOf(name);
  const modelPath = `file:///${serverId}/${relPath.split('/').map(encodeURIComponent).join('/')}`;

  function renderBody() {
    if (state.kind === 'loading') {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      );
    }
    if (state.kind === 'failed') {
      return <div className="p-4 text-sm text-[var(--muted)]">{t('files.editor.loadFailed')}</div>;
    }
    if (state.kind === 'cannot') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-sm text-sm text-[var(--muted)]">
            {state.reason === 'binary' ? t('files.cannotOpen.binary') : t('files.cannotOpen.tooLarge')}
          </p>
          <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={onRevealFolder}>
            {t('files.openFolder')}
          </Button>
        </div>
      );
    }
    return (
      <Editor
        height="100%"
        path={modelPath}
        language={language}
        defaultValue={state.initial}
        theme={theme === 'dark' ? 'vs-dark' : 'vs'}
        loading={<Spinner />}
        onMount={handleMount}
        onChange={(value) => {
          contentRef.current = value ?? '';
          updateDirty(contentRef.current !== savedRef.current);
        }}
        options={{
          automaticLayout: true,
          autoIndent: 'full',
          quickSuggestions: { other: true, comments: false, strings: true },
          wordBasedSuggestions: 'currentDocument',
          suggestOnTriggerCharacters: true,
          bracketPairColorization: { enabled: true },
          tabSize: tabSizeOf(language),
          insertSpaces: true,
          wordWrap: wrap ? 'on' : 'off',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          renderWhitespace: 'selection',
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="truncate text-sm font-medium text-[var(--text)]" title={relPath}>
          {name}
        </span>
        {dirty && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--warning)]"
            title={t('files.editor.unsaved')}
            aria-label={t('files.editor.unsaved')}
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<WrapText size={14} />}
            onClick={() => setWrap((value) => !value)}
            title={t('files.editor.wrap')}
            aria-pressed={wrap}
          >
            {wrap ? t('files.editor.wrapOn') : t('files.editor.wrapOff')}
          </Button>
          <Button variant="ghost" size="sm" icon={<FolderOpen size={14} />} onClick={onRevealFolder} title={t('files.editor.revealFolder')} />
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            loading={saving}
            disabled={state.kind !== 'ready' || !dirty}
            onClick={() => void save()}
            title="Ctrl+S"
          >
            {t('files.editor.save')}
          </Button>
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onRequestClose} title={t('files.editor.close')} />
        </div>
      </div>
      <div className="min-h-0 flex-1">{renderBody()}</div>
    </div>
  );
}
