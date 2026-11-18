import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'
import type { Logger } from '@shared/ipc'

const KEEP_FILES = 7
const FILE_PATTERN = /^app-\d{4}-\d{2}-\d{2}\.log$/

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.stack ?? a.message
  return inspect(a, { depth: 4, breakLength: 160 })
}

function rotate(logsDir: string): void {
  try {
    const files = readdirSync(logsDir).filter((f) => FILE_PATTERN.test(f)).sort()
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_FILES))) {
      try {
        unlinkSync(join(logsDir, old))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function createLogger(logsDir: string): Logger {
  try {
    mkdirSync(logsDir, { recursive: true })
  } catch {
    /* console only */
  }
  let currentDay = ''

  function write(level: 'INFO' | 'WARN' | 'ERROR', args: unknown[]): void {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    const line = `[${now.toISOString()}] [${level}] ${args.map(formatArg).join(' ')}`
    if (level === 'ERROR') console.error(line)
    else if (level === 'WARN') console.warn(line)
    else console.log(line)
    try {
      if (day !== currentDay) {
        currentDay = day
        rotate(logsDir)
      }
      appendFileSync(join(logsDir, `app-${day}.log`), line + '\n', 'utf8')
    } catch {
      /* never crash because of logging */
    }
  }

  return {
    info: (...a) => write('INFO', a),
    warn: (...a) => write('WARN', a),
    error: (...a) => write('ERROR', a)
  }
}
