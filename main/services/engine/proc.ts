// FILE: src/main/services/engine/proc.ts
import { execFile } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { SERVER_META_DIR } from '../../../shared/constants';
import { isErrno, readTextIfExists, writeFileAtomic } from './util';

export interface RunInfo { pid: number; startedAt: number; javaPath: string; }

const runFile = (folder: string): string => path.join(folder, SERVER_META_DIR, 'run.json');

export async function writeRunFile(folder: string, info: RunInfo): Promise<void> {
  await writeFileAtomic(runFile(folder), JSON.stringify(info));
}
export async function removeRunFile(folder: string): Promise<void> {
  await fs.rm(runFile(folder), { force: true }).catch(() => undefined);
}
export async function readRunFile(folder: string): Promise<RunInfo | null> {
  const text = await readTextIfExists(runFile(folder));
  if (text === null) return null;
  try {
    const d = JSON.parse(text) as Partial<RunInfo>;
    if (typeof d.pid === 'number' && Number.isInteger(d.pid) && d.pid > 0) {
      return { pid: d.pid, startedAt: typeof d.startedAt === 'number' ? d.startedAt : Date.now(), javaPath: typeof d.javaPath === 'string' ? d.javaPath : '' };
    }
  } catch { /* fall through */ }
  return null;
}

export function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return isErrno(e) && e.code === 'EPERM'; }
}

export function isJavaProcess(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (err: Error | null, out: string): void => resolve(!err && /java/i.test(out));
    if (process.platform === 'win32') {
      execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, out) => done(err, String(out)));
    } else {
      execFile('ps', ['-p', String(pid), '-o', 'comm='], (err, out) => done(err, String(out)));
    }
  });
}

/** Kill a process tree. force=false asks nicely first (SIGTERM / taskkill without /F). */
export function killTree(pid: number, force: boolean): Promise<void> {
  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])];
    return new Promise((resolve) => { execFile('taskkill', args, { windowsHide: true }, () => resolve()); });
  }
  try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* already gone */ }
  return Promise.resolve();
}
