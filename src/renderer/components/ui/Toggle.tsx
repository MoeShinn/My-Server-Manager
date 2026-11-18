import { cn } from './cn'

export function Toggle({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (checked: boolean) => void; label?: string; disabled?: boolean; className?: string }): JSX.Element {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-3', disabled && 'cursor-not-allowed opacity-50', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full border transition-colors', checked ? 'border-accent bg-accent' : 'border-line bg-panel-2')}
      >
        <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all', checked ? 'left-[18px] bg-accent-fg' : 'left-0.5 bg-muted')} />
      </button>
      {label && <span className="text-sm text-fg">{label}</span>}
    </label>
  )
}
