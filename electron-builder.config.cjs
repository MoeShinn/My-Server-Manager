// Electron-builder configuration. Reads config.toml at build time (single source of truth).
const fs = require('node:fs')
const path = require('node:path')

function loadToml() {
  try {
    const { parse } = require('smol-toml')
    return parse(fs.readFileSync(path.join(__dirname, 'config.toml'), 'utf8'))
  } catch (err) {
    console.warn('[electron-builder] Khong doc duoc config.toml, dung gia tri mac dinh:', err.message)
    return {}
  }
}

const toml = loadToml()
const str = (key, def) => (typeof toml[key] === 'string' && toml[key].trim() !== '' ? toml[key].trim() : def)

const appId = str('app_id', 'com.example.mcservermanager') // NEVER change after first release
const productName = str('app_name', 'My Server Manager')
const appVersion = str('app_version', '1.0.0')
const appRepo = str('app_repo', 'OWNER/REPO')
const appIcon = str('app_icon', 'assets/icon.png')
const installerIcon = str('installer_icon', '')

const repoMatch = /^([\w.-]+)\/([\w.-]+)$/.exec(appRepo)
const publish =
  repoMatch && appRepo !== 'OWNER/REPO' ? { provider: 'github', owner: repoMatch[1], repo: repoMatch[2] } : null

// NSIS only accepts .ico for installer icons; otherwise electron-builder falls back to the app icon.
const nsisIcons = {}
const nsisIcon = installerIcon !== '' ? installerIcon : appIcon
if (nsisIcon.toLowerCase().endsWith('.ico')) {
  nsisIcons.installerIcon = nsisIcon
  nsisIcons.uninstallerIcon = nsisIcon
}

module.exports = {
  appId,
  productName,
  artifactName: '${name}-Setup-${version}.${ext}',
  extraMetadata: { version: appVersion },
  directories: { output: 'dist' },
  asar: true,
  files: ['out/**/*', 'package.json'],
  extraResources: [
    { from: 'config.toml', to: 'config.toml' },
    { from: 'data.json', to: 'data.json' },
    { from: 'language', to: 'language', filter: ['**/*'] },
    { from: 'assets', to: 'assets', filter: ['**/*'] },
    { from: 'legal', to: 'legal', filter: ['**/*'] }
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: appIcon
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: productName,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    ...nsisIcons
  },
  publish
}
