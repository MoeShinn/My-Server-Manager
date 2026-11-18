// FILE: src/main/services/engine/console.ts
import { StringDecoder } from 'string_decoder';
import type { ConsoleLine } from '../../../shared/types';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');

// Matches "[12:00:00 INFO]" and "[12:00:00] [Server thread/INFO]".
const LEVEL_RE = /^\[\d{1,2}:\d{2}:\d{2}(?:\]|\s)[^:]*?\b(INFO|WARN|ERROR|FATAL)\b/;
export function detectLevel(text: string): 'info' | 'warn' | 'error' {
  const m = LEVEL_RE.exec(text);
  if (!m) return 'info';
  if (m[1] === 'WARN') return 'warn';
  return m[1] === 'INFO' ? 'info' : 'error';
}

export class ConsoleBuffer {
  private lines: ConsoleLine[] = [];
  constructor(private readonly max: number) {}
  push(line: ConsoleLine): void {
    this.lines.push(line);
    if (this.lines.length > this.max + 500) this.lines.splice(0, this.lines.length - this.max);
  }
  toArray(): ConsoleLine[] { return this.lines.slice(-this.max).map((l) => ({ ...l })); }
}

/** Splits byte chunks into lines, handling UTF-8 and lines cut between chunks. */
export class LineSplitter {
  private decoder = new StringDecoder('utf8');
  private rest = '';
  push(chunk: Buffer): string[] {
    const parts = (this.rest + this.decoder.write(chunk)).split(/\r?\n/);
    this.rest = parts.pop() ?? '';
    return parts;
  }
  flush(): string[] {
    const s = this.rest + this.decoder.end();
    this.rest = '';
    return s ? [s] : [];
  }
}
