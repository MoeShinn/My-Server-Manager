import { useCallback, useState } from 'react'

export type BlockId = 'control' | 'stats' | 'chart' | 'players' | 'ip' | 'settings' | 'manage' | 'console'
/** Which side of the dashboard a section sits on. */
export type BlockZone = 'left' | 'right'
export type CardSize = 'small' | 'medium' | 'large'
export type ChartMinutes = 1 | 3 | 5 | 10

export interface BlockPref {
  id: BlockId
  visible: boolean
  /** left = the wide main column (console, chart), right = the side column. Order inside a side follows the list order. */
  zone: BlockZone
}

export interface DashboardLayout {
  blocks: BlockPref[]
  cardSize: CardSize
  chartMinutes: ChartMinutes
}

export const BLOCK_IDS: readonly BlockId[] = ['control', 'stats', 'chart', 'players', 'ip', 'settings', 'manage', 'console']
export const CARD_MIN_WIDTH: Record<CardSize, number> = { small: 260, medium: 320, large: 400 }
export const CHART_MINUTES: readonly ChartMinutes[] = [1, 3, 5, 10]

const ZONES: readonly BlockZone[] = ['left', 'right']
const DEFAULT_ZONE: Record<BlockId, BlockZone> = {
  console: 'left',
  chart: 'left',
  control: 'right',
  stats: 'right',
  players: 'right',
  ip: 'right',
  settings: 'right',
  manage: 'right'
}
const SIZES: readonly CardSize[] = ['small', 'medium', 'large']
const STORAGE_KEY = 'mcm.serverDashboardLayout.v2'

/** Default: console with the chart under it on the left, every other section stacked on the right. */
export function defaultLayout(): DashboardLayout {
  const order: BlockId[] = ['console', 'chart', 'control', 'stats', 'players', 'ip', 'settings', 'manage']
  return {
    blocks: order.map((id) => ({ id, visible: true, zone: DEFAULT_ZONE[id] })),
    cardSize: 'medium',
    chartMinutes: 3
  }
}

/** Accepts whatever was stored and always returns a complete, valid layout (new blocks appear at the end). */
function sanitize(raw: unknown): DashboardLayout {
  const base = defaultLayout()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Record<string, unknown>
  const seen = new Set<BlockId>()
  const blocks: BlockPref[] = []
  if (Array.isArray(r.blocks)) {
    for (const item of r.blocks) {
      if (typeof item !== 'object' || item === null) continue
      const b = item as Record<string, unknown>
      const id = BLOCK_IDS.find((x) => x === b.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      blocks.push({
        id,
        visible: typeof b.visible === 'boolean' ? b.visible : true,
        zone: ZONES.find((z) => z === b.zone) ?? DEFAULT_ZONE[id]
      })
    }
  }
  for (const b of base.blocks) if (!seen.has(b.id)) blocks.push(b)
  return {
    blocks,
    cardSize: SIZES.find((s) => s === r.cardSize) ?? base.cardSize,
    chartMinutes: CHART_MINUTES.find((m) => m === r.chartMinutes) ?? base.chartMinutes
  }
}

function load(): DashboardLayout {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY)
    return sanitize(text ? JSON.parse(text) : null)
  } catch {
    return defaultLayout()
  }
}

function save(layout: DashboardLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage unavailable: the layout still works for this session.
  }
}

/** The dashboard layout shared by every server, remembered between launches. */
export function useDashboardLayout(): [DashboardLayout, (next: DashboardLayout) => void] {
  const [layout, setLayout] = useState<DashboardLayout>(load)
  const update = useCallback((next: DashboardLayout) => {
    setLayout(next)
    save(next)
  }, [])
  return [layout, update]
}
