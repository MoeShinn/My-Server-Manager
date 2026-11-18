// FILE: src/main/services/content/index.ts
import { AppException } from '../../../shared/types';
import type { ServerSoftware } from '../../../shared/types';
import type { ContentService, ServiceDeps } from '../../../shared/services';
import { createDataJsonProvider } from './dataJson';
import { createDownloader } from './download';
import { createHttp } from './http';
import { createJavaManager, pickJavaMajor } from './java';
import { createModrinth } from './modrinth';
import { createPlayit } from './playit';
import { createVersions } from './versions';

const DISPLAY_NAMES: Record<ServerSoftware, string> = {
  vanilla: 'Vanilla',
  paper: 'Paper',
  purpur: 'Purpur',
  folia: 'Folia',
  leaf: 'Leaf',
  fabric: 'Fabric',
  velocity: 'Velocity',
  custom: 'Custom'
};

export function createContentService(deps: ServiceDeps): ContentService {
  const { paths, config, getSettings, emit, log } = deps;

  const http = createHttp({ userAgent: config.userAgent, log });
  const downloader = createDownloader({ userAgent: config.userAgent, emit, log });
  const getDataJson = createDataJsonProvider({ paths, config, getSettings, http, log });
  const java = createJavaManager({ paths, downloader, getDataJson, log });
  const versions = createVersions({ paths, getSettings, http, log });
  const modrinth = createModrinth({ paths, http, downloader, getDataJson, log });
  const playit = createPlayit({ paths, http, downloader, emit, log });

  return {
    listVersions: (software, opts) => versions.listVersions(software, opts),

    async getDefaultJava(mcVersion) {
      return pickJavaMajor(await getDataJson(), mcVersion);
    },

    listJava: () => java.listJava(),
    installJava: (major) => java.installJava(major),
    removeJava: (major) => java.removeJava(major),

    async cancelDownload(taskId) {
      downloader.cancelDownload(taskId);
    },

    searchContent: (q) => modrinth.searchContent(q),
    listInstalledContent: (serverId) => modrinth.listInstalledContent(serverId),
    installContent: (serverId, itemId) => modrinth.installContent(serverId, itemId),
    removeContent: (serverId, fileName) => modrinth.removeContent(serverId, fileName),

    playitStatus: () => playit.status(),
    playitStart: () => playit.start(),
    playitStop: () => playit.stop(),

    // ---- internal (not exposed to the renderer) ----
    getDataJson,
    getJavaExecutable: (major) => java.getJavaExecutable(major),
    ensureJava: (major, taskId) => java.ensureJava(major, taskId),

    async downloadServerJar(req) {
      if (req.software === 'custom') {
        throw new AppException('INVALID_INPUT', 'Custom servers have no download source');
      }
      if (!req.mcVersion) {
        throw new AppException('INVALID_INPUT', 'A Minecraft version is required');
      }
      const jar = await versions.resolveJar(req.software, req.mcVersion, req.build);
      await downloader.downloadFile({
        url: jar.url,
        destPath: req.destPath,
        taskId: req.taskId,
        label: `${DISPLAY_NAMES[req.software]} ${req.mcVersion}`,
        hash: jar.hash
      });
    },

    shutdown: () => playit.shutdown()
  };
}
