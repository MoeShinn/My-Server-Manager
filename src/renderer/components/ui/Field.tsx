import type { ReactNode } from 'react'
import { cn } from './cn'

/** Label + control + hint/error line. Extra helper of the UI kit. */
export function Field({ id, label, hint, error, className, children }: { id?: string; label?: ReactNode; hint?: ReactNode; error?: string | null; className?: string; children: ReactNode }): JSX.Element {
  return (
    <div id={id} className={cn('space-y-1.5', className)}>
      {label && <div className="text-sm font-medium text-fg">{label}</div>}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
