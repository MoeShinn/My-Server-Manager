// FILE: src/shared/ipc.ts
import type { ServerStatus, ConsoleLine, ServerStats, DownloadProgress, PlayitStatus, QuitProgress, UpdateState, AppPaths, AppConfig } from './types';
import type { EngineApi, ContentApi, FilesApi, LanguageApi, AppApi } from './services';
export type EventPayloads = {
  'servers:changed': null;
  'server:status': { id: string; status: ServerStatus; exitCode: number | null };
  'server:console': { id: string; line: ConsoleLine };
  'server:stats': { id: string; stats: ServerStats };
  'server:players': { id: string; online: string[]; max: number };
  'download:progress': DownloadProgress;
  'playit:status': PlayitStatus;
  'app:quit-requested': null;
  'app:close-requested': null;
  'app:quit-progress': QuitProgress;
  'app:update': UpdateState;
};
export type EventChannel = keyof EventPayloads;
export type Emit = <C extends EventChannel>(channel: C, payload: EventPayloads[C]) => void;
export interface Logger { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void; }
export interface Api { servers: EngineApi; content: ContentApi; files: FilesApi; language: LanguageApi; app: AppApi; on<C extends EventChannel>(channel: C, cb: (payload: EventPayloads[C]) => void): () => void; }
declare global { interface Window { api: Api } }
