import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface BoxProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  actions?: ReactNode
}

export function Box({ title, actions, className, children, ...rest }: BoxProps): JSX.Element {
  return (
    <div className={cn('rounded-xl border border-line bg-panel p-4', className)} {...rest}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="min-w-0 truncate text-sm font-semibold text-fg">{title}</h3>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
