import type { ServerStatus } from '@shared/types'
import { useT } from '@/i18n'
import { Badge } from './Badge'
import type { BadgeColor } from './Badge'

export const STATUS_COLOR: Record<ServerStatus, BadgeColor> = {
  stopped: 'muted',
  starting: 'warning',
  running: 'success',
  stopping: 'warning',
  crashed: 'danger'
}

export function StatusBadge({ status }: { status: ServerStatus }): JSX.Element {
  const t = useT()
  return <Badge color={STATUS_COLOR[status]}>{t(`servers.status.${status}`)}</Badge>
}
