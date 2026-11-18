import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

// Load Monaco from the local bundle instead of a CDN.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

// ---------- server.properties completions ----------

const BOOLEAN_KEYS = [
  'accepts-transfers', 'allow-flight', 'allow-nether', 'broadcast-console-to-ops', 'broadcast-rcon-to-ops',
  'enable-command-block', 'enable-jmx-monitoring', 'enable-query', 'enable-rcon', 'enable-status',
  'enforce-secure-profile', 'enforce-whitelist', 'force-gamemode', 'generate-structures', 'hardcore',
  'hide-online-players', 'log-ips', 'online-mode', 'prevent-proxy-connections', 'pvp', 'require-resource-pack',
  'spawn-monsters', 'sync-chunk-writes', 'use-native-transport', 'white-list',
];

const OTHER_KEYS = [
  'bug-report-link', 'difficulty', 'entity-broadcast-range-percentage', 'function-permission-level', 'gamemode',
  'generator-settings', 'initial-disabled-packs', 'initial-enabled-packs', 'level-name', 'level-seed', 'level-type',
  'max-chained-neighbor-updates', 'max-players', 'max-tick-time', 'max-world-size', 'motd',
  'network-compression-threshold', 'op-permission-level', 'pause-when-empty-seconds', 'player-idle-timeout',
  'query.port', 'rate-limit', 'rcon.password', 'rcon.port', 'region-file-compression', 'resource-pack',
  'resource-pack-id', 'resource-pack-prompt', 'resource-pack-sha1', 'server-ip', 'server-port',
  'simulation-distance', 'spawn-protection', 'text-filtering-config', 'view-distance',
];

const ALL_KEYS = [...BOOLEAN_KEYS, ...OTHER_KEYS].sort();
const BOOLEAN_SET = new Set(BOOLEAN_KEYS);

const ENUM_VALUES: Record<string, string[]> = {
  difficulty: ['peaceful', 'easy', 'normal', 'hard'],
  gamemode: ['survival', 'creative', 'adventure', 'spectator'],
  'level-type': ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'],
  'region-file-compression': ['deflate', 'lz4', 'none'],
};

let propertiesRegistered = false;

function registerPropertiesCompletion(): void {
  if (propertiesRegistered) return;
  propertiesRegistered = true;
  monaco.languages.registerCompletionItemProvider('ini', {
    triggerCharacters: ['=', '-', '.'],
    provideCompletionItems(model, position) {
      if (!model.uri.path.toLowerCase().endsWith('/server.properties')) return { suggestions: [] };
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const equalsIndex = before.indexOf('=');
      if (before.trimStart().startsWith('#')) return { suggestions: [] };

      if (equalsIndex === -1) {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: 1,
          endColumn: position.column,
        };
        return {
          suggestions: ALL_KEYS.map((key) => ({
            label: key,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: `${key}=`,
            filterText: key,
            range,
          })),
        };
      }

      const key = before.slice(0, equalsIndex).trim();
      const values = BOOLEAN_SET.has(key) ? ['true', 'false'] : ENUM_VALUES[key] ?? [];
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: equalsIndex + 2,
        endColumn: position.column,
      };
      return {
        suggestions: values.map((value) => ({
          label: value,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: value,
          range,
        })),
      };
    },
  });
}

registerPropertiesCompletion();

export { monaco };
