import { useSyncExternalStore } from 'react'
import { api } from '@/api'

/** One sample of a running server's resource usage (the main process sends one every 3 seconds). */
export interface StatPoint {
  t: number
  cpu: number
  ramMb: number
}

/** 10 minutes at one sample per 3 seconds. */
const MAX_POINTS = 200
const EMPTY: readonly StatPoint[] = []

const history = new Map<string, readonly StatPoint[]>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const cb of [...listeners]) cb()
}

/**
 * Starts collecting samples for every server while the app is open, so a chart already has history
 * when you open a server's dashboard. History is cleared when a server stops. Returns the cleanup function.
 */
export function startStatsHistory(): () => void {
  const offStats = api.on('server:stats', (p) => {
    const prev = history.get(p.id) ?? EMPTY
    const point: StatPoint = { t: Date.now(), cpu: p.stats.cpuPercent, ramMb: p.stats.ramUsedMb }
    history.set(p.id, [...prev.slice(-(MAX_POINTS - 1)), point])
    notify()
  })
  const offStatus = api.on('server:status', (p) => {
    if (p.status === 'running' || p.status === 'starting' || p.status === 'stopping') return
    if (history.delete(p.id)) notify()
  })
  return () => {
    offStats()
    offStatus()
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useStatsHistory(id: string): readonly StatPoint[] {
  return useSyncExternalStore(subscribe, () => history.get(id) ?? EMPTY)
}
