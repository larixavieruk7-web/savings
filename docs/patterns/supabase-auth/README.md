# Supabase OTP Authentication Pattern

Reference implementation for adding Supabase OTP (magic link) authentication to the Savings Dashboard.
Adapted from Distil's production auth system, simplified for personal use (2 users, no teams/subscriptions).

## Architecture Overview

```
Login Page (email input)
  → Supabase signInWithOtp() sends magic link email
  → User clicks link OR enters OTP code manually
  → /auth/callback verifies token
  → Redirects to dashboard
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/supabase/client.ts` | Browser-side Supabase client |
| `src/lib/supabase/server.ts` | Server-side Supabase client (async) |
| `src/lib/supabase/middleware.ts` | Session refresh on every request |
| `src/lib/security/csrf.ts` | CSRF token generation + validation |
| `src/app/login/page.tsx` | Login page with email + OTP code entry |
| `src/app/auth/callback/page.tsx` | Magic link callback handler |
| `src/app/api/csrf-token/route.ts` | GET endpoint to issue CSRF tokens |
| `src/app/api/version/route.ts` | GET endpoint for PWA version checking |
| `middleware.ts` | Next.js middleware (session refresh + auth redirect) |

## Environment Variables Needed

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase Project Setup

1. Create project at supabase.com (use Larissa's Gmail)
2. Go to Authentication → Email Templates → Magic Link
3. Update the template to use `{{ .TokenHash }}` and `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink`
4. Go to Authentication → URL Configuration → set Site URL to your Vercel domain
5. Add `http://localhost:3000` to Redirect URLs for local dev

## Migration Path

1. Install deps: `npm install @supabase/supabase-js @supabase/ssr`
2. Copy the pattern files into your project
3. Create the Supabase tables (see migration guide)
4. Add environment variables to `.env.local`
5. Update layout.tsx to use middleware
6. Gradually move localStorage reads to Supabase queries

## Key Differences from Distil

- No subscription checking — all authenticated users get full access
- No practice/team concept — just user_id on all tables
- No invitation flow — manually add allowed emails in Supabase Auth
- Simpler middleware — just session refresh + auth redirect
