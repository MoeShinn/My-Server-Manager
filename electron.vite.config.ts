import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// In dev mode Vite injects an inline React-refresh script and a websocket for HMR,
// so the strict production CSP in index.html is relaxed for `vite serve` only.
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; worker-src 'self' blob:"

function devCsp(): Plugin {
  return {
    name: 'mcm-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/,
        (_m, a: string, b: string) => `${a}${DEV_CSP}${b}`
      )
    }
  }
}

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preload must be a single CommonJS file that only requires 'electron'.
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), devCsp()],
    resolve: { alias: { '@': resolve('src/renderer'), ...sharedAlias } },
    css: { postcss: resolve('.') },
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') }
    }
  }
})
