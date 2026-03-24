# API Routes

## HARD GATE: Never Expose the Key
`OPENAI_API_KEY` is server-only. Never import or reference it in any `'use client'` file.
All AI calls must go through these routes — never call OpenAI directly from the browser.

## Routes
| Route | Purpose |
|-------|---------|
| `categorize/` | GPT-4o batch categorization — 150 tx/batch, runs in parallel |
| `insights/` | Anomaly detection + AI savings suggestions |
| `chat/` | Conversational AI with spending summary + knowledge bank context |
| `parse-csv/` | Universal CSV parser with GPT column-detection fallback |
| `analyse/` | AI monthly financial analysis — sends full cycle data to GPT for structured pushback |

## Cost Control (key shared with Distil — be frugal)
- `categorize`: ~$0.01-0.03 per batch of 150 transactions
- `insights`: ~$0.01-0.02 per run
- `chat`: ~$0.01-0.03 per message
- `analyse`: ~$0.02-0.05 per analysis (richer prompt, cached per cycle in localStorage)
- Always send spending **summaries** not raw transaction arrays
- Full import + insights run should stay under $0.20 total

## Patterns
- Use `src/lib/ai/retry.ts` for all OpenAI calls — handles 429 rate limits with exponential backoff
- Return `{ error: string }` on failures — never expose stack traces or raw OpenAI errors
- Batch size for categorization: 150 transactions max per API call

## Supabase Integration (when migrating from localStorage)
- Use `createClient()` from `src/lib/supabase/server.ts` for server-side Supabase access in API routes
- Auth context is available via `supabase.auth.getUser()` — use `user.id` as `user_id` for RLS
- NEVER use the Supabase MCP tools — use the CLI (`npx supabase`) for database operations (see root CLAUDE.md)
