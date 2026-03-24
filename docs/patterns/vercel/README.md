# Vercel Hosting Pattern — Savings Dashboard

Configuration for deploying the Savings Dashboard to Vercel with security headers.

## Setup Steps

1. Create a Vercel account using Larissa's Gmail
2. Connect the GitHub repo to Vercel
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
4. Deploy — Vercel auto-detects Next.js

## Files

| File | Purpose |
|------|---------|
| `vercel.json` | Deployment config + function timeouts |
| `next.config.ts` | Security headers + build timestamp for PWA |

## Custom Domain (Optional)

1. Buy a domain or use Vercel's free `.vercel.app` subdomain
2. Add domain in Vercel project settings → Domains
3. Update Supabase Auth → URL Configuration → Site URL to match
