export function formatMb(sizeMb: number): string {
  if (sizeMb >= 1024) return `${(sizeMb / 1024).toFixed(1)} GB`;
  return `${Math.round(sizeMb)} MB`;
}
