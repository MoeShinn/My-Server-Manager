import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '@/i18n'
import { Button, Modal, Toggle, cn } from '@/components/ui'
import { CHART_MINUTES, defaultLayout } from '../dashboardLayout'
import type { BlockId, BlockZone, CardSize, ChartMinutes, DashboardLayout } from '../dashboardLayout'

interface Props {
  open: boolean
  layout: DashboardLayout
  onChange: (next: DashboardLayout) => void
  onClose: () => void
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('px-3 py-1 text-xs transition-colors', o.value === value ? 'bg-accent text-accent-fg' : 'bg-panel-2 text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-fg">{title}</span>
      {children}
    </div>
  )
}

export default function CustomizeDashboardModal({ open, layout, onChange, onClose }: Props): JSX.Element {
  const t = useT()
  const blockName = (id: BlockId): string => t(`srv.dash.block.${id}`)

  const patchBlock = (id: BlockId, patch: Partial<{ visible: boolean; zone: BlockZone }>): void =>
    onChange({ ...layout, blocks: layout.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })

  /** Moves a section up/down among the sections on the same side. */
  const move = (id: BlockId, delta: -1 | 1): void => {
    const index = layout.blocks.findIndex((b) => b.id === id)
    const zone = layout.blocks[index].zone
    let target = index + delta
    while (target >= 0 && target < layout.blocks.length && layout.blocks[target].zone !== zone) target += delta
    if (target < 0 || target >= layout.blocks.length) return
    const blocks = [...layout.blocks]
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    onChange({ ...layout, blocks })
  }

  /** Puts a section on the other side, at the end of that side. */
  const setZone = (id: BlockId, zone: BlockZone): void => {
    const current = layout.blocks.find((b) => b.id === id)
    if (!current || current.zone === zone) return
    onChange({ ...layout, blocks: [...layout.blocks.filter((b) => b.id !== id), { ...current, zone }] })
  }

  const renderZone = (zone: BlockZone): JSX.Element => {
    const items = layout.blocks.filter((b) => b.zone === zone)
    return (
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t(zone === 'left' ? 'srv.dash.layout.columnLeft' : 'srv.dash.layout.columnRight')}</div>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">—</div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {items.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                <Toggle checked={b.visible} onChange={(visible) => patchBlock(b.id, { visible })} label={blockName(b.id)} className="min-w-[150px] flex-1" />
                <Segmented<BlockZone>
                  value={b.zone}
                  options={[
                    { value: 'left', label: t('srv.dash.layout.zoneLeft') },
                    { value: 'right', label: t('srv.dash.layout.zoneRight') }
                  ]}
                  onChange={(next) => setZone(b.id, next)}
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" icon={<ArrowUp size={14} />} disabled={i === 0} title={t('srv.dash.layout.moveUp')} onClick={() => move(b.id, -1)} />
                  <Button variant="ghost" size="sm" icon={<ArrowDown size={14} />} disabled={i === items.length - 1} title={t('srv.dash.layout.moveDown')} onClick={() => move(b.id, 1)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <Modal
      open={open}
      title={t('srv.dash.layout.title')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => onChange(defaultLayout())}>
            {t('srv.dash.layout.reset')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('srv.dash.layout.done')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <Section title={t('srv.dash.layout.cardSize')}>
            <Segmented<CardSize>
              value={layout.cardSize}
              options={[
                { value: 'small', label: t('srv.dash.layout.small') },
                { value: 'medium', label: t('srv.dash.layout.medium') },
                { value: 'large', label: t('srv.dash.layout.large') }
              ]}
              onChange={(cardSize) => onChange({ ...layout, cardSize })}
            />
          </Section>
          <Section title={t('srv.dash.layout.chartRange')}>
            <Segmented<ChartMinutes>
              value={layout.chartMinutes}
              options={CHART_MINUTES.map((m) => ({ value: m, label: t('srv.dash.layout.minutes', { n: m }) }))}
              onChange={(chartMinutes) => onChange({ ...layout, chartMinutes })}
            />
          </Section>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-fg">{t('srv.dash.layout.sections')}</div>
          <p className="mb-2 text-xs text-muted">{t('srv.dash.layout.sectionsHint')}</p>
          <div className="flex flex-col gap-3">
            {renderZone('left')}
            {renderZone('right')}
          </div>
        </div>
      </div>
    </Modal>
  )
}
