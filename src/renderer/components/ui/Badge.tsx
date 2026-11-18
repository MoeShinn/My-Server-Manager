import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeColor = 'accent' | 'danger' | 'success' | 'warning' | 'muted' | (string & {})
const TOKENS = ['accent', 'danger', 'success', 'warning', 'muted']

export function Badge({ color = 'muted', className, children }: { color?: BadgeColor; className?: string; children: ReactNode }): JSX.Element {
  const css = TOKENS.includes(color) ? `var(--${color})` : color
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none', className)}
      style={{
        color: css,
        backgroundColor: `color-mix(in srgb, ${css} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${css} 35%, transparent)`
      }}
    >
      {children}
    </span>
  )
}
