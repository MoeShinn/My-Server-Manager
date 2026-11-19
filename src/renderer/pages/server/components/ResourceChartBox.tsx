import { useEffect, useId, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ServerConfig } from '@shared/types'
import { useT } from '@/i18n'
import { Box } from '@/components/ui'
import { useStatsHistory } from '@/layout/statsHistory'
import type { StatPoint } from '@/layout/statsHistory'
import { formatMb } from '../utils'

interface Props {
  config: ServerConfig
  /** How many minutes of history the chart shows. */
  minutes: number
}

const HEIGHT = 190
const PAD = { top: 10, right: 12, bottom: 22, left: 38 }
const GRID = [0, 25, 50, 75, 100]
const RAM_COLOR = 'var(--info)'
const CPU_COLOR = 'var(--warning)'

function Legend({ color, label, value }: { color: string; label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export default function ResourceChartBox({ config, minutes }: Props): JSX.Element {
  const t = useT()
  const uid = useId().replace(/:/g, '')
  const points = useStatsHistory(config.id)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ramMax = Math.max(1, config.settings.ramMb)
  const windowMs = minutes * 60_000
  const last = points.length > 0 ? points[points.length - 1] : null
  const tEnd = last ? last.t : Date.now()
  const tStart = tEnd - windowMs
  const visible: StatPoint[] = points.filter((p) => p.t >= tStart - 3000)

  const plotW = Math.max(10, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (time: number): number => PAD.left + Math.min(1, Math.max(0, (time - tStart) / windowMs)) * plotW
  const y = (pct: number): number => PAD.top + (1 - Math.min(100, Math.max(0, pct)) / 100) * plotH
  const ramPct = (p: StatPoint): number => (p.ramMb / ramMax) * 100

  const line = (value: (p: StatPoint) => number): string =>
    visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(value(p)).toFixed(1)}`).join(' ')
  const area = (value: (p: StatPoint) => number): string => {
    if (visible.length < 2) return ''
    const first = visible[0]
    const end = visible[visible.length - 1]
    return `${line(value)} L${x(end.t).toFixed(1)} ${y(0)} L${x(first.t).toFixed(1)} ${y(0)} Z`
  }

  const onMove = (e: MouseEvent<SVGSVGElement>): void => {
    if (visible.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    let best = 0
    let bestDist = Infinity
    visible.forEach((p, i) => {
      const d = Math.abs(x(p.t) - mx)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    setHover(best)
  }

  const hovered = hover !== null && hover < visible.length ? visible[hover] : null
  const shown = hovered ?? last
  const agoSec = hovered ? Math.round((tEnd - hovered.t) / 1000) : 0
  const agoText = agoSec <= 0 ? t('srv.dash.chart.now') : agoSec < 60 ? t('srv.dash.chart.secondsAgo', { n: agoSec }) : t('srv.dash.chart.minutesAgo', { n: Math.round(agoSec / 60) })
  const tipLeft = hovered ? Math.min(Math.max(0, x(hovered.t) + 12), Math.max(0, width - 170)) : 0

  return (
    <Box title={t('srv.dash.chart.title')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 8 }}>
        <Legend
          color={RAM_COLOR}
          label={t('srv.dash.ram')}
          value={shown ? `${formatMb(shown.ramMb)} / ${formatMb(ramMax)} (${Math.round(ramPct(shown))}%)` : '—'}
        />
        <Legend color={CPU_COLOR} label={t('srv.dash.cpu')} value={shown ? `${shown.cpu.toFixed(1)}%` : '—'} />
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
            <defs>
              <linearGradient id={`${uid}-ram`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: RAM_COLOR, stopOpacity: 0.32 }} />
                <stop offset="100%" style={{ stopColor: RAM_COLOR, stopOpacity: 0.02 }} />
              </linearGradient>
              <linearGradient id={`${uid}-cpu`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: CPU_COLOR, stopOpacity: 0.28 }} />
                <stop offset="100%" style={{ stopColor: CPU_COLOR, stopOpacity: 0.02 }} />
              </linearGradient>
            </defs>

            {GRID.map((g) => (
              <g key={g}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(g)} y2={y(g)} style={{ stroke: 'var(--border)' }} strokeDasharray={g === 0 ? undefined : '3 4'} />
                <text x={PAD.left - 6} y={y(g) + 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--muted)' }}>
                  {g}%
                </text>
              </g>
            ))}
            <text x={PAD.left} y={HEIGHT - 6} fontSize={10} textAnchor="start" style={{ fill: 'var(--muted)' }}>
              {t('srv.dash.chart.minutesAgo', { n: minutes })}
            </text>
            <text x={width - PAD.right} y={HEIGHT - 6} fontSize={10} textAnchor="end" style={{ fill: 'var(--muted)' }}>
              {t('srv.dash.chart.now')}
            </text>

            {visible.length > 1 && (
              <>
                <path d={area(ramPct)} fill={`url(#${uid}-ram)`} />
                <path d={area((p) => p.cpu)} fill={`url(#${uid}-cpu)`} />
                <path d={line(ramPct)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: RAM_COLOR }} />
                <path d={line((p) => p.cpu)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: CPU_COLOR }} />
              </>
            )}

            {last && !hovered && (
              <>
                <circle cx={x(last.t)} cy={y(ramPct(last))} r={3.5} style={{ fill: RAM_COLOR }} />
                <circle cx={x(last.t)} cy={y(last.cpu)} r={3.5} style={{ fill: CPU_COLOR }} />
              </>
            )}

            {hovered && (
              <>
                <line x1={x(hovered.t)} x2={x(hovered.t)} y1={PAD.top} y2={PAD.top + plotH} style={{ stroke: 'var(--muted)' }} strokeDasharray="3 3" />
                <circle cx={x(hovered.t)} cy={y(ramPct(hovered))} r={4.5} strokeWidth={2} style={{ fill: 'var(--panel)', stroke: RAM_COLOR }} />
                <circle cx={x(hovered.t)} cy={y(hovered.cpu)} r={4.5} strokeWidth={2} style={{ fill: 'var(--panel)', stroke: CPU_COLOR }} />
              </>
            )}
          </svg>
        )}

        {hovered && (
          <div
            style={{
              position: 'absolute',
              top: PAD.top,
              left: tipLeft,
              pointerEvents: 'none',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              lineHeight: 1.5,
              minWidth: 140,
              boxShadow: '0 4px 14px rgb(0 0 0 / 0.25)'
            }}
          >
            <div style={{ color: 'var(--muted)' }}>{agoText}</div>
            <div>
              <span style={{ color: RAM_COLOR }}>●</span> {t('srv.dash.ram')}: {formatMb(hovered.ramMb)} ({Math.round(ramPct(hovered))}%)
            </div>
            <div>
              <span style={{ color: CPU_COLOR }}>●</span> {t('srv.dash.cpu')}: {hovered.cpu.toFixed(1)}%
            </div>
          </div>
        )}

        {points.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: `${PAD.top}px ${PAD.right}px ${PAD.bottom}px ${PAD.left}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--muted)',
              pointerEvents: 'none'
            }}
          >
            {t('srv.dash.chart.waiting')}
          </div>
        )}
      </div>
    </Box>
  )
}
