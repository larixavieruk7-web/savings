'use client'

interface PWAInstallBannerProps {
  canInstall: boolean
  showIOSInstructions: boolean
  isStandalone: boolean
  isDismissed: boolean
  onInstall: () => void
  onDismiss: () => void
}

export function PWAInstallBanner({
  canInstall,
  showIOSInstructions,
  isStandalone,
  isDismissed,
  onInstall,
  onDismiss,
}: PWAInstallBannerProps) {
  if (isStandalone || isDismissed || (!canInstall && !showIOSInstructions)) return null

  return (
    <div className="md:hidden animate-fade-in-up">
      <div className="overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-md">
              <span className="text-lg font-bold text-white">S</span>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                Install Savings Dashboard
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-gray-400">
                {canInstall
                  ? 'Faster access with a native app experience'
                  : 'Add to your Home Screen for quick access'}
              </p>
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-slate-600"
              aria-label="Dismiss install banner"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {canInstall ? (
            <div className="mt-3 ml-14">
              <button
                type="button"
                onClick={onInstall}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Install App
              </button>
            </div>
          ) : (
            <div className="mt-3 ml-14">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">How to install:</p>
                <ol className="mt-1 list-inside list-decimal space-y-1 text-xs text-blue-700 dark:text-blue-400">
                  <li>
                    Tap the <strong>Share</strong> button in Safari
                    <svg className="ml-1 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                </ol>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="mt-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
