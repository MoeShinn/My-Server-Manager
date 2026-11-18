import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getErrorCode, getErrorParams } from '@/api'
import { useSettingsStore } from '@/layout/stores'

type Params = Record<string, string | number>
type TFunction = (key: string, params?: Params) => string

const I18nContext = createContext<TFunction | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const language = useSettingsStore((s) => s.settings?.language ?? 'en')
  const reloadToken = useSettingsStore((s) => s.reloadToken)
  const [dict, setDict] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    api.language
      .getDictionary(language)
      .then((d) => {
        if (!cancelled) setDict(d)
      })
      .catch((err) => {
        console.error('Cannot load dictionary', err)
        if (!cancelled) setDict((prev) => prev ?? {})
      })
    return () => {
      cancelled = true
    }
  }, [language, reloadToken])

  const t = useMemo<TFunction>(
    () => (key, params) => {
      const text = dict?.[key] ?? key
      if (!params) return text
      return text.replace(/\{([^{}]+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
    },
    [dict]
  )

  if (!dict) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    )
  }
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>
}

export function useT(): TFunction {
  const t = useContext(I18nContext)
  if (!t) throw new Error('useT must be used inside I18nProvider')
  return t
}

/** Turns any thrown value into a friendly translated message (errors.<code>). */
export function useErrorText(): (err: unknown) => string {
  const t = useT()
  return useCallback((err: unknown) => t(`errors.${getErrorCode(err)}`, getErrorParams(err)), [t])
}
