import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useT } from '@/i18n'
import { Button } from './Button'
import { Modal } from './Modal'
import { TextInput } from './TextInput'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** User must type exactly this text before the confirm button is enabled. */
  requireText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, requireText, loading, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element | null {
  const t = useT()
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (open) setTyped('')
  }, [open])
  const allowed = requireText === undefined || typed === requireText

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!allowed} loading={loading} onClick={onConfirm}>
            {confirmLabel ?? t('common.ok')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-fg">
        <div>{message}</div>
        {requireText !== undefined && (
          <div className="space-y-1.5">
            <p className="text-muted">{t('common.typeToConfirm', { text: requireText })}</p>
            <TextInput value={typed} onChange={setTyped} placeholder={requireText} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  )
}
