'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { getUserEmail, signOut } from '@/lib/supabase/storage'

export function UserProfile() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    getUserEmail().then(setEmail)
  }, [])

  if (!email) return null

  const initial = email[0].toUpperCase()

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    router.push('/login')
  }

  return (
    <div className="flex items-center gap-3 group">
      <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-semibold shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{email}</p>
      </div>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
