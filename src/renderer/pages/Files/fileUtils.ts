import { File as FileIcon, FileCog, FileImage, FileText, Folder, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileEntry } from '@shared/types';

export const PAGE_SIZE = 500;

const INVALID_NAME_CHARS = /[<>:"|?*\u0000-\u001f/\\]/;
const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** Mirrors the rules of the main-process service so errors show up before a request is sent. */
export function isValidFileName(name: string): boolean {
  if (name.length === 0 || name.length > 200) return false;
  if (name.trim() === '') return false;
  if (INVALID_NAME_CHARS.test(name)) return false;
  if (name.endsWith('.') || name.endsWith(' ')) return false;
  return !RESERVED_NAMES.has(name.split('.')[0].trim().toLowerCase());
}

export function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function parentOf(rel: string): string {
  const index = rel.lastIndexOf('/');
  return index === -1 ? '' : rel.slice(0, index);
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export type IconKind = 'folder' | 'jar' | 'config' | 'log' | 'image' | 'other';

const CONFIG_EXT = new Set(['yml', 'yaml', 'json', 'toml', 'properties']);
const LOG_EXT = new Set(['log', 'txt']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']);

export function iconKindOf(entry: FileEntry): IconKind {
  if (entry.isDir) return 'folder';
  const ext = extensionOf(entry.name);
  if (ext === 'jar') return 'jar';
  if (CONFIG_EXT.has(ext)) return 'config';
  if (LOG_EXT.has(ext)) return 'log';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'other';
}

// Theme variables come from P3. --info, --purple and --pink are optional, the fallback keeps them readable.
export const ICON_COLORS: Record<IconKind, string> = {
  folder: 'var(--warning)',
  jar: 'var(--purple, #a78bfa)',
  config: 'var(--info, #60a5fa)',
  log: 'var(--success)',
  image: 'var(--pink, #f472b6)',
  other: 'var(--muted)',
};

export const ICONS: Record<IconKind, LucideIcon> = {
  folder: Folder,
  jar: Package,
  config: FileCog,
  log: FileText,
  image: FileImage,
  other: FileIcon,
};

export function monacoLanguageOf(name: string): string {
  switch (extensionOf(name)) {
    case 'json':
    case 'mcmeta':
      return 'json';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'properties':
    case 'toml':
    case 'cfg':
    case 'conf':
    case 'ini':
      return 'ini';
    case 'xml':
      return 'xml';
    case 'md':
      return 'markdown';
    case 'sh':
      return 'shell';
    case 'bat':
    case 'cmd':
      return 'bat';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
      return 'typescript';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'java':
      return 'java';
    default:
      return 'plaintext';
  }
}

export function tabSizeOf(language: string): number {
  return language === 'yaml' || language === 'json' ? 2 : 4;
}

/** Length of the part of the name that should be selected first when renaming (without the extension). */
export function baseSelectionLength(entry: { name: string; isDir: boolean }): number {
  if (entry.isDir) return entry.name.length;
  const index = entry.name.lastIndexOf('.');
  return index <= 0 ? entry.name.length : index;
}
