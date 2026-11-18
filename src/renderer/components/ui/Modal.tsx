import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n'
import { cn } from './cn'

export interface ModalProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  footer?: ReactNode
  width?: number | string
  /** When false, Esc / outside click / X do nothing (used for progress dialogs). Default true. */
  dismissible?: boolean
  className?: string
  children?: ReactNode
}

export function Modal({ open, title, onClose, footer, width = 480, dismissible = true, className, children }: ModalProps): JSX.Element | null {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    if (!dismissible) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn('flex max-h-full flex-col rounded-xl border border-line bg-panel shadow-2xl outline-none', className)}
        style={{ width, maxWidth: '100%' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-semibold text-fg">{title}</h2>
          {dismissible && (
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-md p-1 text-muted hover:bg-panel-2 hover:text-fg">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
