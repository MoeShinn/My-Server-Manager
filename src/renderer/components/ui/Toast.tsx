import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from './cn'

type Kind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  message: string
}
export interface ToastApi {
  success(message: string): void
  error(message: string): void
  info(message: string): void
}

const ToastContext = createContext<ToastApi | null>(null)
let nextId = 1

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const COLORS: Record<Kind, string> = { success: 'text-success', error: 'text-danger', info: 'text-accent' }

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId++
    setItems((list) => [...list.slice(-4), { id, kind, message }])
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
        {items.map((item) => {
          const Icon = ICONS[item.kind]
          return (
            <div key={item.id} role={item.kind === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-panel p-3 text-sm text-fg shadow-xl">
              <Icon size={18} className={cn('mt-0.5 shrink-0', COLORS[item.kind])} />
              <span className="min-w-0 flex-1 break-words">{item.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
