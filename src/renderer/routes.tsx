import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from '@/components/ui'
import Dashboard from '@/pages/Dashboard/Dashboard'
import ServerList from '@/pages/ServerList/ServerList'
import CreateServer from '@/pages/CreateServer/CreateServer'

// Pages owned by other parts are lazy-loaded (keeps Monaco etc. out of the first paint).
const Settings = lazy(() => import('@/pages/Settings/Settings'))
const ServerDashboard = lazy(() => import('@/pages/server/ServerDashboard'))
const PluginsMods = lazy(() => import('@/pages/PluginsMods/PluginsMods'))
const Players = lazy(() => import('@/pages/server/Players'))
const Files = lazy(() => import('@/pages/Files/Files'))
const StartOptions = lazy(() => import('@/pages/server/StartOptions'))
const ServerIp = lazy(() => import('@/pages/server/ServerIp'))
const Properties = lazy(() => import('@/pages/server/Properties'))

export default function AppRoutes(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center">
          <Spinner size={22} />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/servers" element={<ServerList />} />
        <Route path="/servers/new" element={<CreateServer />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/server/:id" element={<ServerDashboard />} />
        <Route path="/server/:id/plugins" element={<PluginsMods />} />
        <Route path="/server/:id/players" element={<Players />} />
        <Route path="/server/:id/files" element={<Files />} />
        <Route path="/server/:id/start" element={<StartOptions />} />
        <Route path="/server/:id/ip" element={<ServerIp />} />
        <Route path="/server/:id/properties" element={<Properties />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
