import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useT } from '@/i18n'
import { cn } from './cn'
import { normalizeText } from './text'

export interface SelectOption {
  value: string
  label: ReactNode
  /** CSS color applied to the label. */
  color?: string
  /** Text used by the search box when label is not a string. */
  searchText?: string
}

export interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  searchable?: boolean
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  id?: string
}

export function Select({ value, options, onChange, searchable, placeholder, disabled, invalid, className, id }: SelectProps): JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim())
    if (!q) return options
    return options.filter((o) => normalizeText(o.searchText ?? (typeof o.label === 'string' ? o.label : o.value)).includes(q))
  }, [options, query])

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(Math.max(0, options.findIndex((o) => o.value === value)))
      if (searchable) setTimeout(() => searchRef.current?.focus(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(v: string): void {
    onChange(v)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (!open) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[active]
      if (opt) choose(opt.value)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-bg px-3 text-left text-sm text-fg disabled:opacity-50',
          invalid ? 'border-danger' : open ? 'border-accent' : 'border-line hover:border-muted'
        )}
      >
        <span className="min-w-0 flex-1 truncate" style={selected?.color ? { color: selected.color } : undefined}>
          {selected ? selected.label : <span className="text-muted">{placeholder ?? ''}</span>}
        </span>
        <ChevronDown size={15} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {searchable && (
            <div className="border-b border-line p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder={t('common.search')}
                className="h-8 w-full rounded-md border border-line bg-bg px-2 text-sm text-fg placeholder:text-muted/70 focus:border-accent"
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('common.noResults')}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
                className={cn('flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm text-fg', i === active && 'bg-panel-2')}
              >
                <span className="min-w-0 flex-1 truncate" style={o.color ? { color: o.color } : undefined}>
                  {o.label}
                </span>
                {o.value === value && <Check size={14} className="shrink-0 text-accent" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
