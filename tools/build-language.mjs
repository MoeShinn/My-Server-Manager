#!/usr/bin/env node
// FILE: tools/build-language.mjs
// Language build helper. No external dependencies (Node 20+, ESM).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'locales-src');
const LANG_DIR = path.join(ROOT, 'language');
const TOOLS_DIR = path.join(ROOT, 'tools');
const PARAM_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

const HELP = `
build-language.mjs - Công cụ gộp và kiểm tra file ngôn ngữ

CÁCH DÙNG
  node tools/build-language.mjs
      Gộp mọi file locales-src/*.en.json thành language/en.json (có thêm _meta).
      Nếu một key xuất hiện ở hai file với nội dung khác nhau thì báo lỗi và thoát mã 1.

  node tools/build-language.mjs --missing <mã> [--chunk N]
      So language/en.json với language/<mã>.json, ghi các key còn thiếu (kèm chữ tiếng Anh)
      ra tools/missing-<mã>.json. Có --chunk N thì chia thành nhiều file, mỗi file tối đa N key:
      tools/missing-<mã>-1.json, tools/missing-<mã>-2.json, ...

  node tools/build-language.mjs --merge <mã> <file...> [--name "Tên hiển thị"]
      Gộp các file đã dịch vào language/<mã>.json. Nếu file đích chưa có thì tạo mới kèm _meta.
      Mỗi key phải giữ nguyên tập tham số {...} như tiếng Anh, nếu sai thì thoát mã 1 và KHÔNG ghi gì.
      Key không có trong tiếng Anh sẽ bị cảnh báo và bỏ qua.

  node tools/build-language.mjs --check
      Kiểm tra mọi file trong language/: tham số có khớp không, thiếu bao nhiêu key, thừa bao nhiêu key.

  node tools/build-language.mjs --help
      Hiện hướng dẫn này.

VÍ DỤ
  node tools/build-language.mjs
  node tools/build-language.mjs --missing vi --chunk 80
  node tools/build-language.mjs --merge vi tools/missing-vi-1.json tools/missing-vi-2.json --name "Tiếng Việt"
  node tools/build-language.mjs --check
`;

function fail(message) {
  console.error(`LỖI: ${message}`);
  process.exit(1);
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    fail(`Không đọc được file: ${path.relative(ROOT, file)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`File không phải JSON hợp lệ: ${path.relative(ROOT, file)} (${error.message})`);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function assertFlat(data, label) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) fail(`${label}: phải là JSON object phẳng.`);
  for (const [key, value] of Object.entries(data)) {
    if (key === '_meta') continue;
    if (typeof value !== 'string') fail(`${label}: giá trị của "${key}" phải là chuỗi.`);
  }
}

function paramsOf(text) {
  return [...new Set([...text.matchAll(PARAM_PATTERN)].map((m) => m[1]))].sort();
}

function sameParams(a, b) {
  const pa = paramsOf(a);
  const pb = paramsOf(b);
  return pa.length === pb.length && pa.every((p, i) => p === pb[i]);
}

function entriesOf(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== '_meta') result[key] = value;
  }
  return result;
}

function sortedKeys(obj) {
  return Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function loadEnglish() {
  const file = path.join(LANG_DIR, 'en.json');
  if (!fs.existsSync(file)) fail('Chưa có language/en.json. Hãy chạy "node tools/build-language.mjs" trước.');
  const data = readJson(file);
  assertFlat(data, 'language/en.json');
  return entriesOf(data);
}

function validateCode(code) {
  if (!code || !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code)) {
    fail(`Mã ngôn ngữ "${code ?? ''}" không hợp lệ (ví dụ: vi, vi-en, pt-br).`);
  }
}

// ---------- default: merge locales-src ----------
function buildEnglish() {
  if (!fs.existsSync(SRC_DIR)) fail('Không thấy thư mục locales-src/.');
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.en.json')).sort();
  if (files.length === 0) fail('Không có file locales-src/*.en.json nào.');
  const merged = {};
  const origin = {};
  let conflicts = 0;
  for (const name of files) {
    const data = readJson(path.join(SRC_DIR, name));
    assertFlat(data, `locales-src/${name}`);
    for (const [key, value] of Object.entries(entriesOf(data))) {
      if (key in merged && merged[key] !== value) {
        conflicts += 1;
        console.error(`XUNG ĐỘT: key "${key}" khác nhau giữa ${origin[key]} và ${name}`);
        continue;
      }
      merged[key] = value;
      if (!(key in origin)) origin[key] = name;
    }
  }
  if (conflicts > 0) fail(`Có ${conflicts} key xung đột, chưa ghi language/en.json.`);
  const output = { _meta: { code: 'en', name: 'English' } };
  for (const key of sortedKeys(merged)) output[key] = merged[key];
  writeJson(path.join(LANG_DIR, 'en.json'), output);
  console.log(`Đã gộp ${files.length} file, ${Object.keys(merged).length} key -> language/en.json`);
}

// ---------- --missing ----------
function runMissing(args) {
  const code = args[0];
  validateCode(code);
  let chunk = 0;
  const chunkIndex = args.indexOf('--chunk');
  if (chunkIndex !== -1) {
    chunk = Number.parseInt(args[chunkIndex + 1] ?? '', 10);
    if (!Number.isInteger(chunk) || chunk < 1) fail('--chunk cần một số nguyên dương, ví dụ --chunk 80.');
  }
  const english = loadEnglish();
  const targetFile = path.join(LANG_DIR, `${code}.json`);
  const target = fs.existsSync(targetFile) ? entriesOf(readJson(targetFile)) : {};
  const missing = {};
  for (const key of sortedKeys(english)) {
    if (!(key in target)) missing[key] = english[key];
  }
  const keys = Object.keys(missing);
  // Remove stale outputs of earlier runs so old chunks do not get merged by mistake.
  for (const name of fs.existsSync(TOOLS_DIR) ? fs.readdirSync(TOOLS_DIR) : []) {
    if (name === `missing-${code}.json` || new RegExp(`^missing-${code}-\\d+\\.json$`).test(name)) {
      fs.rmSync(path.join(TOOLS_DIR, name), { force: true });
    }
  }
  if (keys.length === 0) {
    console.log(`Ngôn ngữ "${code}" không thiếu key nào.`);
    return;
  }
  if (chunk === 0) {
    writeJson(path.join(TOOLS_DIR, `missing-${code}.json`), missing);
    console.log(`Thiếu ${keys.length} key -> tools/missing-${code}.json`);
    return;
  }
  let part = 0;
  for (let i = 0; i < keys.length; i += chunk) {
    part += 1;
    const piece = {};
    for (const key of keys.slice(i, i + chunk)) piece[key] = missing[key];
    writeJson(path.join(TOOLS_DIR, `missing-${code}-${part}.json`), piece);
  }
  console.log(`Thiếu ${keys.length} key -> ${part} file tools/missing-${code}-1.json ... missing-${code}-${part}.json`);
}

// ---------- --merge ----------
function runMerge(args) {
  const code = args[0];
  validateCode(code);
  let name = null;
  const files = [];
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--name') {
      name = args[i + 1];
      i += 1;
      if (!name) fail('--name cần một giá trị, ví dụ --name "Tiếng Việt".');
    } else {
      files.push(args[i]);
    }
  }
  if (files.length === 0) fail('Cần ít nhất một file đã dịch để gộp.');
  const english = loadEnglish();
  const targetFile = path.join(LANG_DIR, `${code}.json`);
  const existing = fs.existsSync(targetFile) ? readJson(targetFile) : null;
  if (existing) assertFlat(existing, `language/${code}.json`);
  const result = existing ? entriesOf(existing) : {};
  let added = 0;
  let replaced = 0;
  let errors = 0;
  for (const file of files) {
    const data = readJson(path.resolve(process.cwd(), file));
    assertFlat(data, file);
    for (const [key, value] of Object.entries(entriesOf(data))) {
      if (!(key in english)) {
        console.warn(`CẢNH BÁO: key "${key}" (${file}) không có trong tiếng Anh, bỏ qua.`);
        continue;
      }
      if (!sameParams(english[key], value)) {
        errors += 1;
        console.error(`SAI THAM SỐ: "${key}" (${file}) cần {${paramsOf(english[key]).join('}, {')}} nhưng có {${paramsOf(value).join('}, {')}}`);
        continue;
      }
      if (key in result) replaced += 1;
      else added += 1;
      result[key] = value;
    }
  }
  if (errors > 0) fail(`Có ${errors} key sai tham số, KHÔNG ghi language/${code}.json.`);
  let meta = existing && typeof existing._meta === 'object' && existing._meta ? { ...existing._meta } : null;
  if (!meta) {
    meta = { code, name: name ?? code };
    if (!name) console.warn(`CẢNH BÁO: chưa có --name, tạm đặt tên hiển thị là "${code}".`);
  }
  meta.code = code;
  if (name) meta.name = name;
  const output = { _meta: meta };
  for (const key of sortedKeys(result)) output[key] = result[key];
  writeJson(targetFile, output);
  console.log(`Đã gộp vào language/${code}.json: thêm ${added}, thay ${replaced}, tổng ${Object.keys(result).length} key.`);
}

// ---------- --check ----------
function runCheck() {
  const english = loadEnglish();
  const files = fs.existsSync(LANG_DIR) ? fs.readdirSync(LANG_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  if (files.length === 0) fail('language/ chưa có file nào.');
  let problems = 0;
  for (const name of files) {
    const data = readJson(path.join(LANG_DIR, name));
    assertFlat(data, `language/${name}`);
    const code = name.slice(0, -'.json'.length);
    const meta = data._meta;
    const metaOk = meta && typeof meta === 'object' && typeof meta.name === 'string' && meta.code === code;
    const entries = entriesOf(data);
    let badParams = 0;
    for (const key of Object.keys(entries)) {
      if (key in english && !sameParams(english[key], entries[key])) {
        badParams += 1;
        console.error(`  [${name}] sai tham số: ${key}`);
      }
    }
    const missing = Object.keys(english).filter((k) => !(k in entries)).length;
    const extra = Object.keys(entries).filter((k) => !(k in english)).length;
    if (!metaOk) {
      problems += 1;
      console.error(`  [${name}] _meta thiếu hoặc sai (cần { code: "${code}", name: "..." })`);
    }
    problems += badParams;
    console.log(`${name.padEnd(14)} key: ${String(Object.keys(entries).length).padStart(4)}  thiếu: ${String(missing).padStart(4)}  thừa: ${String(extra).padStart(3)}  sai tham số: ${badParams}`);
  }
  if (problems > 0) fail(`Phát hiện ${problems} vấn đề.`);
  console.log('Kiểm tra xong, không có lỗi tham số.');
}

// ---------- main ----------
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
} else if (argv.length === 0) {
  buildEnglish();
} else if (argv[0] === '--missing') {
  runMissing(argv.slice(1));
} else if (argv[0] === '--merge') {
  runMerge(argv.slice(1));
} else if (argv[0] === '--check') {
  runCheck();
} else {
  console.error(`Tham số không hiểu: ${argv[0]}`);
  console.log(HELP);
  process.exit(1);
}
