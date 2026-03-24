# PWA Pattern — Savings Dashboard

Turn the Savings Dashboard into an installable Progressive Web App.
Adapted from Distil's production PWA setup.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `public/site.webmanifest` | PWA manifest (app name, icons, display mode) |
| `src/hooks/usePWAInstall.ts` | Detect install eligibility, platform (iOS/Android) |
| `src/hooks/useVersionCheck.ts` | Detect stale cached versions after deployment |
| `src/components/dashboard/PWAInstallBanner.tsx` | Mobile-only install prompt |
| `src/app/api/version/route.ts` | Return current build timestamp |
| `src/app/layout.tsx` | Add manifest link + apple-web-app meta tags |
| `next.config.ts` | Add NEXT_PUBLIC_BUILD_TIMESTAMP env var |

## How It Works

1. User visits the app on mobile
2. Browser fires `beforeinstallprompt` event (Android/Chrome)
3. Hook captures event, banner shows "Install App" button
4. On iOS/Safari, banner shows manual "Add to Home Screen" instructions
5. After install, app runs in standalone mode (no browser chrome)
6. `useVersionCheck` polls `/api/version` on visibility change to detect updates

## Icons Needed

Create 192x192 and 512x512 PNG icons in `public/icons/`:
- `icon-192.png`
- `icon-512.png`

Can be generated from any source image using an online PWA icon generator.
