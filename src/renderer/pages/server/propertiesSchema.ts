// FILE: src/renderer/pages/server/propertiesSchema.ts

export type PropField =
  | { key: string; kind: 'text'; default: string }
  | { key: string; kind: 'bool'; default: boolean }
  | { key: string; kind: 'enum'; default: string; options: string[] }
  | { key: string; kind: 'number'; default: number; min?: number; max?: number };

export type PropGroupId = 'general' | 'world' | 'players' | 'network';

export interface PropGroup {
  id: PropGroupId;
  fields: PropField[];
}

export const PROPERTIES_SCHEMA: PropGroup[] = [
  {
    id: 'general',
    fields: [
      { key: 'motd', kind: 'text', default: 'A Minecraft Server' },
      { key: 'max-players', kind: 'number', default: 20, min: 1 },
      { key: 'gamemode', kind: 'enum', default: 'survival', options: ['survival', 'creative', 'adventure', 'spectator'] },
      { key: 'force-gamemode', kind: 'bool', default: false },
      { key: 'difficulty', kind: 'enum', default: 'easy', options: ['peaceful', 'easy', 'normal', 'hard'] },
      { key: 'hardcore', kind: 'bool', default: false },
      { key: 'pvp', kind: 'bool', default: true },
      { key: 'level-name', kind: 'text', default: 'world' },
      { key: 'level-seed', kind: 'text', default: '' }
    ]
  },
  {
    id: 'world',
    fields: [
      { key: 'generate-structures', kind: 'bool', default: true },
      { key: 'allow-nether', kind: 'bool', default: true },
      { key: 'spawn-monsters', kind: 'bool', default: true },
      { key: 'spawn-animals', kind: 'bool', default: true },
      { key: 'spawn-npcs', kind: 'bool', default: true },
      { key: 'spawn-protection', kind: 'number', default: 16, min: 0 },
      { key: 'view-distance', kind: 'number', default: 10, min: 3, max: 32 },
      { key: 'simulation-distance', kind: 'number', default: 10, min: 3, max: 32 },
      { key: 'max-world-size', kind: 'number', default: 29999984, min: 1 }
    ]
  },
  {
    id: 'players',
    fields: [
      { key: 'online-mode', kind: 'bool', default: true },
      { key: 'white-list', kind: 'bool', default: false },
      { key: 'enforce-whitelist', kind: 'bool', default: false },
      { key: 'allow-flight', kind: 'bool', default: false },
      { key: 'enable-command-block', kind: 'bool', default: false },
      { key: 'op-permission-level', kind: 'number', default: 4, min: 0, max: 4 },
      { key: 'player-idle-timeout', kind: 'number', default: 0, min: 0 }
    ]
  },
  {
    id: 'network',
    fields: [
      { key: 'server-port', kind: 'number', default: 25565, min: 1024, max: 65535 },
      { key: 'network-compression-threshold', kind: 'number', default: 256 },
      { key: 'enable-status', kind: 'bool', default: true },
      { key: 'hide-online-players', kind: 'bool', default: false }
    ]
  }
];

export const SCHEMA_KEYS: Set<string> = new Set(PROPERTIES_SCHEMA.flatMap((g) => g.fields.map((f) => f.key)));

/** Default value of a field as the raw string stored in server.properties. */
export function defaultAsString(f: PropField): string {
  if (f.kind === 'bool') return f.default ? 'true' : 'false';
  return String(f.default);
}

export type PropError = { key: string; params?: Record<string, string | number> } | null;

/** Returns an error key (srv.props.error.*) or null when the raw value is valid. */
export function validateProp(f: PropField, raw: string): PropError {
  if (/[\r\n]/.test(raw)) return { key: 'srv.props.error.newline' };
  if (f.kind === 'number') {
    if (!/^-?\d+$/.test(raw.trim())) return { key: 'srv.props.error.integer' };
    const n = Number(raw.trim());
    if (f.min !== undefined && n < f.min) return { key: 'srv.props.error.min', params: { min: f.min } };
    if (f.max !== undefined && n > f.max) return { key: 'srv.props.error.max', params: { max: f.max } };
  }
  return null;
}
