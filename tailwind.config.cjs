const path = require('node:path')

// Theme colors live in CSS variables (src/renderer/styles/index.css).
// color-mix keeps Tailwind opacity modifiers working (e.g. bg-accent/20).
const themeColor = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, 'src/renderer/**/*.{ts,tsx,html}')],
  theme: {
    extend: {
      colors: {
        bg: themeColor('bg'),
        panel: themeColor('panel'),
        'panel-2': themeColor('panel-2'),
        line: themeColor('border'),
        border: themeColor('border'),
        fg: themeColor('text'),
        text: themeColor('text'),
        muted: themeColor('muted'),
        accent: themeColor('accent'),
        'accent-fg': themeColor('accent-fg'),
        danger: themeColor('danger'),
        'danger-fg': themeColor('danger-fg'),
        success: themeColor('success'),
        warning: themeColor('warning'),
        overlay: 'var(--overlay)'
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif']
      },
      keyframes: {
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(350%)' }
        }
      },
      animation: { indeterminate: 'indeterminate 1.4s ease-in-out infinite' }
    }
  },
  plugins: []
}
