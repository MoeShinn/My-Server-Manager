import { cn } from './cn'

/** value: percent 0..100, or null for an indeterminate bar. */
export function ProgressBar({ value, label, className }: { value: number | null; label?: string; className?: string }): JSX.Element {
  const pct = value === null ? null : Math.max(0, Math.min(100, value))
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex justify-between gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">{label}</span>
          {pct !== null && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct === null ? undefined : Math.round(pct)}
        className="relative h-2 overflow-hidden rounded-full bg-panel-2"
      >
        {pct === null ? (
          <div className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-accent" />
        ) : (
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  )
}
