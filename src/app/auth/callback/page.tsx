'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const handleCallback = async () => {
      const supabase = createClient()
      const params = new URLSearchParams(window.location.search)

      // 1. Primary: token_hash verification (magic link)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'magiclink' | 'email',
        })

        if (error) {
          console.error('Token hash verification failed:', error.message)
          window.location.href = '/login?error=expired'
          return
        }

        window.location.href = '/'
        return
      }

      // 2. Fallback: PKCE code exchange
      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          window.location.href = '/'
          return
        }
        console.error('Code exchange failed:', error.message)
      }

      // 3. Fallback: implicit flow tokens in hash fragment
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          window.location.href = '/login?error=expired'
          return
        }

        window.history.replaceState(null, '', window.location.pathname)
        window.location.href = '/'
        return
      }

      // Nothing to process — expired or invalid link
      window.location.href = '/login?error=expired'
    }

    handleCallback()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[var(--muted)] text-sm">Signing you in...</p>
      </div>
    </div>
  )
}
