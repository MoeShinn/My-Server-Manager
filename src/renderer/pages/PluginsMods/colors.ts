// FILE: src/renderer/pages/PluginsMods/colors.ts
// Fixed palette of ~10 bright colors that read well on a dark background.
// Hard-coded on purpose (allowed for the author-name palette only).
const AUTHOR_PALETTE = [
  '#7dd3fc', '#86efac', '#fde68a', '#fca5a5', '#c4b5fd',
  '#f9a8d4', '#fdba74', '#5eead4', '#a5b4fc', '#bef264'
];

function hashString(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Same author name always gives the same color. */
export function authorColor(author: string): string {
  return AUTHOR_PALETTE[hashString(author.trim().toLowerCase()) % AUTHOR_PALETTE.length] as string;
}

/** Background color for the fallback letter tile. */
export function tileColor(title: string): string {
  return AUTHOR_PALETTE[hashString(title.trim().toLowerCase()) % AUTHOR_PALETTE.length] as string;
}
