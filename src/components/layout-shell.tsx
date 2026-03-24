'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TransactionProvider } from '@/context/transactions'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthRoute) {
    return <>{children}</>
  }

  return (
    <TransactionProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </TransactionProvider>
  )
}
