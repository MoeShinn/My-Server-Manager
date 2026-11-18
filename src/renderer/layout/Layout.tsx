import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-full bg-bg text-fg">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
