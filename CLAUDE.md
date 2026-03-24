# Savings Dashboard — Claude Code Instructions

## HARD GATES

### Ownership & Isolation — NEVER Cross Boundaries

This project belongs to **Larissa** (larixavieruk7-web). The Claude Code account is shared with Gus (Haisem), who has his own separate projects (e.g., Distil).

**Larissa's resources (THIS project — the ONLY ones Claude may touch):**
- **GitHub**: `larixavieruk7-web/savings`
- **Supabase**: project ref `ekqpsozlqjmjlwzzpyxp` (https://ekqpsozlqjmjlwzzpyxp.supabase.co)
- **Vercel**: `savings-lovat.vercel.app` (team: `larixavieruk7-1666s-projects`)

**Off-limits (Gus's / any other account):**
- Any Supabase project that is NOT `ekqpsozlqjmjlwzzpyxp`
- Any Vercel project that is NOT `savings-lovat.vercel.app`
- Any GitHub repo that is NOT `larixavieruk7-web/savings`

**Tooling split:**
- **MCP** (Supabase/Vercel) = authed to Gus's account — DO NOT USE for this project
- **CLI** (`npx supabase`, `vercel`) = authed to Larissa's account — USE THESE for all Supabase/Vercel operations

**Rules:**
- NEVER use MCP tools (`mcp__claude_ai_Supabase__*`, `mcp__claude_ai_Vercel__*`) for this project
- ALWAYS use CLI commands (`npx supabase`, `vercel`) for Supabase/Vercel operations
- NEVER push to any repo other than `larixavieruk7-web/savings`
- If an MCP tool is accidentally invoked and returns data from Gus's projects, STOP and warn the user
- The OpenAI API key is shared — remain cost-conscious but it is the ONLY shared resource

### Money Invariants — NEVER Violate
- Amounts stored as **integers (pence)** — NEVER floats
- **Negative = money out, positive = money in** — NEVER reverse this convention
- Monetary display: `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })` ONLY

### Security
- NEVER expose `OPENAI_API_KEY` client-side — all OpenAI calls go through `src/app/api/` routes
- NEVER push to remote unless the user explicitly asks

### Page Conventions
- `'use client'` on ALL pages — everything uses localStorage which is client-only
- Auto-save everything — no manual save buttons; write to localStorage immediately on change

### Frontend Design Skill — INVOKE BEFORE WRITING UI
Invoke the `frontend-design` skill in the MAIN conversation before writing frontend code for:
new pages, new components, significant visual redesigns, or any non-trivial UI work.
**Subagents cannot call skills** — invoke in the main conversation FIRST, then pass guidance to agents.

---

## DECISION TREES

### When to Use Plan Mode
Use Plan mode when ANY of these are true:
- Task touches 3+ files across different directories
- Task adds a new CSV bank format or changes parsing logic
- Task changes categorization priority order or adds new category types
- Task is a new page or significant new feature
- You are unsure about the approach

Skip for: single-file fixes, style tweaks, copy changes, adding keyword rules.

### When to Use Agent Teams
Use agent teams when ALL of these are true:
- 2+ workstreams with NO shared files
- Each workstream describable in <3 sentences
- No workstream depends on another's output

Bad split example: CSV parser + categorizer hook + upload page (sequential dependency).

### Context Management
When context is getting long (many tool calls, large file reads), proactively:
1. Commit work in progress
2. Note remaining items
3. Tell user what to paste into the next session

---

## PROJECT CONTEXT

- **Household**: Larissa (MRS LARISSA DA SILVA, Amex ending -21013) and Gus (G XAVIER DA SILVA, Amex ending -21005) — both have NatWest accounts
- **Purpose**: Personal use, single machine — localStorage only, no database, no auth
- **OpenAI key**: Shared with Distil project — be cost-conscious, send summaries not raw data

---

## ARCHITECTURE ESSENTIALS

- **Storage**: localStorage only — no Supabase, no DB (see `src/lib/CLAUDE.md` for key names)
- **AI**: Server-side only via `src/app/api/` routes (categorize, insights, chat, parse-csv, analyse)
- **CSV sources**: NatWest + Amex — **different sign conventions** (see `src/lib/csv/CLAUDE.md`)
- **Dedup**: Transaction IDs include account number to handle multi-account CSVs
- **Dates**: Always stored as ISO 8601 strings
- **Account hierarchy**: Hub (salary) → Credit cards + Savings (spokes) — auto-detected, user-overridable
- **Intelligence**: Rule-based scorecard + creep + recommendations in `src/lib/intelligence/`, GPT analysis via `/api/analyse`
- **Salary cycles**: Run 23rd–22nd (not calendar months) — `useTransactions.ts` handles boundaries

---

## UNIVERSAL GOTCHAS

1. **Amex sign flip**: Amex Amount is POSITIVE for charges — parser flips to negative. NatWest is already signed correctly. Don't mix up.
2. **Server components**: `params` and `searchParams` must be awaited in Next.js App Router
3. **Client components**: Avoid `useSearchParams()` without wrapping in `<Suspense>`
4. **AI cost**: Send spending SUMMARIES not raw transactions — `src/lib/ai/` utilities handle this
5. **Categorization order**: Custom rules → Keyword rules → Amex mapping → GPT — never skip steps

---

## DOMAIN CONTEXT (auto-loaded by folder)

| Folder | Auto-loaded context |
|--------|---------------------|
| `src/lib/csv/` | CSV format specs, sign conventions, NatWest-specific merchant rules |
| `src/lib/` | localStorage key names, categorization pipeline, storage patterns, account hierarchy, money flow, intelligence layer |
| `src/lib/intelligence/` | Health scorecard, category creep, convenience premiums, recommendations engine |
| `src/app/api/` | OpenAI cost control, batch sizes, retry utility |

---

## ENVIRONMENT

```
OPENAI_API_KEY=    # In .env.local (gitignored). Shared with Distil — don't burn through it.
```

## DEVELOPMENT

```bash
npm run dev        # http://localhost:3000
npm run build
npm run lint
```

---

## EVOLUTION PATTERNS (reference implementations)

When the project is ready to evolve from localStorage-only to a hosted, authenticated app, reference implementations are in `docs/patterns/`:

| Pattern | Location | Purpose |
|---------|----------|---------|
| Supabase Auth (OTP) | `docs/patterns/supabase-auth/` | Login page, callback, middleware, CSRF, Supabase client/server |
| localStorage → Supabase | `docs/patterns/supabase-migration/` | SQL tables for every localStorage key, RLS policies, migration strategy |
| PWA | `docs/patterns/pwa/` | Manifest, install hooks (iOS/Android), version check, install banner |
| Vercel Hosting | `docs/patterns/vercel/` | vercel.json, next.config.ts with security headers, deployment guide |

These are adapted from Distil's production codebase. When implementing, copy the pattern files into the appropriate `src/` locations and adapt as needed.

---

## CONTENT & RESEARCH TOOLS

| Task | Command | Tool |
|------|---------|------|
| YouTube/competitor research | `/yt-research <query>` | yt-dlp |
| Full research → deliverables | `/content-pipeline <topic>` | yt-dlp + NotebookLM |
| Automated demo videos | `/demo-video <feature>` | Playwright + edge-tts + ffmpeg |

**Research output:** `docs/research/<topic-slug>.md` and `docs/research/media/`

**NotebookLM:** Run `python -m notebooklm login` if session expires. Accepts YouTube URLs, PDFs, web pages as sources. Generates briefings, podcasts, infographics, slides, quizzes, mind maps — all free.

**edge-tts voices:** `en-GB-RyanNeural` (male), `en-GB-SoniaNeural` (female), `en-GB-ThomasNeural` (male)

---

## SKILLS & PLUGINS

**Installed skills:**
- `playwright-cli` — Browser automation for web testing, form filling, screenshots, data extraction

**Claude Code plugins (install via CLI):**
- `superpowers` — Advanced workflow: brainstorming, plan writing, TDD, debugging, code review, parallel agents
- `skill-creator` — Create, evaluate, and package custom Claude Code skills
- `frontend-design` — Production-grade UI design guidance before writing components

---

## FOLDER CLAUDE.md MAINTENANCE

When modifying files in a directory that has a `CLAUDE.md`:
- If your change contradicts the `CLAUDE.md`, update it in the same commit
- If you add a non-obvious pattern or invariant, add it
- If it references a deleted file or outdated rule, remove or correct it
