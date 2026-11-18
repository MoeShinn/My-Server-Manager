export interface ApiErrorInfo {
  code: string;
  params?: Record<string, string | number>;
}

/** Extracts the AppException fields that the preload bridge copies onto thrown errors. */
export function readApiError(error: unknown): ApiErrorInfo {
  if (typeof error === 'object' && error !== null) {
    const record = error as { code?: unknown; params?: unknown };
    const code = typeof record.code === 'string' ? record.code : 'UNKNOWN';
    const params =
      typeof record.params === 'object' && record.params !== null
        ? (record.params as Record<string, string | number>)
        : undefined;
    return { code, params };
  }
  return { code: 'UNKNOWN' };
}
