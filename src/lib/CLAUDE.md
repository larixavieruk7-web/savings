# src/lib — Storage, Categorization, Intelligence & Supabase

## Storage: Supabase (primary) + localStorage (cache)

### Architecture (3 layers)
```
Pages/Hooks → storage.ts (orchestrator, async) → supabase/storage.ts (primary)
                                                → storage-local.ts (cache fallback)
```
- **`storage.ts`** — Async orchestrator. All functions return Promises. Tries Supabase first; updates localStorage cache on success; falls back to cache on failure. EXCEPTION: `getDisplayName()` stays synchronous (reads cache only).
- **`storage-local.ts`** — Pure localStorage read/write. Only imported by `storage.ts` and `useTransactions.ts` (for instant cached display on load). Never imported by pages.
- **`supabase/storage.ts`** — Supabase CRUD layer. All functions talk to the DB via browser client with RLS.
- **`supabase/migration.ts`** — One-time localStorage → Supabase upload. Runs on first authenticated load; gated in `layout-shell.tsx` before `TransactionProvider` mounts.

### Supabase Tables (6 tables, RLS: household reads all, users write own)
```
transactions         — per-row, PK on id, includes raw_description and user_note
category_rules       — per-row, unique on (user_id, pattern)
savings_targets      — per-row, unique on (user_id, month)
knowledge_entries    — per-row
monthly_analyses     — per-row, unique on (user_id, period), analysis as JSONB
user_settings        — single row per user, JSONB columns for colors/nicknames/types/dismissed/cache
```

### localStorage Keys (cache layer — managed by storage-local.ts)
```
savings_transactions, savings_custom_rules, savings_targets, savings_insights_cache,
savings_custom_colors, savings_account_nicknames, savings_knowledge_bank,
savings_account_types, savings_dismissed_recommendations, savings_monthly_analyses
```

### Supabase Client Helpers (`src/lib/supabase/`)
- `client.ts` — Browser-side Supabase client (use in `'use client'` components)
- `server.ts` — Server-side Supabase client (use in API routes / Server Components)
- `middleware.ts` — Session refresh middleware (called by root `middleware.ts`)
- `storage.ts` — Supabase CRUD for all 6 tables
- `migration.ts` — One-time localStorage → Supabase migration
- `database.types.ts` — Auto-generated TypeScript types (`npx supabase gen types typescript --linked`)

## Categorization Pipeline (priority order — never skip steps)
1. **Custom/user rules** — corrections from localStorage, matched by description substring
2. **Keyword rules** — 100+ patterns in `categories.ts` (TESCO→Groceries, NETFLIX→Subscriptions, etc.) + NatWest type-based rules (DPC→Transfers, CHG→Bank Charges, INT→Income)
3. **Amex category mapping** — 30+ Amex pre-categories mapped to our taxonomy
4. **GPT-4o batch** — 150 transactions per API call, parallel batches via `src/app/api/categorize/`
5. **Manual correction** — user clicks category badge in transactions table

## Core Modules

### categories.ts — Master taxonomy
- `DEFAULT_RULES` — Complete keyword rule set
- `CATEGORY_COLORS` — RGB color mapping for all categories
- `isEssential()` — Classifies categories as essential/discretionary
- Source of truth for category names — if adding a category, add it here first

### account-hierarchy.ts — Account classification
- `detectAccountType()` — Infers hub/credit-card/savings from account name + transaction patterns
- `detectAllAccountTypes()` — Batch detection, preserves user-set overrides
- `buildAccountTypeMap()` — Lookup Map<accountName, AccountType>
- `reclassifyTransfers()` — Re-categorises inter-account moves based on hierarchy
- Auto-detects: hub (receives salary), credit-card (AMEX in name), savings (SAVINGS/ISA in name)
- Must run before money-flow calculations

### money-flow.ts — Salary allocation tracking
- `computeSalaryFlow()` — Breaks down where salary went in a given cycle
- Returns: totalSalary, creditCardPayments, savingsContributions, directDebits, debitSpend, unaccounted
- Respects account hierarchy (hub → spokes)

### subscriptions.ts — Recurring payment detection
- `computeSubscriptionData()` — Identifies recurring merchants + cross-account duplicates
- Returns `{ recurringMerchants, potentialDuplicates }`
- Normalises merchant names (Disney+, Disney* GBR, etc. all group together)

## AI Utilities (src/lib/ai/)
- `categoriser.ts` — GPT batch categorization, returns category + essential/discretionary
- `csv-parser.ts` — Universal CSV column detection + parsing (NatWest/Amex, multi-line fields)
- `insights-engine.ts` — Anomaly detection + savings suggestions (sends summaries only)
- `merchant-extractor.ts` — UK bank description → clean merchant name
- `retry.ts` — Exponential backoff for OpenAI 429s; always use this, never raw fetch loops

## Intelligence Layer (src/lib/intelligence/)
Pure computation, no AI calls. Generates prescriptive financial signals.

- `health-scorecard.ts` — `computeHealthScorecard()` — 0-100 score from 4 metrics (savings rate, essential ratio, creep count, flow clarity), each 0-25
- `category-creep.ts` — `detectCategoryCreep()` — Compares current cycle vs 3-cycle rolling average; flags rising (>20%), falling (<-20%), stable categories
- `convenience-premium.ts` — `detectConveniencePremiums()` — Aggregates delivery, coffee, ride-hail, convenience store spending by merchant
- `recommendations.ts` — `generateRecommendations()` — Rule-based action items from scorecard + creep + convenience + salary flow + duplicate subscriptions

## Gotchas
- Amounts are integers (pence) — `storage.ts` converts on read/write
- `categories.ts` is the single source of truth for category names and colors — if you add a category, add it here first
- Custom rules persist forever by design — one correction fixes all matching past/future transactions
- Account hierarchy must be set before money-flow calculations, or hub/spoke logic fails
- Category creep needs 4+ salary cycles (3 historical + 1 current) to produce results
