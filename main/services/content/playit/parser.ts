// FILE: src/main/services/content/playit/parser.ts
// Reads the text the playit agent prints and decides what state it is in.
//
// !! WARNING: THE PARSER IS PARTLY A GUESS !!
// - The claim link format (https://playit.gg/claim/<code>) is stable and well known.
// - The "agent is connected" detection is a CAUTIOUS GUESS based on common words in the output
//   (running, connected, registered, ...). Newer agent versions draw a text UI and may print
//   different words. Check with the real agent and adjust CONNECTED_PATTERNS if needed.

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;

/** Words that suggest the agent is up. GUESS: verify with a real agent. */
const CONNECTED_PATTERNS: RegExp[] = [
  /\bagent\s+(?:is\s+)?(?:running|connected|started|ready)\b/i,
  /\btunnels?\s+(?:is\s+|are\s+)?(?:running|ready|connected)\b/i,
  /\bregistered\b/i,
  /\bconnected\b/i,
  /\brunning\b/i
];

/** Words that cancel a "connected" guess (e.g. "disconnected", "failed to connect"). */
const NEGATIVE_PATTERNS: RegExp[] = [/\bdis-?connected\b/i, /\bnot\s+connected\b/i, /\bfail(?:ed|ure)?\b/i, /\berror\b/i];

const CLAIM_RE = /https?:\/\/(?:www\.)?playit\.gg\/claim\/[^\s"'<>\])]+/i;

export interface PlayitParseResult {
  claimUrl: string | null;
  connected: boolean;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/** Looks at one chunk of output (any ANSI colors are removed first). */
export function parsePlayitOutput(chunk: string): PlayitParseResult {
  const text = stripAnsi(chunk);
  const claim = CLAIM_RE.exec(text);
  let connected = false;
  for (const line of text.split(/\r?\n/)) {
    if (NEGATIVE_PATTERNS.some((p) => p.test(line))) continue;
    if (CONNECTED_PATTERNS.some((p) => p.test(line))) {
      connected = true;
      break;
    }
  }
  return { claimUrl: claim ? claim[0] : null, connected };
}
