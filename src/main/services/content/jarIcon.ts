// FILE: src/main/services/content/jarIcon.ts
// Reads the icon that a plugin/mod ships inside its own .jar (a .jar is just a zip file).
// Only the few bytes that are needed are read, so this stays fast even for big jars.
// No extra dependency: a tiny zip reader built on node:fs and node:zlib.
import { promises as fsp } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { nativeImage } from 'electron';

const MAX_ENTRY_BYTES = 4 * 1024 * 1024; // refuse to read bigger entries (icons and manifests are tiny)
const MAX_CENTRAL_DIR_BYTES = 8 * 1024 * 1024;
const ICON_SIZE = 96; // px; the UI shows icons at 48px, this keeps them sharp on HiDPI screens

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

interface ZipIndex {
  byName: Map<string, ZipEntry>;
  /** lower-case name -> real name, for case-insensitive lookups */
  lower: Map<string, string>;
}

async function readAt(fh: fsp.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await fh.read(buf, done, length - done, position + done);
    if (bytesRead === 0) break;
    done += bytesRead;
  }
  return done === length ? buf : buf.subarray(0, done);
}

/** Reads the central directory of a zip. Returns null for anything unusual (zip64, broken file...). */
async function openZip(fh: fsp.FileHandle): Promise<ZipIndex | null> {
  const { size } = await fh.stat();
  if (size < 22) return null;

  const tailLen = Math.min(size, 22 + 0xffff);
  const tail = await readAt(fh, size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const total = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null; // zip64
  if (cdSize > MAX_CENTRAL_DIR_BYTES || cdOffset + cdSize > size) return null;

  const cd = await readAt(fh, cdOffset, cdSize);
  const byName = new Map<string, ZipEntry>();
  const lower = new Map<string, string>();
  let pos = 0;
  while (pos + 46 <= cd.length && cd.readUInt32LE(pos) === 0x02014b50) {
    const method = cd.readUInt16LE(pos + 10);
    const compSize = cd.readUInt32LE(pos + 20);
    const nameLen = cd.readUInt16LE(pos + 28);
    const extraLen = cd.readUInt16LE(pos + 30);
    const commentLen = cd.readUInt16LE(pos + 32);
    const localOffset = cd.readUInt32LE(pos + 42);
    const name = cd.toString('utf8', pos + 46, pos + 46 + nameLen);
    if (!name.endsWith('/')) {
      byName.set(name, { name, method, compSize, localOffset });
      lower.set(name.toLowerCase(), name);
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return { byName, lower };
}

function findEntry(zip: ZipIndex, rawName: string): ZipEntry | null {
  const name = rawName.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
  const exact = zip.byName.get(name);
  if (exact) return exact;
  const real = zip.lower.get(name.toLowerCase());
  return real ? (zip.byName.get(real) ?? null) : null;
}

async function readEntry(fh: fsp.FileHandle, entry: ZipEntry): Promise<Buffer | null> {
  if (entry.compSize > MAX_ENTRY_BYTES) return null;
  const header = await readAt(fh, entry.localOffset, 30);
  if (header.length < 30 || header.readUInt32LE(0) !== 0x04034b50) return null;
  const dataStart = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const raw = await readAt(fh, dataStart, entry.compSize);
  if (raw.length !== entry.compSize) return null;
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
  return null;
}

async function readText(fh: fsp.FileHandle, zip: ZipIndex, name: string): Promise<string | null> {
  const entry = findEntry(zip, name);
  if (!entry) return null;
  try {
    const buf = await readEntry(fh, entry);
    return buf ? buf.toString('utf8').replace(/^\uFEFF/, '') : null;
  } catch {
    return null;
  }
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fabric/Quilt "icon" is either a path or a { "128": "path", "32": "path" } map. Picks the biggest. */
function pickIconPath(icon: unknown): string | null {
  if (typeof icon === 'string' && icon.trim() !== '') return icon.trim();
  if (isObj(icon)) {
    let best: { size: number; path: string } | null = null;
    for (const [key, value] of Object.entries(icon)) {
      if (typeof value !== 'string' || value.trim() === '') continue;
      const size = Number(key);
      const s = Number.isFinite(size) ? size : 0;
      if (!best || s > best.size) best = { size: s, path: value.trim() };
    }
    return best ? best.path : null;
  }
  return null;
}

/** Collects candidate icon paths inside the jar, best guess first. */
async function candidatePaths(fh: fsp.FileHandle, zip: ZipIndex): Promise<string[]> {
  const out: string[] = [];
  const add = (p: string | null): void => {
    if (p && !out.includes(p)) out.push(p);
  };

  // Fabric
  const fabric = parseJson(await readText(fh, zip, 'fabric.mod.json'));
  if (isObj(fabric)) add(pickIconPath(fabric.icon));

  // Quilt
  const quilt = parseJson(await readText(fh, zip, 'quilt.mod.json'));
  if (isObj(quilt) && isObj(quilt.quilt_loader) && isObj(quilt.quilt_loader.metadata)) {
    add(pickIconPath(quilt.quilt_loader.metadata.icon));
  }

  // Forge / NeoForge (TOML): logoFile = "path.png"
  for (const toml of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
    const text = await readText(fh, zip, toml);
    const m = text ? /^\s*logoFile\s*=\s*["']([^"']+)["']/m.exec(text) : null;
    if (m) add(m[1] as string);
  }

  // Old Forge: mcmod.info
  const mcmod = parseJson(await readText(fh, zip, 'mcmod.info'));
  const list = Array.isArray(mcmod) ? mcmod : isObj(mcmod) && Array.isArray(mcmod.modList) ? mcmod.modList : [];
  for (const entry of list) {
    if (isObj(entry) && typeof entry.logoFile === 'string' && entry.logoFile.trim() !== '') add(entry.logoFile.trim());
  }

  // Convention used by many plugins and mods that have no manifest field for it
  add('icon.png');
  add('logo.png');
  add('pack.png');
  return out;
}

function isImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const gif = buf.toString('ascii', 0, 3) === 'GIF';
  const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return png || jpg || gif || webp;
}

/** Shrinks to at most ICON_SIZE px and returns a PNG data URL, or null if the image cannot be decoded. */
function toDataUrl(buf: Buffer): string | null {
  try {
    let img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    if (width <= 0 || height <= 0) return null;
    if (width > ICON_SIZE || height > ICON_SIZE) {
      const scale = ICON_SIZE / Math.max(width, height);
      img = img.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: 'best'
      });
    }
    const png = img.toPNG();
    return png.length > 0 ? `data:image/png;base64,${png.toString('base64')}` : null;
  } catch {
    return null;
  }
}

/**
 * Returns the icon that ships inside the jar as a small PNG data URL, or null when there is none.
 * Never throws: a broken jar simply has no icon.
 */
export async function readJarIcon(jarPath: string): Promise<string | null> {
  let fh: fsp.FileHandle | null = null;
  try {
    fh = await fsp.open(jarPath, 'r');
    const zip = await openZip(fh);
    if (!zip) return null;
    for (const candidate of await candidatePaths(fh, zip)) {
      const entry = findEntry(zip, candidate);
      if (!entry) continue;
      const data = await readEntry(fh, entry).catch(() => null);
      if (!data || !isImage(data)) continue;
      const url = toDataUrl(data);
      if (url) return url;
    }
    return null;
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => undefined);
  }
}
