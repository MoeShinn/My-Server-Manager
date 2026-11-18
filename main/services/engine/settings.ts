// FILE: src/main/services/engine/settings.ts
import * as os from 'os';
import { AppException } from '../../../shared/types';

export const totalRamMb = (): number => Math.floor(os.totalmem() / 1048576);

export function validateName(v: unknown): string {
  if (typeof v !== 'string') throw new AppException('INVALID_INPUT', 'Name is required');
  const name = v.trim();
  if (!name || name.length > 100) throw new AppException('INVALID_INPUT', 'Invalid name');
  return name;
}

export function validateRam(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 512 || v > totalRamMb()) {
    throw new AppException('INVALID_INPUT', 'Invalid RAM amount', { max: totalRamMb() });
  }
  return v;
}

export function validateStorageLimit(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 512) throw new AppException('INVALID_INPUT', 'Invalid storage limit');
  return v;
}

export function validatePortNumber(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1024 || v > 65535) throw new AppException('INVALID_INPUT', 'Invalid port');
  return v;
}

export function validateJavaOverride(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 7 || v > 99) throw new AppException('INVALID_INPUT', 'Invalid Java version');
  return v;
}

export function validateIpHost(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new AppException('INVALID_INPUT', 'Invalid address');
  const s = v.trim();
  if (s === '') return null;
  if (s.length > 253 || /\s/.test(s)) throw new AppException('INVALID_INPUT', 'Invalid address');
  return s;
}
