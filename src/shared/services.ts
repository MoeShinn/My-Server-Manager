// FILE: src/shared/services.ts
import type * as T from './types';
import type { Emit, Logger } from './ipc';
export interface EngineApi {
  list(): Promise<T.ServerSummary[]>;
  get(id: string): Promise<T.ServerConfig>;
  create(input: T.CreateServerInput): Promise<T.ServerConfig>; // downloads jar + Java, emits download:progress
  importFolder(folderPath: string, name: string, software: T.ServerSoftware, mcVersion: string | null): Promise<T.ServerConfig>; // copies the folder
  importJar(input: T.ImportJarInput): Promise<T.ServerConfig>; // copies the jar's whole folder into a new server folder
  inspectImport(jarPath: string): Promise<T.ImportPrefill>; // reads <jar folder>/.mcmanager/config.json to pre-fill the import dialog
  remove(id: string, deleteFiles: boolean): Promise<void>;
  setInfo(id: string, info: T.ServerInfoPatch): Promise<T.ServerConfig>; // name + description (MOTD); both accept § and & colour codes
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string, newName: string): Promise<T.ServerConfig>;
  updateSettings(id: string, patch: Partial<T.ServerSettings>): Promise<T.ServerConfig>;
  setStartOptions(id: string, start: T.StartOptions): Promise<T.ServerConfig>;
  suggestFlags(ramMb: number, javaMajor: number): Promise<T.JvmFlag[]>;
  exportStartScript(id: string): Promise<string>; // returns path of the written script
  start(id: string): Promise<void>; stop(id: string): Promise<void>; restart(id: string): Promise<void>; kill(id: string): Promise<void>;
  startAll(): Promise<void>; // sequential, never all at once
  stopAll(): Promise<void>;
  sendCommand(id: string, command: string): Promise<void>;
  getConsole(id: string): Promise<T.ConsoleLine[]>;
  acceptEula(id: string): Promise<void>;
  getProperties(id: string): Promise<Record<string, string>>;
  setProperties(id: string, patch: Record<string, string>): Promise<void>;
  getPlayers(id: string): Promise<T.PlayerEntry[]>; // all known players, online flag set
  getStats(id: string): Promise<T.ServerStats>;
  isPortFree(port: number): Promise<boolean>;
  suggestPort(): Promise<number>;
}
export interface EngineService extends EngineApi {
  getServerFolder(id: string): string;
  stopAllSequential(opts: { perServerTimeoutMs: number; onProgress: (p: T.QuitProgress) => void }): Promise<void>;
  runningServerIds(): string[];
  recoverOrphans(): Promise<void>;
  startAutoStartServers(): Promise<void>;
}
export interface ContentApi {
  listVersions(software: T.ServerSoftware, opts: { forceRefresh?: boolean }): Promise<T.VersionEntry[]>; // newest first, one build per mcVersion unless settings.showDuplicateBuilds
  getDefaultJava(mcVersion: string | null): Promise<number>;
  listJava(): Promise<T.JavaInstall[]>;
  installJava(major: number): Promise<void>;
  removeJava(major: number): Promise<void>;
  cancelDownload(taskId: string): Promise<void>;
  searchContent(q: T.ContentSearchQuery): Promise<T.ContentSearchResult>;
  listInstalledContent(serverId: string): Promise<T.ContentItem[]>;
  installContent(serverId: string, itemId: string): Promise<void>;
  removeContent(serverId: string, fileName: string): Promise<void>;
  playitStatus(): Promise<T.PlayitStatus>;
  playitStart(): Promise<void>;
  playitStop(): Promise<void>;
  playitReset(): Promise<void>; // forget the playit login (key file) so the user links the agent again
}
export interface ContentService extends ContentApi {
  getDataJson(opts?: { refresh?: boolean }): Promise<T.DataJson>; // remote data.json with local cache + bundled fallback
  getJavaExecutable(major: number): string | null;
  ensureJava(major: number, taskId: string): Promise<string>; // returns java.exe path, downloads if missing
  downloadServerJar(req: { software: T.ServerSoftware; mcVersion: string | null; build: string | null; destPath: string; taskId: string }): Promise<void>;
  shutdown(): Promise<void>; // stops playit agent etc.
}
export interface FilesApi {
  list(serverId: string, relDir: string): Promise<T.FileEntry[]>;
  readText(serverId: string, relPath: string): Promise<T.FileContent>;
  writeText(serverId: string, relPath: string, content: string): Promise<void>;
  createFile(serverId: string, relPath: string): Promise<void>;
  createFolder(serverId: string, relPath: string): Promise<void>;
  remove(serverId: string, relPaths: string[]): Promise<void>;
  move(serverId: string, relPaths: string[], destRelDir: string): Promise<void>;
  rename(serverId: string, items: { relPath: string; newName: string }[]): Promise<void>;
  reveal(serverId: string, relPath: string): Promise<void>; // open in system file manager
}
export type FilesService = FilesApi;
export interface LanguageApi {
  listInstalled(): Promise<T.LanguageInfo[]>;
  listRemote(refresh?: boolean): Promise<T.LanguageInfo[]>; // from data.json languages; refresh = download data.json again from GitHub
  install(code: string): Promise<void>; update(code: string): Promise<void>; remove(code: string): Promise<void>;
  installAll(): Promise<void>; updateAll(): Promise<void>; removeAll(): Promise<void>;
  getDictionary(code: string): Promise<Record<string, string>>; // already merged over English fallback
  openFolder(): Promise<void>;
}
export type LanguageService = LanguageApi;
export interface AppApi {
  getConfig(): Promise<T.AppConfig>;
  getSettings(): Promise<T.AppSettings>;
  updateSettings(patch: Partial<T.AppSettings>): Promise<T.AppSettings>;
  resetSettings(): Promise<T.AppSettings>;
  getPaths(): Promise<T.AppPaths>;
  getSystemInfo(): Promise<T.SystemInfo>;
  pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  openPath(absPath: string): Promise<void>; // only inside userData or dataDir
  checkUpdate(): Promise<T.UpdateState>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  confirmQuit(): Promise<void>; cancelQuit(): Promise<void>; forceQuit(): Promise<void>;
  respondClose(action: 'tray' | 'quit', remember: boolean): Promise<void>;
  uninstall(opts: { deleteAllData: boolean }): Promise<void>;
}
export interface ServiceDeps { paths: T.AppPaths; config: T.AppConfig; getSettings(): T.AppSettings; emit: Emit; log: Logger; }
