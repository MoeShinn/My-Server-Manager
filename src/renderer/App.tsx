import { useEffect } from 'react'
import { HashRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { ToastProvider } from '@/components/ui'
import { GlobalDialogs } from '@/layout/GlobalDialogs'
import { Layout } from '@/layout/Layout'
import { initStores, useSettingsStore } from '@/layout/stores'
import AppRoutes from './routes'

export default function App(): JSX.Element {
  // Stores are initialised exactly once here.
  useEffect(() => initStores(), [])
  const theme = useSettingsStore((s) => s.settings?.theme)
  const ready = useSettingsStore((s) => s.settings !== null)

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    )
  }

  return (
    <I18nProvider>
      <ToastProvider>
        <HashRouter>
          <Layout>
            <AppRoutes />
          </Layout>
          <GlobalDialogs />
        </HashRouter>
      </ToastProvider>
    </I18nProvider>
  )
}
