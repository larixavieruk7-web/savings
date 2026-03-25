# Context Essentials (re-injected after compaction)

## Critical Rules — Violating These Causes Real Damage
- NEVER use MCP tools `mcp__claude_ai_Supabase__*` or `mcp__claude_ai_Vercel__*` — authed to wrong account
- ALWAYS use CLI: `npx supabase`, `vercel`, `gh` — authed to Larissa's account
- Amounts are integers (pence), negative = out, positive = in — NEVER floats or reversed
- Display money: `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })`
- NEVER expose `OPENAI_API_KEY` client-side — all AI calls via `src/app/api/` routes
- NEVER push to remote unless user explicitly asks
- `'use client'` on all pages — auto-save on change, no save buttons

## Framework Gotchas
- Amex Amount is POSITIVE for charges — parser flips to negative
- `params`/`searchParams` must be awaited in Next.js App Router
- Categorization: Custom rules → Keyword rules → Amex mapping → GPT (never skip)
- Salary cycles run 23rd–22nd, not calendar months

## IDs (do not guess)
- Supabase: `ekqpsozlqjmjlwzzpyxp`
- Vercel: `savings-lovat.vercel.app`
- GitHub: `larixavieruk7-web/savings`
