// FILE: src/renderer/pages/server/consoleCommands.ts

export const VANILLA_COMMANDS: string[] = [
  'advancement', 'attribute', 'ban', 'ban-ip', 'banlist', 'bossbar', 'clear', 'clone', 'damage', 'data',
  'datapack', 'defaultgamemode', 'deop', 'difficulty', 'effect', 'enchant', 'execute', 'experience', 'fill',
  'forceload', 'function', 'gamemode', 'gamerule', 'give', 'help', 'item', 'kick', 'kill', 'list', 'locate',
  'loot', 'me', 'msg', 'op', 'pardon', 'pardon-ip', 'particle', 'place', 'playsound', 'publish', 'random',
  'recipe', 'reload', 'return', 'ride', 'save-all', 'save-off', 'save-on', 'say', 'schedule', 'scoreboard',
  'seed', 'setblock', 'setidletimeout', 'setworldspawn', 'spawnpoint', 'spectate', 'spreadplayers', 'stop',
  'stopsound', 'summon', 'tag', 'team', 'teleport', 'tell', 'tellraw', 'time', 'title', 'tp', 'trigger', 'w',
  'weather', 'whitelist', 'worldborder', 'xp'
];

const SUBCOMMANDS: Record<string, string[]> = {
  whitelist: ['add', 'remove', 'list', 'on', 'off', 'reload'],
  gamemode: ['survival', 'creative', 'adventure', 'spectator'],
  difficulty: ['peaceful', 'easy', 'normal', 'hard'],
  time: ['set', 'add', 'query'],
  weather: ['clear', 'rain', 'thunder']
};

/** Commands whose given argument positions (1-based) take a player name. */
const PLAYER_ARGS: Record<string, number[]> = {
  op: [1],
  deop: [1],
  kick: [1],
  ban: [1],
  pardon: [1],
  tp: [1, 2],
  teleport: [1, 2],
  give: [1],
  msg: [1],
  tell: [1],
  w: [1],
  kill: [1],
  effect: [1],
  gamemode: [2]
};

export interface CompletionContext {
  extraCommands: Iterable<string>;
  players: string[];
}

export interface CompletionResult {
  /** Index in the input where the word being completed starts. */
  start: number;
  candidates: string[];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  const first = values[0];
  let len = first.length;
  for (const v of values) {
    let i = 0;
    const max = Math.min(len, v.length);
    while (i < max && first[i].toLowerCase() === v[i].toLowerCase()) i++;
    len = i;
    if (len === 0) break;
  }
  return first.slice(0, len);
}

/** Computes tab-completion candidates for the console input. Leading "/" is optional. */
export function getCompletions(input: string, ctx: CompletionContext): CompletionResult | null {
  const offset = input.startsWith('/') ? 1 : 0;
  const body = input.slice(offset);
  const tokens = body.split(' ');
  const partial = tokens[tokens.length - 1];
  const start = offset + body.length - partial.length;
  const lowerPartial = partial.toLowerCase();

  let pool: string[] = [];

  if (tokens.length === 1) {
    pool = [...VANILLA_COMMANDS, ...Array.from(ctx.extraCommands)];
  } else {
    const cmd = tokens[0].toLowerCase();
    const argIndex = tokens.length - 1; // 1-based index of the argument being typed
    const subs = SUBCOMMANDS[cmd];
    if (subs && argIndex === 1) pool = subs;
    if (cmd === 'whitelist' && argIndex === 2) {
      const sub = tokens[1].toLowerCase();
      if (sub === 'add' || sub === 'remove') pool = ctx.players;
    }
    const playerArgs = PLAYER_ARGS[cmd];
    if (playerArgs && playerArgs.includes(argIndex)) pool = ctx.players;
  }

  const candidates = uniqueSorted(pool.filter((c) => c.toLowerCase().startsWith(lowerPartial)));
  if (candidates.length === 0) return null;
  return { start, candidates };
}
