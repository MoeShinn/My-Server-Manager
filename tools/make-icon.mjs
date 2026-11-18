#!/usr/bin/env node
// FILE: tools/make-icon.mjs
// Generates a temporary app icon (assets/icon.png and assets/icon.svg) without any external library.
// Usage: node tools/make-icon.mjs [--force] [--help]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const SIZE = 512;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`make-icon.mjs - Tạo icon tạm cho app

CÁCH DÙNG
  node tools/make-icon.mjs            Tạo assets/icon.png và assets/icon.svg (nếu chưa có)
  node tools/make-icon.mjs --force    Ghi đè kể cả khi file đã tồn tại

Icon là hình vuông bo góc màu xanh lá có hình khối lập phương. Hãy thay bằng logo của bạn khi sẵn sàng.`);
  process.exit(0);
}
const force = process.argv.includes('--force');

// ---------- geometry (shared by PNG and SVG) ----------
const BG = { r: 76, g: 175, b: 80 }; // green
const BG_DARK = { r: 46, g: 125, b: 50 };
const MARGIN = 24;
const RADIUS = 104;

const CENTER = [256, 262];
const R = 140;
const COS30 = Math.round(R * 0.8660254);
const top = [256, 262 - R];
const upperRight = [256 + COS30, 262 - R / 2];
const lowerRight = [256 + COS30, 262 + R / 2];
const bottom = [256, 262 + R];
const lowerLeft = [256 - COS30, 262 + R / 2];
const upperLeft = [256 - COS30, 262 - R / 2];

const FACES = [
  { points: [top, upperRight, CENTER, upperLeft], color: { r: 232, g: 245, b: 233 } },
  { points: [upperLeft, CENTER, bottom, lowerLeft], color: { r: 165, g: 214, b: 167 } },
  { points: [CENTER, upperRight, lowerRight, bottom], color: { r: 102, g: 187, b: 106 } },
];

function shrink(points, factor) {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}
const FACE_SHAPES = FACES.map((f) => ({ ...f, points: shrink(f.points, 0.955) }));

function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideRoundedSquare(x, y) {
  const min = MARGIN;
  const max = SIZE - MARGIN;
  if (x < min || x > max || y < min || y > max) return false;
  const cx = x < min + RADIUS ? min + RADIUS : x > max - RADIUS ? max - RADIUS : x;
  const cy = y < min + RADIUS ? min + RADIUS : y > max - RADIUS ? max - RADIUS : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

// ---------- rasterize into RGBA buffer with 3x3 supersampling ----------
function render() {
  const buffer = Buffer.alloc(SIZE * SIZE * 4);
  const SS = 3;
  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!insideRoundedSquare(x, y)) continue;
          let color = null;
          for (const face of FACE_SHAPES) {
            if (insidePolygon(x, y, face.points)) {
              color = face.color;
              break;
            }
          }
          if (!color) {
            const t = y / SIZE;
            color = {
              r: BG.r + (BG_DARK.r - BG.r) * t,
              g: BG.g + (BG_DARK.g - BG.g) * t,
              b: BG.b + (BG_DARK.b - BG.b) * t,
            };
          }
          r += color.r;
          g += color.g;
          b += color.b;
          covered += 1;
        }
      }
      const offset = (py * SIZE + px) * 4;
      if (covered > 0) {
        buffer[offset] = Math.round(r / covered);
        buffer[offset + 1] = Math.round(g / covered);
        buffer[offset + 2] = Math.round(b / covered);
        buffer[offset + 3] = Math.round((covered / (SS * SS)) * 255);
      }
    }
  }
  return buffer;
}

// ---------- PNG encoder (zlib + CRC32) ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- SVG ----------
function buildSvg() {
  const hex = (c) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const poly = (points) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(BG)}"/>
      <stop offset="1" stop-color="${hex(BG_DARK)}"/>
    </linearGradient>
  </defs>
  <rect x="${MARGIN}" y="${MARGIN}" width="${SIZE - MARGIN * 2}" height="${SIZE - MARGIN * 2}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#bg)"/>
${FACE_SHAPES.map((f) => `  <polygon points="${poly(f.points)}" fill="${hex(f.color)}"/>`).join('\n')}
</svg>
`;
}

// ---------- write ----------
fs.mkdirSync(ASSETS, { recursive: true });

function writeIfAllowed(file, produce) {
  const rel = path.relative(ROOT, file);
  if (fs.existsSync(file) && !force) {
    console.log(`Bỏ qua ${rel} vì đã tồn tại (dùng --force để ghi đè).`);
    return;
  }
  fs.writeFileSync(file, produce());
  console.log(`Đã tạo ${rel}`);
}

writeIfAllowed(path.join(ASSETS, 'icon.png'), () => encodePng(render(), SIZE, SIZE));
writeIfAllowed(path.join(ASSETS, 'icon.svg'), () => buildSvg());
