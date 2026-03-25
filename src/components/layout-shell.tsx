'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TransactionProvider } from '@/context/transactions'
import { runMigrationIfNeeded, type MigrationProgress } from '@/lib/supabase/migration'
import { cleanupBackups } from '@/lib/storage-local'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth/')

  const [migrationDone, setMigrationDone] = useState(false)
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null)

  useEffect(() => {
    if (isAuthRoute) return

    async function checkMigration() {
      await runMigrationIfNeeded(setMigrationProgress)
      setMigrationDone(true)
      cleanupBackups()
    }
    checkMigration()
  }, [isAuthRoute])

  if (isAuthRoute) {
    return <>{children}</>
  }

  if (!migrationDone) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        {migrationProgress?.status === 'migrating' ? (
          <div className="text-center">
            <p className="text-lg font-medium">{migrationProgress.message}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {migrationProgress.current} / {migrationProgress.total}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Loading...</p>
        )}
      </div>
    )
  }

  return (
    <TransactionProvider>
      {migrationProgress?.status === 'error' && (
        <div className="bg-red-600 text-white text-sm px-4 py-2 text-center">
          {migrationProgress.message}
        </div>
      )}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </TransactionProvider>
  )
}
