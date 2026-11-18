// Chay truoc khi build: dong bo version, kiem tra icon, canh bao repo.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'smol-toml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error('\n[LOI] ' + message + '\n')
  process.exit(1)
}

const tomlPath = resolve(root, 'config.toml')
if (!existsSync(tomlPath)) fail('Khong tim thay file config.toml o thu muc goc du an.')

let config
try {
  config = parse(readFileSync(tomlPath, 'utf8'))
} catch (err) {
  fail('File config.toml bi loi cu phap: ' + err.message)
}

// 1. Sync version into package.json
const version = typeof config.app_version === 'string' ? config.app_version.trim() : ''
if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail('app_version trong config.toml phai co dang x.y.z (vi du 1.0.0). Gia tri hien tai: "' + version + '".')
}
const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.version !== version) {
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log('[OK] Da dong bo version package.json -> ' + version)
} else {
  console.log('[OK] Version da khop: ' + version)
}

// 2. Check icon (square PNG, >= 256px)
const iconRel = typeof config.app_icon === 'string' && config.app_icon.trim() !== '' ? config.app_icon.trim() : 'assets/icon.png'
const iconPath = resolve(root, iconRel)
if (!existsSync(iconPath)) {
  fail('Khong tim thay file icon "' + iconRel + '". Hay dat anh PNG vuong, tu 256x256 tro len, tai duong dan do (key app_icon trong config.toml).')
}
const buf = readFileSync(iconPath)
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) {
  fail('File icon "' + iconRel + '" khong phai la anh PNG hop le. Hay xuat lai thanh PNG.')
}
const width = buf.readUInt32BE(16)
const height = buf.readUInt32BE(20)
if (width !== height) {
  fail('Icon "' + iconRel + '" phai la hinh vuong, hien tai la ' + width + 'x' + height + '.')
}
if (width < 256) {
  fail('Icon "' + iconRel + '" qua nho (' + width + 'px). Can tu 256x256 tro len.')
}
console.log('[OK] Icon hop le: ' + iconRel + ' (' + width + 'x' + height + ')')

// 3. Warn about placeholder repo
if (config.app_repo === undefined || config.app_repo === 'OWNER/REPO') {
  console.warn('[CANH BAO] app_repo van la OWNER/REPO. App se KHONG co tinh nang tu cap nhat cho den khi ban dien repo that.')
}
console.log('[OK] prepare-build hoan tat.')
