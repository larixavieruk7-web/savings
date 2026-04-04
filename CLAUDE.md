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

### Cross-Cutting Changes
Before touching ANY file that is referenced in multiple places, grep the entire codebase for every affected pattern. Build the complete file inventory. Fix everything in ONE pass. Re-grep to verify zero misses.

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
Invoke `frontend-design` skill in the **main conversation** before writing UI for new pages, components, or significant visual redesigns. Subagents cannot call skills — invoke first, then pass design guidance into agent prompts.

## TOKEN EFFICIENCY

Main session: Sonnet 4.6, medium effort.

### Agent model routing

| Agent type | Model | When |
|------------|-------|------|
| `Explore` | **haiku** | Simple lookups: find a file, grep a pattern, list a folder |
| `Explore` | **sonnet** | Deep exploration: understand how a feature works, trace data flow |
| `Plan` | **sonnet** | Architecture and implementation planning |
| `general-purpose` | **sonnet** | Research, multi-step investigation |
| `codex:codex-rescue` | GPT-5.4 | New files, multi-file implementations, large additions |

### Code task routing

| Task | Who | Claude review? |
|------|-----|----------------|
| New file with clear spec (component, API route, migration, script) | Codex | No — user tests it |
| Multi-file feature | Codex `--background` | No — user tests it |
| Security-critical code (RLS, CSRF, auth, money math) | Claude directly | N/A |
| Small edits / wiring / bug fixes < 20 lines | Claude directly | N/A |
| Architecture decisions | Claude directly | N/A |

**Codex rule:** Write a tight spec → delegate to `codex:codex-rescue` → do NOT review output → user tests. Only pull back to Claude if something breaks or needs wiring.

## AUTOMATION FIRST

Before doing anything manually, ask: **can Playwright or a script do this?**
- Screenshots, form filling, web research, data extraction → Playwright (`/playwright-cli`)
- Repetitive tasks → script it, don't repeat it
- If something will be done more than once, automate it the first time

## CONTEXT MANAGEMENT
When context is getting long, proactively:
1. Commit all work in progress
2. Update any TO-DO or tracking doc with remaining items
3. Write `docs/handoffs/<feature-name>.md` if mid-feature
4. Tell user what to paste to start the next chat
5. Stop working

User can run `/check-context` to trigger this protocol.

## FOLDER CLAUDE.md MAINTENANCE
When modifying files in a directory with a `CLAUDE.md`:
- If your change contradicts it, update in the same commit
- If you add a non-obvious pattern, add it
- If it references a deleted file, remove or correct it

## LAYERING PATTERN

Project `CLAUDE.md` = global rules that apply everywhere.
Folder `CLAUDE.md` = local rules for that subdirectory only.

Example folder CLAUDE.mds to create as the project grows:
- `src/app/api/CLAUDE.md` — API route conventions, auth guards, response format, OpenAI frugality rules
- `src/app/api/<feature>/CLAUDE.md` — feature-specific quirks
- `src/components/CLAUDE.md` — component patterns, dark mode requirements
- `src/lib/CLAUDE.md` — utility patterns, what not to put here
