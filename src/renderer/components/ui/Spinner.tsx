import { Loader2 } from 'lucide-react'
import { cn } from './cn'

export function Spinner({ className, size = 16 }: { className?: string; size?: number }): JSX.Element {
  return <Loader2 size={size} className={cn('animate-spin text-muted', className)} aria-hidden="true" />
}
