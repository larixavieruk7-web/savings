import { useState, useEffect, useCallback, useRef } from 'react'

const CLIENT_VERSION = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || ''
const CHECK_COOLDOWN_MS = 60_000

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const lastCheckRef = useRef(0)

  const checkVersion = useCallback(async () => {
    if (updateAvailable) return
    if (Date.now() - lastCheckRef.current < CHECK_COOLDOWN_MS) return
    lastCheckRef.current = Date.now()

    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data.version && data.version !== CLIENT_VERSION) {
        setUpdateAvailable(true)
      }
    } catch {
      // Network error — ignore silently
    }
  }, [updateAvailable])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    checkVersion()

    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [checkVersion])

  const refresh = useCallback(() => {
    window.location.reload()
  }, [])

  return { updateAvailable, refresh }
}
