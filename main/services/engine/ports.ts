// FILE: src/main/services/engine/ports.ts
import * as net from 'net';
import { AppException } from '../../../shared/types';
import type { ServerConfig } from '../../../shared/types';
import { DEFAULT_PORT } from '../../../shared/constants';

/** Try to listen on the port and close right away. */
export function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen({ port, host: '0.0.0.0', exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

export const usedByApp = (configs: ServerConfig[], port: number, exceptId?: string): boolean =>
  configs.some((c) => c.id !== exceptId && c.settings.port === port);

export async function isPortFree(configs: ServerConfig[], port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  if (usedByApp(configs, port)) return false;
  return canBind(port);
}

export async function suggestPort(configs: ServerConfig[], from = DEFAULT_PORT): Promise<number> {
  for (let p = from; p <= 65535; p++) {
    if (await isPortFree(configs, p)) return p;
  }
  throw new AppException('PORT_IN_USE', 'No free port found');
}
