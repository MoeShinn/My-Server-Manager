// FILE: src/shared/mcText.ts
// Minecraft colour-code helpers shared by main and renderer. Pure functions, no imports.
// Both the section sign (§) and the ampersand (&) are accepted as the code prefix.

export const MC_COLORS: Record<string, string> = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', a: '#55FF55', b: '#55FFFF',
  c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF',
};

export interface McSegment {
  text: string;
  color: string | null; // #RRGGBB
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  obfuscated: boolean;
}

const PREFIX = /[§&]/;
const CODE_CHAR = /[0-9a-fk-orA-FK-OR]/;
const HEX = /[0-9a-fA-F]/;

/** Reads a colour/format code at position i (text[i] is the prefix). Returns the code and its length, or null. */
function readCode(text: string, i: number): { kind: 'color' | 'format' | 'reset' | 'hex'; value: string; length: number } | null {
  const next = text[i + 1];
  if (next === undefined) return null;
  // &#RRGGBB
  if (next === '#' && /^#[0-9a-fA-F]{6}/.test(text.slice(i + 1, i + 8))) {
    return { kind: 'hex', value: `#${text.slice(i + 2, i + 8)}`, length: 8 };
  }
  // §x§R§R§G§G§B§B (also &x&R&...)
  if ((next === 'x' || next === 'X') && text.length >= i + 14) {
    let hex = '';
    let ok = true;
    for (let k = 0; k < 6; k++) {
      const p = text[i + 2 + k * 2];
      const h = text[i + 3 + k * 2];
      if (p === undefined || h === undefined || !PREFIX.test(p) || !HEX.test(h)) { ok = false; break; }
      hex += h;
    }
    if (ok) return { kind: 'hex', value: `#${hex}`, length: 14 };
  }
  if (!CODE_CHAR.test(next)) return null;
  const c = next.toLowerCase();
  if (c === 'r') return { kind: 'reset', value: c, length: 2 };
  if (c in MC_COLORS) return { kind: 'color', value: c, length: 2 };
  return { kind: 'format', value: c, length: 2 }; // k l m n o
}

/** Splits text into styled segments. A colour code resets formatting (vanilla behaviour). */
export function parseMcText(text: string): McSegment[] {
  const out: McSegment[] = [];
  let st = { color: null as string | null, bold: false, italic: false, underline: false, strike: false, obfuscated: false };
  let buf = '';
  const flush = (): void => {
    if (buf !== '') out.push({ text: buf, ...st });
    buf = '';
  };
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (PREFIX.test(ch)) {
      const code = readCode(text, i);
      if (code) {
        flush();
        if (code.kind === 'reset') st = { color: null, bold: false, italic: false, underline: false, strike: false, obfuscated: false };
        else if (code.kind === 'color') st = { color: MC_COLORS[code.value], bold: false, italic: false, underline: false, strike: false, obfuscated: false };
        else if (code.kind === 'hex') st = { color: code.value.toUpperCase(), bold: false, italic: false, underline: false, strike: false, obfuscated: false };
        else {
          st = { ...st };
          if (code.value === 'l') st.bold = true;
          else if (code.value === 'o') st.italic = true;
          else if (code.value === 'n') st.underline = true;
          else if (code.value === 'm') st.strike = true;
          else if (code.value === 'k') st.obfuscated = true;
        }
        i += code.length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Removes every colour/format code, keeping the visible text. */
export function stripMcColors(text: string): string {
  return parseMcText(text).map((s) => s.text).join('');
}

/** Converts '&' codes into '§' codes (hex colours become §x§R§R§G§G§B§B). Invalid '&' stay as typed. */
export function toSectionCodes(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '&') {
      const code = readCode(text, i);
      if (code) {
        if (code.kind === 'hex') out += `§x${code.value.slice(1).split('').map((h) => `§${h.toLowerCase()}`).join('')}`;
        else out += `§${code.value}`;
        i += code.length;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Encodes a description for the `motd` key of server.properties (Java properties escapes, ASCII only). */
export function encodeMotd(description: string): string {
  const section = toSectionCodes(description);
  let out = '';
  for (const ch of section.replace(/\r\n?/g, '\n')) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp < 0x20 || cp > 0x7e) {
        if (cp > 0xffff) {
          const v = cp - 0x10000;
          out += `\\u${(0xd800 + (v >> 10)).toString(16).padStart(4, '0')}\\u${(0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0')}`;
        } else out += `\\u${cp.toString(16).padStart(4, '0')}`;
      } else out += ch;
    }
  }
  return out;
}

/** Reverses encodeMotd (also understands what vanilla Minecraft writes). */
export function decodeMotd(raw: string): string {
  return raw.replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_m, hex: string | undefined, c: string | undefined) => {
    if (hex !== undefined) return String.fromCharCode(Number.parseInt(hex, 16));
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '';
    return c ?? '';
  });
}

export const MAX_DESCRIPTION_LENGTH = 256;

/** Returns a cleaned description or null when it is not acceptable (too long or more than two lines). */
export function cleanDescription(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').replace(/\s+$/g, '');
  if (s.length > MAX_DESCRIPTION_LENGTH || s.split('\n').length > 2) return null;
  return s;
}
