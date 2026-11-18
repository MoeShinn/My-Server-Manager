// FILE: src/renderer/pages/server/components/ConsoleBox.tsx
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ArrowDown, Copy, Eraser } from 'lucide-react';
import type { ConsoleLine, ServerStatus } from '@shared/types';
import { CONSOLE_MAX_LINES } from '@shared/constants';
import { useT } from '@/i18n';
import { Box, Button } from '@/components/ui';
import { useCopy, useErrorToast } from '../hooks';
import { getCompletions, longestCommonPrefix } from '../consoleCommands';
import { stripMcColors } from '../utils';

const HISTORY_MAX = 100;
const FLUSH_MS = 100;

/** Command history per server and commands used in this session (module level: survives page changes). */
const histories = new Map<string, string[]>();
const usedCommands = new Set<string>();

interface Row {
  seq: number;
  line: ConsoleLine;
  /** Pre-computed clean text (not used for system lines that have a textKey). */
  text: string;
}

let rowSeq = 0;
function toRow(line: ConsoleLine): Row {
  return { seq: rowSeq++, line, text: stripMcColors(line.text) };
}

const baseLine: CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 };
const LEVEL_STYLE: Record<ConsoleLine['level'], CSSProperties> = {
  info: { color: 'var(--text)' },
  warn: { color: 'var(--warning)' },
  error: { color: 'var(--danger)' },
  command: { color: 'var(--accent)' },
  system: { color: 'var(--muted)', fontStyle: 'italic' }
};

const LineView = memo(function LineView({ text, level }: { text: string; level: ConsoleLine['level'] }): JSX.Element {
  return <div style={{ ...baseLine, ...LEVEL_STYLE[level] }}>{text}</div>;
});

interface Suggest {
  list: string[];
  start: number;
  /** -1 = list shown, no candidate applied yet. */
  index: number;
}

interface Props {
  serverId: string;
  status: ServerStatus | null;
}

export default function ConsoleBox({ serverId, status }: Props): JSX.Element {
  const t = useT();
  const toastError = useErrorToast();
  const copy = useCopy();

  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>([]);
  const dirtyRef = useRef(false);
  const outRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const [command, setCommand] = useState('');
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const histIdx = useRef(-1);
  const draftRef = useRef('');

  const running = status === 'running';

  // Console lines: initial load + live events, flushed to the UI at most every FLUSH_MS.
  useEffect(() => {
    let alive = true;
    let loaded = false;
    const early: Row[] = [];
    rowsRef.current = [];
    dirtyRef.current = false;
    setRows([]);
    stickRef.current = true;
    setShowJump(false);

    const push = (list: Row[]): void => {
      const arr = rowsRef.current;
      for (const r of list) arr.push(r);
      if (arr.length > CONSOLE_MAX_LINES) arr.splice(0, arr.length - CONSOLE_MAX_LINES);
      dirtyRef.current = true;
    };
    const keyOf = (l: ConsoleLine): string => `${l.ts}|${l.level}|${l.text}|${l.textKey ?? ''}`;

    const off = window.api.on('server:console', (p) => {
      if (p.id !== serverId) return;
      const row = toRow(p.line);
      if (loaded) push([row]);
      else early.push(row);
    });

    window.api.servers
      .getConsole(serverId)
      .then((lines) => {
        if (!alive) return;
        loaded = true;
        const tail = new Set(lines.slice(-50).map(keyOf));
        push([...lines.map(toRow), ...early.filter((r) => !tail.has(keyOf(r.line)))]);
      })
      .catch((e) => {
        if (!alive) return;
        loaded = true;
        push(early);
        toastError(e);
      });

    const timer = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        setRows(rowsRef.current.slice());
      }
    }, FLUSH_MS);

    return () => {
      alive = false;
      off();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  // Known player names, used for tab completion.
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      window.api.servers
        .getPlayers(serverId)
        .then((list) => {
          if (alive) setPlayers(list.map((p) => p.name));
        })
        .catch(() => undefined);
    };
    load();
    const off = window.api.on('server:players', (p) => {
      if (p.id === serverId) load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [serverId]);

  useLayoutEffect(() => {
    const el = outRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const onScroll = (): void => {
    const el = outRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  };

  const jumpToBottom = (): void => {
    const el = outRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  };

  const lineText = (r: Row): string =>
    r.line.level === 'system' && r.line.textKey ? stripMcColors(t(r.line.textKey, r.line.params)) : r.text;

  const clearView = (): void => {
    rowsRef.current = [];
    dirtyRef.current = false;
    setRows([]);
  };

  const copyAll = (): void => {
    void copy(rows.map(lineText).join('\n'));
  };

  const send = async (): Promise<void> => {
    const cmd = command.trim();
    if (!cmd || !running) return;
    const hist = histories.get(serverId) ?? [];
    if (hist[hist.length - 1] !== cmd) hist.push(cmd);
    if (hist.length > HISTORY_MAX) hist.splice(0, hist.length - HISTORY_MAX);
    histories.set(serverId, hist);
    histIdx.current = -1;
    draftRef.current = '';
    const word = cmd.replace(/^\//, '').split(/\s+/)[0];
    if (/^[A-Za-z0-9_:.\-]+$/.test(word)) usedCommands.add(word.toLowerCase());
    setCommand('');
    setSuggest(null);
    try {
      await window.api.servers.sendCommand(serverId, cmd);
    } catch (e) {
      toastError(e);
    }
  };

  const handleTab = (): void => {
    if (suggest && suggest.list.length > 0) {
      const next = (suggest.index + 1) % suggest.list.length;
      setCommand(command.slice(0, suggest.start) + suggest.list[next]);
      setSuggest({ ...suggest, index: next });
      return;
    }
    const res = getCompletions(command, { extraCommands: usedCommands, players });
    if (!res) return;
    if (res.candidates.length === 1) {
      setCommand(command.slice(0, res.start) + res.candidates[0] + ' ');
      return;
    }
    const common = longestCommonPrefix(res.candidates);
    const partial = command.slice(res.start);
    if (common.length > partial.length) setCommand(command.slice(0, res.start) + common);
    setSuggest({ list: res.candidates, start: res.start, index: -1 });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void send();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (running) handleTab();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const hist = histories.get(serverId) ?? [];
      if (hist.length === 0) return;
      e.preventDefault();
      if (e.key === 'ArrowUp') {
        if (histIdx.current === -1) {
          draftRef.current = command;
          histIdx.current = hist.length - 1;
        } else {
          histIdx.current = Math.max(0, histIdx.current - 1);
        }
        setCommand(hist[histIdx.current]);
      } else {
        if (histIdx.current === -1) return;
        histIdx.current += 1;
        if (histIdx.current >= hist.length) {
          histIdx.current = -1;
          setCommand(draftRef.current);
        } else {
          setCommand(hist[histIdx.current]);
        }
      }
      setSuggest(null);
    }
  };

  const applyChip = (value: string): void => {
    if (!suggest) return;
    setCommand(command.slice(0, suggest.start) + value + ' ');
    setSuggest(null);
    inputRef.current?.focus();
  };

  return (
    <Box
      title={t('srv.console.title')}
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="ghost" size="sm" icon={<Eraser size={14} />} onClick={clearView}>
            {t('srv.console.clear')}
          </Button>
          <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={copyAll}>
            {t('srv.console.copy')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 360 }}>
        <div style={{ position: 'relative' }}>
          <div
            ref={outRef}
            onScroll={onScroll}
            style={{
              height: 300,
              overflowY: 'auto',
              padding: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 12.5
            }}
          >
            {rows.map((r) => (
              <LineView key={r.seq} text={lineText(r)} level={r.line.level} />
            ))}
          </div>
          {showJump ? (
            <div style={{ position: 'absolute', right: 14, bottom: 10 }}>
              <Button variant="primary" size="sm" icon={<ArrowDown size={14} />} onClick={jumpToBottom}>
                {t('srv.console.jumpBottom')}
              </Button>
            </div>
          ) : null}
        </div>

        {suggest && suggest.list.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggest.list.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => applyChip(c)}
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: `1px solid ${i === suggest.index ? 'var(--accent)' : 'var(--border)'}`,
                  background: i === suggest.index ? 'var(--accent)' : 'transparent',
                  color: i === suggest.index ? 'var(--bg)' : 'var(--text)',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}

        <input
          ref={inputRef}
          value={command}
          disabled={!running}
          placeholder={running ? t('srv.console.placeholder') : t('srv.console.disabledHint')}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setCommand(e.target.value);
            setSuggest(null);
            histIdx.current = -1;
          }}
          onKeyDown={onKeyDown}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text)',
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 13,
            opacity: running ? 1 : 0.6,
            outline: 'none'
          }}
        />
      </div>
    </Box>
  );
}
