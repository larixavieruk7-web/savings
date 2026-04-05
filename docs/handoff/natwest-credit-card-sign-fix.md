# Handoff — NatWest credit-card sign fix + account-balance matching

**Date:** 2026-04-04
**Branch:** `feature/ai-financial-advisor` (NOT committed — lots of unrelated WIP also on this branch)
**Status:** Code fixed + DB cleanup done. **Awaiting Larissa's re-upload and verification of March totals.**

---

## TL;DR for the next session

Larissa uploaded `C:\Users\Family\Downloads\NatWest-download-20260404.csv` and her dashboard was showing:
- NatWest Current / Savings → "No data"
- Food Shopping CC / Mastercard → £0 outstanding
- March totals looked wrong (spending understated, savings rate skewed)

Three bugs found and fixed in this session. DB was purged of bad-signed credit-card rows. **She now needs to re-upload the CSV and eyeball the numbers** — that's where the next session picks up.

---

## The three bugs

### 1. Account-slot matcher was too strict
`src/components/dashboard/AccountBalancesPanel.tsx:69` checked `name === 'natwest current'` and `name === 'natwest savings'`, but NatWest CSVs actually label accounts `"Current Account"` and `"Main Savings Account"`. → Fixed to `.includes('current')` / `.includes('savings')`, with CC matchers reordered ahead to avoid collisions.

### 2. Credit-card balances were always 0
NatWest credit-card CSVs leave `Balance` **empty on every transaction row** and only publish the real balance on a `"Balance as at ..."` summary row. The parser was skipping those summary rows entirely (`natwest.ts:76`). → Fixed: capture balance per account into a `balanceSnapshots` map, then stamp the latest one onto the most-recent txn of each account after parsing.

### 3. Credit-card sign convention is INVERTED (the big one)
NatWest current/savings → negative = money out (normal).
NatWest **credit cards** → purchases are **positive**, payments received are **negative** (inverted).
The parser was treating both the same way, so:
- Every CC purchase was a positive amount → excluded from Total Spending (only negatives count) → **March spending understated**
- Every payment to the card was negative → counted as spending (though often caught by Transfers category)

→ Fixed: detect credit cards by `accountNum.includes('*')` (masked format like `546811******1853`) and flip the sign at parse time.

---

## Files changed (uncommitted)

```
M src/components/dashboard/AccountBalancesPanel.tsx   # slot matcher fix
M src/lib/csv/natwest.ts                              # balance snapshot + CC sign flip
```

Key sections:
- `AccountBalancesPanel.tsx:69-77` — new matcher order + `.includes()`
- `natwest.ts` — `balanceSnapshots` Map declared before parse loop
- `natwest.ts` — `"Balance as at"` branch captures balance into the map and `continue`s
- `natwest.ts` — `isCreditCard = accountNum.includes('*')` → `amountPounds = isCreditCard ? -raw : raw`
- `natwest.ts` — post-parse loop stamps snapshots onto the latest txn per account
- `ParsedRow` interface gained `accountNum: string`; `assignDeterministicIds` signature updated to match

Typecheck passes (`npx tsc --noEmit` — clean).

## Database cleanup already performed

Deleted 97 stale inverted-sign rows from Supabase:
```sql
DELETE FROM transactions
WHERE source='natwest' AND account_name IN ('Food Shopping Cc','MASTERCARD');
```
(Ran via `npx supabase db query --linked` — Larissa's CLI auth.)

**Preserved**: Current Account (24), Main Savings (3), Dining/goingOut Fund (1), XAVIER DA SILVA G loan (2).

NOTE: The 24 Current Account rows in Supabase is suspiciously low vs the ~80+ rows in the CSV for that account. Prior uploads may have silently dropped rows — the re-upload should top them up via the dedupe path.

---

## What Larissa needs to do (and what to verify next session)

1. **Re-upload** `C:\Users\Family\Downloads\NatWest-download-20260404.csv` via the upload page.
2. Hard refresh the dashboard.
3. Expected post-upload values (from the CSV's latest rows):
   - NatWest Current: **£4,709.51**
   - NatWest Savings: **£10,231.21**
   - Food Shopping CC: **£143.56** outstanding
   - NatWest Mastercard: **£2,552.06** outstanding
4. Compare March Total Spending before/after — delta ≈ the sum of CC purchases in that cycle.
5. Verify Net Savings + Savings Rate recompute sensibly.

If anything still looks off, that's the new session's starting point. Candidates for residual issues:
- Supabase Current-account row count (was 24, should be much higher after re-upload)
- Salary-cycle boundaries for "March" label (cycles are 23rd→22nd, anchored to actual salary deposits — not calendar months). CLAUDE.md gotcha #6.
- Stale category assignments on pre-fix rows (commit `73a1416` re-applied a salary categorization fix — existing rows don't auto-recategorize).

---

## Context to carry forward

### Branch state (uncommitted, broader than this fix)
`feature/ai-financial-advisor` has a large amount of unrelated WIP from prior work (AI advisor feature, PDF parser, chat tools, etc.). **Do not commit just this fix in isolation** — Larissa said we'll verify numbers first, then commit the whole branch in one pass. Other Claude instance is reviewing the AI-advisor code separately.

Full `git status` at handoff:
```
M CLAUDE.md
M package-lock.json
M package.json
M src/app/api/chat/route.ts
M src/app/ask/page.tsx
M src/app/knowledge/page.tsx
M src/app/layout.tsx
M src/app/page.tsx
M src/app/upload/page.tsx
M src/components/dashboard/period-selector.tsx
M src/components/dashboard/AccountBalancesPanel.tsx   ← this fix
M src/hooks/useTransactions.ts
M src/lib/csv/amex.ts
M src/lib/csv/natwest.ts                              ← this fix
M src/lib/storage.ts
M src/lib/supabase/database.types.ts
M src/types/index.ts
?? scripts/tutorial/
?? src/app/api/parse-pdf/
?? src/components/dashboard/AccountBalancesPanel.tsx  (actually tracked — see above)
?? src/components/dashboard/cycle-burndown.tsx
?? src/lib/ai/chat-tools.ts
?? test-results/
```

### Key constants to remember
- Credit-card detection: `accountNum.includes('*')` — current/savings account numbers are `560035-xxxxxxxx` (no asterisks); cards are `546811******1853`, `545460******5232`.
- Income definition: `useTransactions.ts:37` — `INCOME_CATEGORIES = new Set(['Salary'])`. Only Salary counts; refunds/transfers-in do not.
- Internal categories excluded from spending: `['Transfers', 'Savings & Investments']`.
- Household credit cards seen in current data: Food Shopping CC (`546811******1853`), Mastercard (`545460******5232`).

### Things NOT to do
- Don't use `mcp__claude_ai_Supabase__*` or `mcp__claude_ai_Vercel__*` — those are Gus's auth. Use `npx supabase db query --linked` and `vercel` CLI (Larissa's auth).
- Don't commit this fix alone — it's bundled with a large AI-advisor feature branch.
- Don't push to remote unless explicitly asked.

---

## Prompt to paste into the next session

> Continuing from `docs/handoff/natwest-credit-card-sign-fix.md`. I've re-uploaded the NatWest CSV — here's what the dashboard is showing now: [paste numbers]. The expected values are in the handoff doc. Help me work through any remaining disparities.
