// FILE: src/shared/constants.ts
import type { ServerSoftware, ModKind } from './types';
export const DEFAULT_PORT = 25565;
export const DEFAULT_RAM_MB = 2048;
export const DEFAULT_STORAGE_LIMIT_MB = 10240;
export const STOP_TIMEOUT_MS = 60000;
export const CONSOLE_MAX_LINES = 3000;
export const SERVER_META_DIR = '.mcmanager';
export const MOD_KIND_BY_SOFTWARE: Record<ServerSoftware, ModKind> = { vanilla: 'none', paper: 'plugin', purpur: 'plugin', folia: 'plugin', leaf: 'plugin', velocity: 'plugin', fabric: 'mod', custom: 'plugin' };
// Methods that exist on a *Service object but must NOT be exposed to the renderer.
export const INTERNAL_METHODS = ['getServerFolder', 'stopAllSequential', 'runningServerIds', 'recoverOrphans', 'startAutoStartServers', 'getDataJson', 'getJavaExecutable', 'ensureJava', 'downloadServerJar', 'shutdown'] as const;
