// FILE: src/shared/types.ts
export type ServerSoftware = 'vanilla' | 'paper' | 'purpur' | 'folia' | 'leaf' | 'fabric' | 'velocity' | 'custom';
export type ModKind = 'plugin' | 'mod' | 'none';
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
export type ErrorCode = 'PORT_IN_USE' | 'EULA_NOT_ACCEPTED' | 'SERVER_RUNNING' | 'SERVER_NOT_RUNNING' | 'NOT_FOUND' | 'JAVA_MISSING' | 'DOWNLOAD_FAILED' | 'HASH_MISMATCH' | 'NETWORK' | 'PATH_OUTSIDE_SERVER' | 'STORAGE_LIMIT' | 'INVALID_INPUT' | 'CANCELLED' | 'UNKNOWN';
export class AppException extends Error {
  constructor(public code: ErrorCode, message: string = code, public params?: Record<string, string | number>) { super(message); }
}
export interface JvmFlag { id: string; value: string; enabled: boolean; }
export interface StartOptions { jarFile: string; flags: JvmFlag[]; }
export interface ServerSettings { ramMb: number; storageLimitMb: number | null; autoStart: boolean; autoRestartOnCrash: boolean; port: number; javaMajorOverride: number | null; customIpHost: string | null; }
export interface ServerConfig { id: string; name: string; description: string; software: ServerSoftware; modKind: ModKind; mcVersion: string | null; build: string | null; customJarName: string | null; folder: string; createdAt: number; settings: ServerSettings; start: StartOptions; }
export interface ServerSummary { id: string; name: string; description: string; software: ServerSoftware; modKind: ModKind; mcVersion: string | null; build: string | null; customJarName: string | null; status: ServerStatus; playersOnline: number; playersMax: number; port: number; }
export interface CreateServerInput { name: string; description?: string; software: ServerSoftware; modKind: ModKind; mcVersion: string | null; build: string | null; customJarPath: string | null; eulaAccepted: boolean; settings: Partial<ServerSettings> & { ramMb: number }; }
/** Import a single server .jar: the app makes a fresh server folder and copies the jar into it. */
export interface ImportJarInput { jarPath: string; name: string; description: string | null; software: ServerSoftware; mcVersion: string | null; build: string | null; }
export interface ServerInfoPatch { name: string; description: string; }
export interface ConsoleLine { ts: number; level: 'info' | 'warn' | 'error' | 'command' | 'system'; text: string; textKey?: string; params?: Record<string, string | number>; }
export interface ServerStats { cpuPercent: number; ramUsedMb: number; diskUsedMb: number; uptimeSec: number; /** Ticks per second (0-20). null = unknown / not supported by this server software. */ tps: number | null; }
export interface PlayerEntry { name: string; uuid: string | null; online: boolean; }
export interface SystemInfo { totalRamMb: number; freeRamMb: number; cpuCores: number; freeDiskMb: number; localIps: string[]; }
export interface VersionEntry { mcVersion: string; build: string | null; group: string; stable: boolean; } // group = major line like '1.21'
export interface JavaInstall { major: number; path: string; sizeMb: number; }
export interface ContentItem { id: string; title: string; description: string; author: string; iconUrl: string | null; pageUrl: string; installed: boolean; installedFile: string | null; }
export interface ContentSearchQuery { serverId: string; query: string; filters: { author?: string; title?: string; description?: string }; page: number; pageSize: number; }
export interface ContentSearchResult { items: ContentItem[]; total: number; }
export interface DownloadProgress { taskId: string; label: string; receivedBytes: number; totalBytes: number | null; state: 'running' | 'done' | 'error' | 'cancelled'; }
export interface PlayitStatus { state: 'not-installed' | 'stopped' | 'starting' | 'needs-claim' | 'running' | 'error' | 'unsupported'; claimUrl: string | null; }
export interface FileEntry { name: string; relPath: string; isDir: boolean; sizeBytes: number; modifiedMs: number; }
export interface FileContent { content: string; binary: boolean; tooLarge: boolean; }
export interface LanguageInfo { code: string; name: string; installed: boolean; updateAvailable: boolean; inUse: boolean; }
export interface QuitProgress { state: 'stopping' | 'timeout' | 'done'; servers: { id: string; name: string; state: 'waiting' | 'stopping' | 'stopped' | 'timeout' }[]; }
export interface UpdateState { state: 'none' | 'available' | 'downloading' | 'ready' | 'error'; version: string | null; percent: number | null; }
export interface AppConfig { appName: string; appId: string; appVersion: string; appRepo: string; dataRepo: string; dataBranch: string; languageFolder: string; defaultLanguage: string; windowMode: 'maximized' | 'normal'; windowWidth: number; windowHeight: number; privacyPolicyUrl: string; licenseUrl: string; appIcon: string; installerIcon: string; userAgent: string; }
export interface AppSettings { language: string; dataDir: string; theme: 'dark' | 'light'; closeAction: 'tray' | 'ask' | 'quit'; launchAtLogin: boolean; autoCheckUpdate: boolean; versionCacheDays: number; alwaysFetchFreshVersions: boolean; showDuplicateBuilds: boolean; trayNoticeShown: boolean; }
export interface AppPaths { userData: string; dataDir: string; serversDir: string; javaDir: string; cacheDir: string; languageDir: string; logsDir: string; resourcesDir: string; }
type JavaPkg = { url: string; sha256: string | null; archive: 'zip' | 'tar.gz' } | null;
export interface DataJson { schemaVersion: number; java: { minMc: string; java: number }[]; javaDownloads: Record<string, { windowsX64: JavaPkg; linuxX64: JavaPkg }>; pluginLoaders: Record<string, string[]>; languages: { code: string; name: string; file: string }[]; playitRules: PlayitRule[]; }
/** app: semver range of app versions ("1.0" = 1.0.x); agent: playit tag ("v0.17.1") or "unsupported". */
export interface PlayitRule { app: string; agent: string; }
