# Savings Dashboard — Claude Code Instructions

## HARD GATES

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
- **AI**: Server-side only via `src/app/api/` routes (categorize, insights, chat, parse-csv)
- **CSV sources**: NatWest + Amex — **different sign conventions** (see `src/lib/csv/CLAUDE.md`)
- **Dedup**: Transaction IDs include account number to handle multi-account CSVs
- **Dates**: Always stored as ISO 8601 strings

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
| `src/lib/` | localStorage key names, categorization pipeline, storage patterns |
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

## FOLDER CLAUDE.md MAINTENANCE

When modifying files in a directory that has a `CLAUDE.md`:
- If your change contradicts the `CLAUDE.md`, update it in the same commit
- If you add a non-obvious pattern or invariant, add it
- If it references a deleted file or outdated rule, remove or correct it
