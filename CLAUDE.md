# Savings Dashboard — Instructions

## HARD GATES

### Ownership — NEVER Cross Boundaries
- NEVER invoke MCP tools `mcp__claude_ai_Supabase__*` or `mcp__claude_ai_Vercel__*` — authed to Gus's account
- ALWAYS use CLI (`npx supabase`, `vercel`, `gh`) — authed to Larissa's account
- NEVER push to any repo other than `larixavieruk7-web/savings`

### Money Invariants
- Amounts stored as **integers (pence)** — NEVER floats
- **Negative = money out, positive = money in** — NEVER reverse
- Display: `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })` ONLY

### Security
- NEVER expose `OPENAI_API_KEY` client-side — all OpenAI calls via `src/app/api/` routes
- NEVER push to remote unless user explicitly asks
- OTP auth only, 3 allowed emails: `lari_uk@gmail.com`, `larixavieruk7@gmail.com`, `gusampteam@hotmail.com`

### Page Conventions
- `'use client'` on ALL pages
- Auto-save everything — no manual save buttons, write to localStorage/Supabase on change

## IDs (do not guess)
- Supabase: `ekqpsozlqjmjlwzzpyxp`
- Vercel: `savings-lovat.vercel.app` (team: `larixavieruk7-1666s-projects`)
- GitHub: `larixavieruk7-web/savings`
- GitHub CLI: `"/c/Program Files/GitHub CLI/gh.exe"` or `gh`

## HOUSEHOLD
- Larissa: MRS LARISSA DA SILVA, Amex -21013
- Gus: G XAVIER DA SILVA, Amex -21005
- Both have NatWest accounts

## UNIVERSAL GOTCHAS
1. Amex Amount is POSITIVE for charges — parser flips to negative. NatWest is already signed correctly.
2. `params` and `searchParams` must be awaited in Next.js App Router
3. `useSearchParams()` requires `<Suspense>` wrapper
4. Send spending SUMMARIES to OpenAI, not raw transactions — shared key, be frugal
5. Categorization order: Custom rules → Keyword rules → Amex mapping → GPT — never skip
6. Salary cycles run 23rd–22nd, not calendar months

## CLI (authed to Larissa — NEVER use MCP)
- Supabase: `npx supabase db query --linked "SQL"`
- Vercel: `vercel ls`, `vercel env add/rm/ls`, `vercel --prod`
- GitHub: `git push origin main`, `gh pr create/status`

## COMMANDS
```bash
npm run dev        # http://localhost:3000
npm run build
npm run lint
```

## FRONTEND DESIGN
Invoke `frontend-design` skill before writing UI for new pages, components, or significant visual redesigns.

## CONTEXT MANAGEMENT
When context is long: commit work, note remaining items, tell user what to paste next session.

## FOLDER CLAUDE.md MAINTENANCE
When modifying files in a directory with a `CLAUDE.md`:
- If your change contradicts it, update in the same commit
- If you add a non-obvious pattern, add it
- If it references a deleted file, remove or correct it
