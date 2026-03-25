# API Routes

## HARD GATE
`OPENAI_API_KEY` is server-only. Never import in `'use client'` files. All AI calls go through these routes.

## Cost Control (key shared with Distil)
- categorize: ~$0.01-0.03 per 150-tx batch
- insights/chat: ~$0.01-0.03 per call
- analyse: ~$0.02-0.05 per analysis (cached per cycle)
- advisor/briefing: ~$0.02-0.05 per briefing (upload/weekly/monthly types)
- advisor/targets: ~$0.01-0.03 per target suggestion call
- Always send spending **summaries** not raw transaction arrays
- Full import + insights should stay under $0.20 total

## Patterns
- Use `src/lib/ai/retry.ts` for all OpenAI calls — handles 429 rate limits
- Return `{ error: string }` on failures — never expose stack traces
- Batch size: 150 transactions max per API call
- Server-side Supabase: `createClient()` from `src/lib/supabase/server.ts`
