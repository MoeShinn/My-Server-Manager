import { Fragment, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { MC_COLORS, parseMcText } from '@shared/mcText'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/layout/stores'
import { cn } from './cn'

/** Relative luminance (0..1) of a #RRGGBB colour. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function mix(hex: string, target: number, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const out = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (target - v) * amount))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Black text on a dark panel (or white on a light one) would vanish, so very low-contrast colours are nudged. */
function readable(hex: string, theme: 'dark' | 'light'): string {
  const l = luminance(hex)
  if (theme === 'dark' && l < 0.12) return mix(hex, 255, 0.6)
  if (theme === 'light' && l > 0.6) return mix(hex, 0, 0.5)
  return hex
}

export function McText({ text, className }: { text: string; className?: string }): JSX.Element {
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark')
  const segments = useMemo(() => parseMcText(text), [text])
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        const style: CSSProperties = {}
        if (seg.color) style.color = readable(seg.color, theme)
        if (seg.bold) style.fontWeight = 700
        if (seg.italic) style.fontStyle = 'italic'
        if (seg.underline || seg.strike) style.textDecoration = [seg.underline ? 'underline' : '', seg.strike ? 'line-through' : ''].filter(Boolean).join(' ')
        const lines = seg.text.split('\n')
        return (
          <span key={i} style={style}>
            {lines.map((line, k) => (
              <Fragment key={k}>
                {k > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </span>
        )
      })}
    </span>
  )
}

const PALETTE = Object.keys(MC_COLORS)

interface EditorProps {
  value: string
  onChange: (value: string) => void
  /** Two-line mode (server description / MOTD). */
  multiline?: boolean
  maxLength?: number
  placeholder?: string
  invalid?: boolean
  id?: string
}

/** Text box with a colour palette (inserts & codes at the caret) and a live preview. § and & both work when typed. */
export function McTextEditor({ value, onChange, multiline, maxLength, placeholder, invalid, id }: EditorProps): JSX.Element {
  const t = useT()
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  function insert(code: string): void {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const token = `&${code}`
    const next = value.slice(0, start) + token + value.slice(end)
    if (maxLength !== undefined && next.length > maxLength) return
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function handleChange(next: string): void {
    const clean = next.replace(/\r\n?/g, '\n')
    if (multiline && clean.split('\n').length > 2) return
    onChange(clean)
  }

  const common = {
    id,
    value,
    maxLength,
    placeholder,
    'aria-invalid': invalid || undefined,
    className: cn(
      'w-full rounded-lg border bg-bg px-3 text-sm text-fg placeholder:text-muted/70',
      invalid ? 'border-danger' : 'border-line focus:border-accent'
    )
  }

  const formats: { code: string; label: string; titleKey: string; style: CSSProperties }[] = [
    { code: 'l', label: 'B', titleKey: 'mc.bold', style: { fontWeight: 700 } },
    { code: 'o', label: 'I', titleKey: 'mc.italic', style: { fontStyle: 'italic' } },
    { code: 'n', label: 'U', titleKey: 'mc.underline', style: { textDecoration: 'underline' } },
    { code: 'm', label: 'S', titleKey: 'mc.strike', style: { textDecoration: 'line-through' } }
  ]

  return (
    <div className="space-y-2">
      {multiline ? (
        <textarea ref={ref} rows={2} {...common} onChange={(e) => handleChange(e.target.value)} className={cn(common.className, 'resize-none py-2')} />
      ) : (
        <input ref={ref} type="text" {...common} onChange={(e) => handleChange(e.target.value)} className={cn(common.className, 'h-9')} />
      )}

      <div className="flex flex-wrap items-center gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={`&${c}`}
            aria-label={`&${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(c)}
            className="h-5 w-5 rounded border border-line transition-transform hover:scale-110"
            style={{ background: MC_COLORS[c] }}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {formats.map((f) => (
          <button
            key={f.code}
            type="button"
            title={`${t(f.titleKey)} (&${f.code})`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(f.code)}
            className="h-5 min-w-5 rounded border border-line px-1 text-xs text-fg hover:bg-panel-2"
            style={f.style}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          title={`${t('mc.reset')} (&r)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert('r')}
          className="h-5 rounded border border-line px-1.5 text-xs text-fg hover:bg-panel-2"
        >
          {t('mc.reset')}
        </button>
      </div>

      <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t('mc.preview')}</div>
        <div className="min-h-[1.25rem] break-words text-sm text-fg">
          {value.trim() === '' ? <span className="text-muted">{t('mc.empty')}</span> : <McText text={value} />}
        </div>
      </div>
      <p className="text-xs text-muted">{t('mc.hint')}</p>
    </div>
  )
}
