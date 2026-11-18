// FILE: src/main/services/content/java.ts
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import extractZip from 'extract-zip';
import { AppException } from '../../../shared/types';
import type { AppPaths, DataJson, JavaInstall } from '../../../shared/types';
import type { Logger } from '../../../shared/ipc';
import { compareMcVersion } from './compare';
import type { Downloader } from './download';
import { dirSizeBytes, pathExists, rmRetry } from './util';

const execFileAsync = promisify(execFile);
const JAVA_EXE = process.platform === 'win32' ? 'java.exe' : 'java';

/**
 * Picks the Java major for a Minecraft version from data.json.java (ascending milestones).
 * mcVersion null -> highest major. Older than every milestone -> the lowest milestone.
 */
export function pickJavaMajor(data: DataJson, mcVersion: string | null): number {
  const milestones = [...data.java].sort((a, b) => compareMcVersion(a.minMc, b.minMc));
  if (milestones.length === 0) throw new AppException('NOT_FOUND', 'data.json has no Java milestones');
  if (mcVersion === null) return Math.max(...milestones.map((m) => m.java));
  let chosen = milestones[0];
  for (const m of milestones) {
    if (compareMcVersion(m.minMc, mcVersion) <= 0) chosen = m;
  }
  return (chosen as DataJson['java'][number]).java;
}

async function findJavaHome(dir: string, depth: number): Promise<string | null> {
  if (await pathExists(path.join(dir, 'bin', JAVA_EXE))) return dir;
  if (depth <= 0) return null;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const found = await findJavaHome(path.join(dir, e.name), depth - 1);
    if (found) return found;
  }
  return null;
}

function checkMajor(major: number): void {
  if (!Number.isInteger(major) || major < 1 || major > 99) {
    throw new AppException('INVALID_INPUT', `Invalid Java version: ${major}`);
  }
}

export interface JavaManager {
  listJava(): Promise<JavaInstall[]>;
  installJava(major: number): Promise<void>;
  removeJava(major: number): Promise<void>;
  ensureJava(major: number, taskId: string): Promise<string>;
  getJavaExecutable(major: number): string | null;
}

export function createJavaManager(deps: {
  paths: AppPaths;
  downloader: Downloader;
  getDataJson(): Promise<DataJson>;
  log: Logger;
}): JavaManager {
  const { paths, downloader, getDataJson, log } = deps;
  const locks = new Map<number, Promise<void>>();

  const homeOf = (major: number): string => path.join(paths.javaDir, String(major));
  const exeOf = (major: number): string => path.join(homeOf(major), 'bin', JAVA_EXE);

  async function doInstall(major: number, taskId: string): Promise<void> {
    const data = await getDataJson();
    const entry = data.javaDownloads[String(major)];
    const pkg = process.platform === 'win32' ? entry?.windowsX64 : process.platform === 'linux' ? entry?.linuxX64 : null;
    if (!pkg) throw new AppException('NOT_FOUND', `No Java ${major} package for this system`, { major });

    const tmpRoot = path.join(paths.cacheDir, `java-${major}-${randomBytes(4).toString('hex')}`);
    const archivePath = path.join(tmpRoot, pkg.archive === 'zip' ? 'java.zip' : 'java.tar.gz');
    const extractDir = path.join(tmpRoot, 'x');
    try {
      await fsp.mkdir(extractDir, { recursive: true });
      await downloader.downloadFile({
        url: pkg.url,
        destPath: archivePath,
        taskId,
        label: `Java ${major}`,
        hash: pkg.sha256 ? { algo: 'sha256', value: pkg.sha256 } : undefined,
        allowAnyHttps: true // Java URLs come from data.json, which belongs to the app owner
      });

      try {
        if (pkg.archive === 'zip') await extractZip(archivePath, { dir: extractDir });
        else await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDir], { windowsHide: true });
      } catch (e) {
        log.error(`Could not extract Java ${major}:`, e);
        throw new AppException('DOWNLOAD_FAILED', `Could not extract Java ${major}`, { major });
      }

      const home = await findJavaHome(extractDir, 3);
      if (!home) throw new AppException('DOWNLOAD_FAILED', `Java ${major} archive has no bin/${JAVA_EXE}`, { major });

      await fsp.mkdir(paths.javaDir, { recursive: true });
      const target = homeOf(major);
      await rmRetry(target);
      try {
        await fsp.rename(home, target);
      } catch {
        // different drive: copy instead of move
        await fsp.cp(home, target, { recursive: true });
      }
      if (!(await pathExists(exeOf(major)))) {
        throw new AppException('DOWNLOAD_FAILED', `Java ${major} install is incomplete`, { major });
      }
    } finally {
      try {
        await rmRetry(tmpRoot);
      } catch {
        log.warn(`Could not clean temp folder ${tmpRoot}`);
      }
    }
  }

  /** Two callers for the same major share one download (lock per major). */
  function install(major: number, taskId: string): Promise<void> {
    checkMajor(major);
    const running = locks.get(major);
    if (running) return running;
    const job = (async () => {
      if (await pathExists(exeOf(major))) return;
      await doInstall(major, taskId);
    })().finally(() => locks.delete(major));
    locks.set(major, job);
    return job;
  }

  return {
    async listJava() {
      let names: string[];
      try {
        names = await fsp.readdir(paths.javaDir);
      } catch {
        return [];
      }
      const result: JavaInstall[] = [];
      for (const name of names) {
        if (!/^\d+$/.test(name)) continue;
        const major = Number(name);
        if (!(await pathExists(exeOf(major)))) continue;
        const bytes = await dirSizeBytes(homeOf(major));
        result.push({ major, path: exeOf(major), sizeMb: Math.round((bytes / (1024 * 1024)) * 10) / 10 });
      }
      return result.sort((a, b) => a.major - b.major);
    },

    installJava(major) {
      return install(major, `java-${major}`);
    },

    async removeJava(major) {
      checkMajor(major);
      try {
        await rmRetry(homeOf(major));
      } catch (e) {
        log.error(`Could not remove Java ${major}:`, e);
        throw new AppException('UNKNOWN', `Could not remove Java ${major} (files in use?)`, { major });
      }
    },

    async ensureJava(major, taskId) {
      checkMajor(major);
      if (!(await pathExists(exeOf(major)))) await install(major, taskId);
      return exeOf(major);
    },

    getJavaExecutable(major) {
      try {
        checkMajor(major);
      } catch {
        return null;
      }
      return existsSync(exeOf(major)) ? exeOf(major) : null;
    }
  };
}
