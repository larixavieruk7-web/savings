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

**Tooling split (CRITICAL — enforced every session):**
- **MCP** (`mcp__claude_ai_Supabase__*`, `mcp__claude_ai_Vercel__*`) = authed to **Gus's account** — NEVER USE for this project
- **CLI** (`npx supabase`, `vercel`, `gh`) = authed to **Larissa's account** — ALWAYS USE for Supabase/Vercel/GitHub operations

**Rules:**
- NEVER invoke any MCP tool starting with `mcp__claude_ai_Supabase__` or `mcp__claude_ai_Vercel__`
- ALWAYS use CLI commands for all infrastructure operations (see CLI Runbook below)
- NEVER push to any repo other than `larixavieruk7-web/savings`
- If an MCP tool is accidentally invoked and returns data from Gus's projects, STOP and warn the user
- The OpenAI API key is shared — remain cost-conscious but it is the ONLY shared resource
- GitHub CLI path: `"/c/Program Files/GitHub CLI/gh.exe"` (use full path or `gh` if on PATH)

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
- **Purpose**: Personal household savings dashboard — Supabase backend with OTP auth, Vercel hosting
- **Auth**: OTP magic link only, signups disabled, 3 allowed emails: `lari_uk@gmail.com`, `larixavieruk7@gmail.com`, `gusampteam@hotmail.com`
- **OpenAI key**: Shared with Distil project — be cost-conscious, send summaries not raw data

---

## ARCHITECTURE ESSENTIALS

- **Storage**: localStorage (current) + Supabase tables (migration in progress) — see `src/lib/CLAUDE.md` for key names
- **Auth**: Supabase OTP via `src/lib/supabase/` + middleware at root `middleware.ts` — login at `/login`, callback at `/auth/callback`
- **Layout**: `src/components/layout-shell.tsx` conditionally hides sidebar on auth routes
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
# .env.local (gitignored)
OPENAI_API_KEY=              # Shared with Distil — don't burn through it
NEXT_PUBLIC_SUPABASE_URL=    # https://ekqpsozlqjmjlwzzpyxp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon public key
```

All three are also set on Vercel production via `vercel env ls`.

## DEVELOPMENT

```bash
npm run dev        # http://localhost:3000
npm run build
npm run lint
```

---

## CLI RUNBOOK — Larissa's Infrastructure

**All infrastructure commands use CLIs authed to Larissa's account. NEVER use MCP tools.**

### Supabase (project: `ekqpsozlqjmjlwzzpyxp`)
```bash
# Run SQL on remote database
npx supabase db query --linked "SELECT ..."
cat file.sql | npx supabase db query --linked

# Push auth/config changes (edit supabase/config.toml first)
echo "Y" | npx supabase config push

# List tables
npx supabase db query --linked "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"

# Check users
npx supabase db query --linked "SELECT email FROM auth.users"

# Re-login (if token expires — requires TTY, user must run via ! prefix)
# ! npx supabase login
```

### Vercel (project: `savings_dashboard`, domain: `savings-lovat.vercel.app`)
```bash
# Check deployments
vercel ls

# Set/update env vars
vercel env add VAR_NAME production --value "value" --yes
vercel env rm VAR_NAME production --yes
vercel env ls

# Manual deploy (normally auto-deploys on git push)
vercel --prod

# Pull env vars to local .env.local
vercel env pull .env.local
```

### GitHub (repo: `larixavieruk7-web/savings`)
```bash
# Push (auto-triggers Vercel deploy)
git push origin main

# Create PR
"/c/Program Files/GitHub CLI/gh.exe" pr create --title "..." --body "..."

# Check CI status
"/c/Program Files/GitHub CLI/gh.exe" pr status
```

---

## IMPLEMENTED PATTERNS & REMAINING PATTERNS

**Already implemented:**
- Supabase Auth (OTP) — `src/lib/supabase/`, `src/app/login/`, `src/app/auth/callback/`, `middleware.ts`
- Supabase tables + RLS — 6 tables created via `scripts/supabase-migration.sql`
- Vercel hosting — auto-deploys from `main`, env vars configured

**Not yet implemented (reference patterns in `docs/patterns/`):**
| Pattern | Location | Purpose |
|---------|----------|---------|
| localStorage → Supabase data migration | `docs/patterns/supabase-migration/` | Script to upload existing localStorage data to Supabase |
| PWA | `docs/patterns/pwa/` | Manifest, install hooks (iOS/Android), version check, install banner |
| Vercel security headers | `docs/patterns/vercel/` | vercel.json, next.config.ts with security headers |
| CSRF protection | `docs/patterns/supabase-auth/csrf.ts` | Token-based CSRF for POST endpoints |

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
