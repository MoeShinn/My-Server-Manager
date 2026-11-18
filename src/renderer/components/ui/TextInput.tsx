import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

export function TextInput({ value, onChange, invalid, className, type = 'text', ...rest }: TextInputProps): JSX.Element {
  return (
    <input
      type={type}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 w-full rounded-lg border bg-bg px-3 text-sm text-fg placeholder:text-muted/70 disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line focus:border-accent',
        className
      )}
      {...rest}
    />
  )
}
