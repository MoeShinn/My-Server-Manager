import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90',
  secondary: 'border border-line bg-panel-2 text-fg hover:border-muted',
  danger: 'bg-danger text-danger-fg hover:bg-danger/90',
  ghost: 'text-muted hover:bg-panel-2 hover:text-fg'
}
const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-4 text-sm'
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, disabled, children, type, ...rest }: ButtonProps): JSX.Element {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 13 : 15} className="text-current" /> : icon}
      {children}
    </button>
  )
}
