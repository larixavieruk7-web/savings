import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    const safari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
    setIsIOS(ios && safari)
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)
    try {
      setIsDismissed(localStorage.getItem('savings-install-dismissed') === '1')
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (isStandalone) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [isStandalone])

  const canInstall = !isStandalone && !isDismissed && !!deferredPrompt
  const showIOSInstructions = !isStandalone && !isDismissed && isIOS

  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    }
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    setIsDismissed(true)
    try { localStorage.setItem('savings-install-dismissed', '1') } catch { /* ignore */ }
  }, [])

  const undismiss = useCallback(() => {
    setIsDismissed(false)
    try { localStorage.removeItem('savings-install-dismissed') } catch { /* ignore */ }
  }, [])

  return {
    canInstall,
    showIOSInstructions,
    isStandalone,
    isDismissed,
    isIOS,
    deferredPrompt,
    promptInstall,
    dismiss,
    undismiss,
  }
}
