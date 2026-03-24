# localStorage → Supabase Storage Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage with Supabase as primary data store, keeping localStorage as an offline cache, so household members can upload and view financial data from any device.

**Architecture:** Client-side Supabase calls via browser client with RLS. `storage.ts` becomes a thin orchestrator: try Supabase → fallback to localStorage cache. The hook (`useTransactions.ts`) adds a `loading` state and async init chain. A one-time migration uploads existing localStorage data to Supabase on first authenticated load.

**Tech Stack:** Next.js 14 (App Router), Supabase JS (`@supabase/ssr`), TypeScript, localStorage

**Spec:** `docs/superpowers/specs/2026-03-24-supabase-storage-migration-design.md`

**Branch:** Work on a feature branch (`feat/supabase-storage`) — Tasks 8-12 will temporarily break the build as functions become async. Merge to `main` only after Task 14 confirms a clean build.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| NEW | `src/lib/supabase/database.types.ts` | Auto-generated Supabase TypeScript types |
| NEW | `src/lib/supabase/storage.ts` | All Supabase CRUD functions (transactions, rules, targets, knowledge, analyses, settings) |
| NEW | `src/lib/supabase/migration.ts` | One-time localStorage → Supabase migration with progress tracking |
| NEW | `src/lib/storage-local.ts` | Extracted pure localStorage read/write functions (cache layer) |
| MODIFY | `scripts/supabase-migration.sql` | Add `raw_description`, `user_note`, `migration_completed_at` columns; split RLS; add trigger |
| MODIFY | `src/lib/storage.ts` | Thin orchestrator: Supabase primary + localStorage fallback |
| MODIFY | `src/hooks/useTransactions.ts` | Async init, loading state, async mutations |
| MODIFY | `src/context/transactions.tsx` | Expose `loading` in context |
| MODIFY | `src/app/page.tsx` | Async storage calls |
| MODIFY | `src/app/accounts/page.tsx` | Async storage calls |
| MODIFY | `src/app/categories/page.tsx` | Async storage calls |
| MODIFY | `src/app/knowledge/page.tsx` | Async storage calls |
| MODIFY | `src/app/insights/page.tsx` | Async storage calls |
| MODIFY | `src/app/transactions/page.tsx` | Async storage calls |
| MODIFY | `src/app/ask/page.tsx` | Async storage calls |
| MODIFY | `src/components/dashboard/recommendations-panel.tsx` | Async storage calls |
| MODIFY | `src/components/dashboard/ai-analysis.tsx` | Async storage calls |
| MODIFY | `src/components/CategoryEditor.tsx` | Async storage calls |

---

## Task 1: Apply Schema Changes to Supabase

**Files:**
- Modify: `scripts/supabase-migration.sql` (append new migration statements)
- Create: `scripts/supabase-schema-update.sql` (standalone file for this migration)

This task adds the missing columns, drops the redundant constraint, updates RLS policies for household sharing, and adds the `updated_at` trigger. Run via CLI against the linked Supabase project.

- [ ] **Step 1: Create the schema update SQL file**

```sql
-- scripts/supabase-schema-update.sql
-- Run: cat scripts/supabase-schema-update.sql | npx supabase db query --linked

-- 1. Add missing columns to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_description TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_note TEXT;

-- 2. Add migration tracking to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS migration_completed_at TIMESTAMPTZ;

-- 3. Drop redundant composite unique constraint (PK on id already enforces uniqueness)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_id_user_id_key;

-- 4. Add updated_at trigger for user_settings
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_settings_modtime ON user_settings;
CREATE TRIGGER update_user_settings_modtime
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 5. Drop old single-policy RLS and replace with household read / user write
-- TRANSACTIONS
DROP POLICY IF EXISTS "Users see own transactions" ON transactions;
CREATE POLICY "Household reads transactions" ON transactions FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own transactions" ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transactions" ON transactions FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own transactions" ON transactions FOR DELETE
  USING (auth.uid() = user_id);

-- CATEGORY_RULES
DROP POLICY IF EXISTS "Users see own rules" ON category_rules;
CREATE POLICY "Household reads rules" ON category_rules FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own rules" ON category_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rules" ON category_rules FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own rules" ON category_rules FOR DELETE
  USING (auth.uid() = user_id);

-- SAVINGS_TARGETS
DROP POLICY IF EXISTS "Users see own targets" ON savings_targets;
CREATE POLICY "Household reads targets" ON savings_targets FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own targets" ON savings_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own targets" ON savings_targets FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own targets" ON savings_targets FOR DELETE
  USING (auth.uid() = user_id);

-- KNOWLEDGE_ENTRIES
DROP POLICY IF EXISTS "Users see own entries" ON knowledge_entries;
CREATE POLICY "Household reads entries" ON knowledge_entries FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own entries" ON knowledge_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own entries" ON knowledge_entries FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own entries" ON knowledge_entries FOR DELETE
  USING (auth.uid() = user_id);

-- MONTHLY_ANALYSES
DROP POLICY IF EXISTS "Users see own analyses" ON monthly_analyses;
CREATE POLICY "Household reads analyses" ON monthly_analyses FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own analyses" ON monthly_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own analyses" ON monthly_analyses FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own analyses" ON monthly_analyses FOR DELETE
  USING (auth.uid() = user_id);

-- USER_SETTINGS
DROP POLICY IF EXISTS "Users see own settings" ON user_settings;
CREATE POLICY "Household reads settings" ON user_settings FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own settings" ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON user_settings FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own settings" ON user_settings FOR DELETE
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Run the migration against linked Supabase**

Run: `cat scripts/supabase-schema-update.sql | npx supabase db query --linked`
Expected: No errors. Each statement should execute successfully.

- [ ] **Step 3: Verify the schema changes**

Run: `npx supabase db query --linked "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'transactions' AND column_name IN ('raw_description', 'user_note') ORDER BY column_name"`
Expected: Two rows showing `raw_description` and `user_note` columns.

Run: `npx supabase db query --linked "SELECT policyname FROM pg_policies WHERE tablename = 'transactions' ORDER BY policyname"`
Expected: Four policies: `Household reads transactions`, `Users delete own transactions`, `Users insert own transactions`, `Users update own transactions`.

- [ ] **Step 4: Commit**

```bash
git add scripts/supabase-schema-update.sql
git commit -m "feat: add missing columns, split RLS for household, add trigger"
```

---

## Task 2: Generate Supabase TypeScript Types

**Files:**
- Create: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Generate types from linked project**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: File created with TypeScript interfaces matching all 6 tables.

- [ ] **Step 2: Verify the generated types include new columns**

Open `src/lib/supabase/database.types.ts` and confirm the `transactions` table type includes `raw_description` and `user_note`. Confirm `user_settings` includes `migration_completed_at`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat: generate Supabase TypeScript types"
```

---

## Task 3: Extract localStorage Functions to `storage-local.ts`

**Files:**
- Create: `src/lib/storage-local.ts`
- Reference: `src/lib/storage.ts` (read, do not modify yet)

Extract the pure localStorage read/write logic into a dedicated cache module. This becomes the cache layer that `storage.ts` delegates to.

- [ ] **Step 1: Create `storage-local.ts` with all localStorage primitives**

```typescript
// src/lib/storage-local.ts
// Pure localStorage read/write functions — the cache layer.
// Only imported by storage.ts orchestrator. Never imported by hooks or pages directly.

import type { Transaction, CategoryRule, SavingsTarget, KnowledgeEntry, AccountConfig } from '@/types'

const KEYS = {
  transactions: 'savings_transactions',
  customRules: 'savings_custom_rules',
  savingsTargets: 'savings_targets',
  insightsCache: 'savings_insights_cache',
  customCategories: 'savings_custom_colors',
  accountNicknames: 'savings_account_nicknames',
  knowledgeBank: 'savings_knowledge_bank',
  accountTypes: 'savings_account_types',
  dismissedRecommendations: 'savings_dismissed_recommendations',
  monthlyAnalyses: 'savings_monthly_analyses',
} as const

// --- Generic helpers ---

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

// --- Transactions ---

export function getLocalTransactions(): Transaction[] {
  return readJson<Transaction[]>(KEYS.transactions, [])
}

export function setLocalTransactions(txns: Transaction[]): void {
  writeJson(KEYS.transactions, txns)
}

export function clearLocalTransactions(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEYS.transactions)
}

// --- Custom Rules ---

export function getLocalCustomRules(): CategoryRule[] {
  return readJson<CategoryRule[]>(KEYS.customRules, [])
}

export function setLocalCustomRules(rules: CategoryRule[]): void {
  writeJson(KEYS.customRules, rules)
}

// --- Savings Targets ---

export function getLocalSavingsTargets(): SavingsTarget[] {
  return readJson<SavingsTarget[]>(KEYS.savingsTargets, [])
}

export function setLocalSavingsTargets(targets: SavingsTarget[]): void {
  writeJson(KEYS.savingsTargets, targets)
}

// --- Knowledge Entries ---

export function getLocalKnowledgeEntries(): KnowledgeEntry[] {
  return readJson<KnowledgeEntry[]>(KEYS.knowledgeBank, [])
}

export function setLocalKnowledgeEntries(entries: KnowledgeEntry[]): void {
  writeJson(KEYS.knowledgeBank, entries)
}

// --- Monthly Analyses ---

export interface StoredAnalysis {
  cycleId: string
  analysedAt: string
  analysis: Record<string, unknown>
}

export function getLocalMonthlyAnalyses(): StoredAnalysis[] {
  return readJson<StoredAnalysis[]>(KEYS.monthlyAnalyses, [])
}

export function setLocalMonthlyAnalyses(analyses: StoredAnalysis[]): void {
  writeJson(KEYS.monthlyAnalyses, analyses)
}

// --- User Settings (consolidated JSONB fields) ---

export function getLocalCustomColors(): Record<string, string> {
  return readJson<Record<string, string>>(KEYS.customCategories, {})
}

export function setLocalCustomColors(colors: Record<string, string>): void {
  writeJson(KEYS.customCategories, colors)
}

export function getLocalAccountNicknames(): Record<string, string> {
  return readJson<Record<string, string>>(KEYS.accountNicknames, {})
}

export function setLocalAccountNicknames(nicknames: Record<string, string>): void {
  writeJson(KEYS.accountNicknames, nicknames)
}

export function getLocalAccountTypes(): AccountConfig[] {
  return readJson<AccountConfig[]>(KEYS.accountTypes, [])
}

export function setLocalAccountTypes(configs: AccountConfig[]): void {
  writeJson(KEYS.accountTypes, configs)
}

export function getLocalDismissedRecommendations(): string[] {
  return readJson<string[]>(KEYS.dismissedRecommendations, [])
}

export function setLocalDismissedRecommendations(ids: string[]): void {
  writeJson(KEYS.dismissedRecommendations, ids)
}

export function getLocalInsightsCache(): Record<string, unknown> | null {
  return readJson<Record<string, unknown> | null>(KEYS.insightsCache, null)
}

export function setLocalInsightsCache(data: Record<string, unknown>): void {
  writeJson(KEYS.insightsCache, { ...data, cachedAt: Date.now() })
}

// --- Backup helpers (for migration rollback) ---

const BACKUP_SUFFIX = '_backup_v1'

export function backupLocalStorage(): void {
  if (typeof window === 'undefined') return
  for (const key of Object.values(KEYS)) {
    const data = localStorage.getItem(key)
    if (data) {
      localStorage.setItem(key + BACKUP_SUFFIX, data)
      localStorage.setItem(key + BACKUP_SUFFIX + '_at', new Date().toISOString())
    }
  }
}

export function cleanupBackups(maxAgeDays = 30): void {
  if (typeof window === 'undefined') return
  const now = Date.now()
  for (const key of Object.values(KEYS)) {
    const backupAtStr = localStorage.getItem(key + BACKUP_SUFFIX + '_at')
    if (backupAtStr) {
      const backupAt = new Date(backupAtStr).getTime()
      if (now - backupAt > maxAgeDays * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key + BACKUP_SUFFIX)
        localStorage.removeItem(key + BACKUP_SUFFIX + '_at')
      }
    }
  }
}

// --- Migration progress tracking ---

const MIGRATION_PROGRESS_KEY = 'savings_migration_progress'

export function getMigrationProgress(): number {
  return readJson<number>(MIGRATION_PROGRESS_KEY, 0)
}

export function setMigrationProgress(batchIndex: number): void {
  writeJson(MIGRATION_PROGRESS_KEY, batchIndex)
}

export function clearMigrationProgress(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(MIGRATION_PROGRESS_KEY)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/storage-local.ts 2>&1 | head -20`
If type errors, fix import paths. This file should have zero dependencies beyond `@/types`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage-local.ts
git commit -m "feat: extract localStorage functions to storage-local.ts cache layer"
```

---

## Task 4: Create Supabase Storage — Transactions CRUD

**Files:**
- Create: `src/lib/supabase/storage.ts`
- Reference: `src/lib/supabase/client.ts`, `src/lib/supabase/database.types.ts`, `src/types/index.ts`

Build the Supabase storage layer incrementally. This task covers transactions. Subsequent tasks add remaining tables.

- [ ] **Step 1: Create `supabase/storage.ts` with client singleton and transaction functions**

```typescript
// src/lib/supabase/storage.ts
// Supabase CRUD layer. All functions use the browser client with RLS.
// Only imported by the storage.ts orchestrator — never by hooks or pages directly.

import { createClient } from './client'
import type { Transaction, CategoryRule, SavingsTarget, KnowledgeEntry, AccountConfig } from '@/types'
import type { StoredAnalysis } from '@/lib/storage-local'

// Singleton browser client
let _client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!_client) _client = createClient()
  return _client
}

// Get current user ID from session, or null if not authenticated
async function getUserId(): Promise<string | null> {
  const { data: { user } } = await getClient().auth.getUser()
  return user?.id ?? null
}

// ============================================================
// TRANSACTIONS
// ============================================================

// Map DB snake_case row to TS camelCase Transaction
function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    date: row.date as string,
    type: (row.type as string) || '',
    description: row.description as string,
    rawDescription: (row.raw_description as string) || (row.description as string),
    amount: row.amount as number,
    balance: (row.balance as number) ?? 0,
    category: (row.category as string) || 'Other',
    subcategory: row.subcategory as string | undefined,
    merchantName: row.merchant_name as string | undefined,
    isRecurring: (row.is_recurring as boolean) || false,
    isEssential: row.is_essential as boolean | undefined,
    accountName: row.account_name as string | undefined,
    source: row.source as Transaction['source'],
    categorySource: row.category_source as Transaction['categorySource'],
    userNote: row.user_note as string | undefined,
  }
}

// Map TS camelCase Transaction to DB snake_case row (for inserts/updates)
function transactionToRow(t: Transaction, userId: string): Record<string, unknown> {
  return {
    id: t.id,
    user_id: userId,
    date: t.date,
    type: t.type || null,
    description: t.description,
    raw_description: t.rawDescription || t.description,
    amount: t.amount,
    balance: t.balance ?? null,
    category: t.category || 'Other',
    subcategory: t.subcategory || null,
    merchant_name: t.merchantName || null,
    is_recurring: t.isRecurring || false,
    is_essential: t.isEssential ?? null,
    account_name: t.accountName || null,
    source: t.source || null,
    category_source: t.categorySource || null,
    user_note: t.userNote || null,
  }
}

/** Fetch all transactions visible to the household (RLS handles filtering) */
export async function fetchTransactions(): Promise<Transaction[] | null> {
  try {
    const { data, error } = await getClient()
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
    if (error) { console.error('fetchTransactions error:', error); return null }
    return (data || []).map(rowToTransaction)
  } catch (e) {
    console.error('fetchTransactions exception:', e)
    return null
  }
}

/**
 * Insert new transactions — ON CONFLICT DO NOTHING preserves existing (manual corrections safe).
 * Use for CSV uploads where we don't want to overwrite existing data.
 */
export async function insertNewTransactions(transactions: Transaction[]): Promise<boolean> {
  const userId = await getUserId()
  if (!userId || transactions.length === 0) return false

  try {
    const BATCH_SIZE = 500
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE)
      const rows = batch.map(t => transactionToRow(t, userId))
      const { error } = await getClient()
        .from('transactions')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      if (error) { console.error('insertNewTransactions batch error:', error); return false }
    }
    return true
  } catch (e) {
    console.error('insertNewTransactions exception:', e)
    return false
  }
}

/**
 * Full upsert — ON CONFLICT DO UPDATE overwrites all fields.
 * Use for saveTransactions (after reclassification, transfer detection, etc.)
 * where the caller has the authoritative version of each transaction.
 */
export async function upsertTransactions(transactions: Transaction[]): Promise<boolean> {
  const userId = await getUserId()
  if (!userId || transactions.length === 0) return false

  try {
    const BATCH_SIZE = 500
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE)
      const rows = batch.map(t => transactionToRow(t, userId))
      const { error } = await getClient()
        .from('transactions')
        .upsert(rows, { onConflict: 'id' })
      if (error) { console.error('upsertTransactions batch error:', error); return false }
    }
    return true
  } catch (e) {
    console.error('upsertTransactions exception:', e)
    return false
  }
}

/**
 * Update specific fields on specific transactions (for recategorization, manual edits).
 * Groups updates by identical field sets and batches via .in() filter for performance.
 * Falls back to individual updates if field sets vary across updates.
 */
export async function updateTransactions(
  updates: (Partial<Transaction> & { id: string })[]
): Promise<boolean> {
  const userId = await getUserId()
  if (!userId || updates.length === 0) return false

  try {
    // Group updates that share the same fields+values (common in recategorizeAll)
    const grouped = new Map<string, { row: Record<string, unknown>; ids: string[] }>()

    for (const update of updates) {
      const row: Record<string, unknown> = {}
      if (update.category !== undefined) row.category = update.category
      if (update.subcategory !== undefined) row.subcategory = update.subcategory
      if (update.isEssential !== undefined) row.is_essential = update.isEssential
      if (update.categorySource !== undefined) row.category_source = update.categorySource
      if (update.merchantName !== undefined) row.merchant_name = update.merchantName
      if (update.isRecurring !== undefined) row.is_recurring = update.isRecurring
      if (update.userNote !== undefined) row.user_note = update.userNote
      if (update.accountName !== undefined) row.account_name = update.accountName

      if (Object.keys(row).length === 0) continue

      const key = JSON.stringify(row)
      const existing = grouped.get(key)
      if (existing) {
        existing.ids.push(update.id)
      } else {
        grouped.set(key, { row, ids: [update.id] })
      }
    }

    // Execute grouped updates (one query per unique field+value combo)
    for (const { row, ids } of grouped.values()) {
      const BATCH = 500
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH)
        const { error } = await getClient()
          .from('transactions')
          .update(row)
          .in('id', batch)
          .eq('user_id', userId)
        if (error) { console.error('updateTransactions error:', error); return false }
      }
    }
    return true
  } catch (e) {
    console.error('updateTransactions exception:', e)
    return false
  }
}

/** Delete all transactions for the current user */
export async function deleteAllTransactions(): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const { error } = await getClient()
      .from('transactions')
      .delete()
      .eq('user_id', userId)
    if (error) { console.error('deleteAllTransactions error:', error); return false }
    return true
  } catch (e) {
    console.error('deleteAllTransactions exception:', e)
    return false
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/supabase/storage.ts 2>&1 | head -20`
Fix any type issues with the generated database types.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/storage.ts
git commit -m "feat: add Supabase storage layer — transactions CRUD"
```

---

## Task 5: Supabase Storage — Category Rules, Savings Targets, Knowledge, Analyses

**Files:**
- Modify: `src/lib/supabase/storage.ts` (append)

- [ ] **Step 1: Add category rules functions**

Append to `src/lib/supabase/storage.ts`:

```typescript
// ============================================================
// CATEGORY RULES
// ============================================================

function rowToRule(row: Record<string, unknown>): CategoryRule {
  return {
    pattern: row.pattern as string,
    category: row.category as string,
    subcategory: row.subcategory as string | undefined,
    isEssential: row.is_essential as boolean | undefined,
    source: (row.source as CategoryRule['source']) || 'manual',
    note: row.note as string | undefined,
  }
}

function ruleToRow(r: CategoryRule, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    pattern: r.pattern,
    category: r.category,
    subcategory: r.subcategory || null,
    is_essential: r.isEssential ?? null,
    source: r.source || 'manual',
    note: r.note || null,
  }
}

export async function fetchCategoryRules(): Promise<CategoryRule[] | null> {
  try {
    const { data, error } = await getClient()
      .from('category_rules')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('fetchCategoryRules error:', error); return null }
    return (data || []).map(rowToRule)
  } catch (e) {
    console.error('fetchCategoryRules exception:', e)
    return null
  }
}

export async function upsertCategoryRules(rules: CategoryRule[]): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const rows = rules.map(r => ruleToRow(r, userId))
    const { error } = await getClient()
      .from('category_rules')
      .upsert(rows, { onConflict: 'user_id,pattern' })
    if (error) { console.error('upsertCategoryRules error:', error); return false }
    return true
  } catch (e) {
    console.error('upsertCategoryRules exception:', e)
    return false
  }
}

export async function deleteCategoryRule(pattern: string): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const { error } = await getClient()
      .from('category_rules')
      .delete()
      .eq('user_id', userId)
      .eq('pattern', pattern)
    if (error) { console.error('deleteCategoryRule error:', error); return false }
    return true
  } catch (e) {
    console.error('deleteCategoryRule exception:', e)
    return false
  }
}
```

- [ ] **Step 2: Add savings targets functions**

```typescript
// ============================================================
// SAVINGS TARGETS
// ============================================================

function rowToTarget(row: Record<string, unknown>): SavingsTarget {
  return {
    id: row.id as string,
    month: row.month as string,
    targetAmount: row.target_amount as number,
    description: row.description as string | undefined,
  }
}

function targetToRow(t: SavingsTarget, userId: string): Record<string, unknown> {
  return {
    id: t.id || `target-${t.month}`,
    user_id: userId,
    month: t.month,
    target_amount: t.targetAmount,
    description: t.description || null,
  }
}

export async function fetchSavingsTargets(): Promise<SavingsTarget[] | null> {
  try {
    const { data, error } = await getClient()
      .from('savings_targets')
      .select('*')
      .order('month', { ascending: false })
    if (error) { console.error('fetchSavingsTargets error:', error); return null }
    return (data || []).map(rowToTarget)
  } catch (e) {
    console.error('fetchSavingsTargets exception:', e)
    return null
  }
}

export async function upsertSavingsTargets(targets: SavingsTarget[]): Promise<boolean> {
  const userId = await getUserId()
  if (!userId || targets.length === 0) return false

  try {
    const rows = targets.map(t => targetToRow(t, userId))
    const { error } = await getClient()
      .from('savings_targets')
      .upsert(rows, { onConflict: 'user_id,month' })
    if (error) { console.error('upsertSavingsTargets error:', error); return false }
    return true
  } catch (e) {
    console.error('upsertSavingsTargets exception:', e)
    return false
  }
}
```

- [ ] **Step 3: Add knowledge entries functions**

```typescript
// ============================================================
// KNOWLEDGE ENTRIES
// ============================================================

function rowToKnowledgeEntry(row: Record<string, unknown>): KnowledgeEntry {
  return {
    id: row.id as string,
    date: row.date as string,
    title: row.title as string,
    description: (row.description as string) || '',
    tags: (row.tags as string[]) || [],
    type: row.type as KnowledgeEntry['type'],
    createdAt: (row.created_at as string) || new Date().toISOString(),
  }
}

function knowledgeEntryToRow(e: KnowledgeEntry, userId: string): Record<string, unknown> {
  return {
    id: e.id,
    user_id: userId,
    date: e.date,
    title: e.title,
    description: e.description || null,
    tags: e.tags || [],
    type: e.type,
  }
}

export async function fetchKnowledgeEntries(): Promise<KnowledgeEntry[] | null> {
  try {
    const { data, error } = await getClient()
      .from('knowledge_entries')
      .select('*')
      .order('date', { ascending: false })
    if (error) { console.error('fetchKnowledgeEntries error:', error); return null }
    return (data || []).map(rowToKnowledgeEntry)
  } catch (e) {
    console.error('fetchKnowledgeEntries exception:', e)
    return null
  }
}

export async function insertKnowledgeEntry(entry: KnowledgeEntry): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const { error } = await getClient()
      .from('knowledge_entries')
      .insert(knowledgeEntryToRow(entry, userId))
    if (error) { console.error('insertKnowledgeEntry error:', error); return false }
    return true
  } catch (e) {
    console.error('insertKnowledgeEntry exception:', e)
    return false
  }
}

export async function upsertKnowledgeEntries(entries: KnowledgeEntry[]): Promise<boolean> {
  const userId = await getUserId()
  if (!userId || entries.length === 0) return false

  try {
    const rows = entries.map(e => knowledgeEntryToRow(e, userId))
    const { error } = await getClient()
      .from('knowledge_entries')
      .upsert(rows, { onConflict: 'id' })
    if (error) { console.error('upsertKnowledgeEntries error:', error); return false }
    return true
  } catch (e) {
    console.error('upsertKnowledgeEntries exception:', e)
    return false
  }
}

export async function deleteKnowledgeEntry(id: string): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const { error } = await getClient()
      .from('knowledge_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) { console.error('deleteKnowledgeEntry error:', error); return false }
    return true
  } catch (e) {
    console.error('deleteKnowledgeEntry exception:', e)
    return false
  }
}
```

- [ ] **Step 4: Add monthly analyses functions**

```typescript
// ============================================================
// MONTHLY ANALYSES
// ============================================================

function rowToAnalysis(row: Record<string, unknown>): StoredAnalysis {
  return {
    cycleId: row.period as string,
    analysedAt: (row.created_at as string) || new Date().toISOString(),
    analysis: (row.analysis as Record<string, unknown>) || {},
  }
}

export async function fetchMonthlyAnalyses(): Promise<StoredAnalysis[] | null> {
  try {
    const { data, error } = await getClient()
      .from('monthly_analyses')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('fetchMonthlyAnalyses error:', error); return null }
    return (data || []).map(rowToAnalysis)
  } catch (e) {
    console.error('fetchMonthlyAnalyses exception:', e)
    return null
  }
}

export async function fetchAnalysisForCycle(cycleId: string): Promise<StoredAnalysis | null> {
  try {
    const { data, error } = await getClient()
      .from('monthly_analyses')
      .select('*')
      .eq('period', cycleId)
      .maybeSingle()
    if (error) { console.error('fetchAnalysisForCycle error:', error); return null }
    return data ? rowToAnalysis(data) : null
  } catch (e) {
    console.error('fetchAnalysisForCycle exception:', e)
    return null
  }
}

export async function upsertMonthlyAnalysis(cycleId: string, analysis: Record<string, unknown>): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const { error } = await getClient()
      .from('monthly_analyses')
      .upsert({
        user_id: userId,
        period: cycleId,
        analysis: analysis,
      }, { onConflict: 'user_id,period' })
    if (error) { console.error('upsertMonthlyAnalysis error:', error); return false }
    return true
  } catch (e) {
    console.error('upsertMonthlyAnalysis exception:', e)
    return false
  }
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit src/lib/supabase/storage.ts 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/storage.ts
git commit -m "feat: add Supabase storage — rules, targets, knowledge, analyses"
```

---

## Task 6: Supabase Storage — User Settings

**Files:**
- Modify: `src/lib/supabase/storage.ts` (append)

The `user_settings` table consolidates 5 localStorage keys into one row per user. All reads/writes go through a cached settings object to minimize DB round-trips.

- [ ] **Step 1: Add user settings functions**

Append to `src/lib/supabase/storage.ts`:

```typescript
// ============================================================
// USER SETTINGS (consolidated JSONB columns)
// ============================================================

export interface UserSettings {
  customColors: Record<string, string>
  accountNicknames: Record<string, string>
  accountTypes: AccountConfig[]
  dismissedRecommendations: string[]
  insightsCache: Record<string, unknown> | null
  migrationCompletedAt: string | null
}

const DEFAULT_SETTINGS: UserSettings = {
  customColors: {},
  accountNicknames: {},
  accountTypes: [],
  dismissedRecommendations: [],
  insightsCache: null,
  migrationCompletedAt: null,
}

function rowToSettings(row: Record<string, unknown>): UserSettings {
  return {
    customColors: (row.custom_colors as Record<string, string>) || {},
    accountNicknames: (row.account_nicknames as Record<string, string>) || {},
    accountTypes: (row.account_types as AccountConfig[]) || [],
    dismissedRecommendations: (row.dismissed_recommendations as string[]) || [],
    insightsCache: (row.insights_cache as Record<string, unknown>) || null,
    migrationCompletedAt: (row.migration_completed_at as string) || null,
  }
}

/** Fetch the full settings row for the current user (household read) */
export async function fetchUserSettings(): Promise<UserSettings | null> {
  const userId = await getUserId()
  if (!userId) return null

  try {
    const { data, error } = await getClient()
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) { console.error('fetchUserSettings error:', error); return null }
    return data ? rowToSettings(data) : DEFAULT_SETTINGS
  } catch (e) {
    console.error('fetchUserSettings exception:', e)
    return null
  }
}

/** Upsert specific fields in user_settings (merges with existing) */
export async function updateUserSettings(
  fields: Partial<{
    custom_colors: Record<string, string>
    account_nicknames: Record<string, string>
    account_types: AccountConfig[]
    dismissed_recommendations: string[]
    insights_cache: Record<string, unknown>
    migration_completed_at: string
  }>
): Promise<boolean> {
  const userId = await getUserId()
  if (!userId) return false

  try {
    const { error } = await getClient()
      .from('user_settings')
      .upsert(
        { user_id: userId, ...fields },
        { onConflict: 'user_id' }
      )
    if (error) { console.error('updateUserSettings error:', error); return false }
    return true
  } catch (e) {
    console.error('updateUserSettings exception:', e)
    return false
  }
}

/** Check if migration has been completed for the current user */
export async function isMigrationCompleted(): Promise<boolean> {
  const settings = await fetchUserSettings()
  return settings?.migrationCompletedAt !== null && settings?.migrationCompletedAt !== undefined
}

/** Mark migration as completed */
export async function markMigrationCompleted(): Promise<boolean> {
  return updateUserSettings({ migration_completed_at: new Date().toISOString() })
}

/** Re-export getUserId for use by migration module */
export { getUserId }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/supabase/storage.ts 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/storage.ts
git commit -m "feat: add Supabase storage — user settings with migration tracking"
```

---

## Task 7: Create Migration Module

**Files:**
- Create: `src/lib/supabase/migration.ts`
- Reference: `src/lib/storage-local.ts`, `src/lib/supabase/storage.ts`

This handles the one-time upload of localStorage data to Supabase on first authenticated load.

- [ ] **Step 1: Create `migration.ts`**

```typescript
// src/lib/supabase/migration.ts
// One-time migration: localStorage → Supabase
// Triggered on first authenticated load when migration_completed_at is null.

import {
  getLocalTransactions,
  getLocalCustomRules,
  getLocalSavingsTargets,
  getLocalKnowledgeEntries,
  getLocalMonthlyAnalyses,
  getLocalCustomColors,
  getLocalAccountNicknames,
  getLocalAccountTypes,
  getLocalDismissedRecommendations,
  getLocalInsightsCache,
  backupLocalStorage,
  getMigrationProgress,
  setMigrationProgress,
  clearMigrationProgress,
} from '@/lib/storage-local'

import {
  isMigrationCompleted,
  markMigrationCompleted,
  updateUserSettings,
  insertNewTransactions,
  upsertCategoryRules,
  upsertSavingsTargets,
  upsertKnowledgeEntries,
  upsertMonthlyAnalysis,
  getUserId,
} from '@/lib/supabase/storage'

export interface MigrationProgress {
  status: 'idle' | 'checking' | 'migrating' | 'complete' | 'error'
  message: string
  current: number
  total: number
}

type ProgressCallback = (progress: MigrationProgress) => void

function report(cb: ProgressCallback | undefined, p: MigrationProgress) {
  cb?.(p)
}

/** Check if migration is needed and run it if so. Returns true if migration ran. */
export async function runMigrationIfNeeded(
  onProgress?: ProgressCallback
): Promise<boolean> {
  report(onProgress, { status: 'checking', message: 'Checking sync status...', current: 0, total: 0 })

  // Must be authenticated
  const userId = await getUserId()
  if (!userId) {
    report(onProgress, { status: 'idle', message: '', current: 0, total: 0 })
    return false
  }

  // Already migrated?
  const completed = await isMigrationCompleted()
  if (completed) {
    report(onProgress, { status: 'complete', message: 'Already synced', current: 0, total: 0 })
    return false
  }

  // Any data to migrate?
  const localTxns = getLocalTransactions()
  const localRules = getLocalCustomRules()
  const localTargets = getLocalSavingsTargets()
  const localKnowledge = getLocalKnowledgeEntries()
  const localAnalyses = getLocalMonthlyAnalyses()

  const hasData = localTxns.length > 0 || localRules.length > 0 || localTargets.length > 0 ||
    localKnowledge.length > 0 || localAnalyses.length > 0

  if (!hasData) {
    // No localStorage data — mark as migrated (fresh user)
    await markMigrationCompleted()
    report(onProgress, { status: 'complete', message: 'No data to sync', current: 0, total: 0 })
    return false
  }

  // Backup localStorage before migration
  backupLocalStorage()

  const totalItems = localTxns.length + localRules.length + localTargets.length +
    localKnowledge.length + localAnalyses.length
  let migrated = 0

  report(onProgress, { status: 'migrating', message: 'Syncing your data...', current: 0, total: totalItems })

  try {
    // 1. User settings (consolidated)
    const settings: Record<string, unknown> = {
      custom_colors: getLocalCustomColors(),
      account_nicknames: getLocalAccountNicknames(),
      account_types: getLocalAccountTypes(),
      dismissed_recommendations: getLocalDismissedRecommendations(),
      insights_cache: getLocalInsightsCache() || {},
    }
    await updateUserSettings(settings as Parameters<typeof updateUserSettings>[0])

    // 2. Category rules
    if (localRules.length > 0) {
      const ok = await upsertCategoryRules(localRules)
      if (!ok) throw new Error('Failed to sync category rules')
      migrated += localRules.length
      report(onProgress, { status: 'migrating', message: 'Synced category rules', current: migrated, total: totalItems })
    }

    // 3. Savings targets
    if (localTargets.length > 0) {
      const ok = await upsertSavingsTargets(localTargets)
      if (!ok) throw new Error('Failed to sync savings targets')
      migrated += localTargets.length
      report(onProgress, { status: 'migrating', message: 'Synced savings targets', current: migrated, total: totalItems })
    }

    // 4. Knowledge entries
    if (localKnowledge.length > 0) {
      const ok = await upsertKnowledgeEntries(localKnowledge)
      if (!ok) throw new Error('Failed to sync knowledge entries')
      migrated += localKnowledge.length
      report(onProgress, { status: 'migrating', message: 'Synced knowledge entries', current: migrated, total: totalItems })
    }

    // 5. Transactions — batch in chunks of 500
    const BATCH_SIZE = 500
    const startBatch = getMigrationProgress() // resume from last successful batch
    for (let i = startBatch * BATCH_SIZE; i < localTxns.length; i += BATCH_SIZE) {
      const batch = localTxns.slice(i, i + BATCH_SIZE)
      const batchIndex = Math.floor(i / BATCH_SIZE)
      const ok = await insertNewTransactions(batch)
      if (!ok) throw new Error(`Failed to sync transactions batch ${batchIndex}`)
      setMigrationProgress(batchIndex + 1)
      migrated += batch.length
      report(onProgress, {
        status: 'migrating',
        message: `Syncing transactions (${Math.min(i + BATCH_SIZE, localTxns.length)} of ${localTxns.length})`,
        current: migrated,
        total: totalItems,
      })
    }

    // 6. Monthly analyses
    for (const analysis of localAnalyses) {
      await upsertMonthlyAnalysis(analysis.cycleId, analysis.analysis)
      migrated++
    }

    // Done — mark migration complete
    await markMigrationCompleted()
    clearMigrationProgress()
    report(onProgress, { status: 'complete', message: 'Sync complete!', current: totalItems, total: totalItems })
    return true
  } catch (e) {
    console.error('Migration error:', e)
    report(onProgress, {
      status: 'error',
      message: `Sync error: ${e instanceof Error ? e.message : 'Unknown error'}. Will retry on next load.`,
      current: migrated,
      total: totalItems,
    })
    return false
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/supabase/migration.ts 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/migration.ts
git commit -m "feat: add one-time localStorage → Supabase migration with progress tracking"
```

---

## Task 8: Rewrite `storage.ts` as Orchestrator

**Files:**
- Modify: `src/lib/storage.ts` (full rewrite)

This is the pivotal change. `storage.ts` keeps all its existing function names and signatures but makes them async. Each function tries Supabase first, falls back to localStorage.

- [ ] **Step 1: Rewrite `storage.ts`**

The new `storage.ts` must:
- Keep every exported function name (no breaking changes for consumers)
- Make functions async (return Promises)
- Try Supabase first, update localStorage cache on success
- Fall back to localStorage if Supabase fails or user is not authenticated
- Keep `getDisplayName()` synchronous (reads from cache only)
- Keep `recategorizeAll()` — but now it reads from Supabase, diffs, and batch-updates only changed rows

Read the current `src/lib/storage.ts` in full. Then rewrite it following this pattern for each function group:

**Read functions:**
```typescript
export async function getTransactions(): Promise<Transaction[]> {
  const remote = await fetchTransactions()
  if (remote !== null) {
    setLocalTransactions(remote)
    return remote
  }
  return getLocalTransactions()
}
```

**Write functions:**
```typescript
export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  const ok = await upsertTransactions(transactions)
  if (ok) {
    setLocalTransactions(transactions)
  }
  // If Supabase fails, do NOT update cache (prevents drift)
}
```

**Compound functions (recategorizeAll):**
```typescript
export async function recategorizeAll(): Promise<{ updated: number; total: number }> {
  // 1. Get current user's transactions from Supabase
  const all = await getTransactions()
  const rules = await getCustomRules()

  // 2. Apply rules client-side (same keyword logic as before)
  // ... (keep existing categorization logic from the current recategorizeAll)

  // 3. Collect only changed transactions
  const changes: (Partial<Transaction> & { id: string })[] = []
  // ... diff logic

  // 4. Batch update changed rows in Supabase
  if (changes.length > 0) {
    await updateTransactionsInSupabase(changes)
  }

  return { updated: changes.length, total: all.length }
}
```

**`mergeTransactions` (CSV upload dedup — uses `insertNewTransactions` not full upsert):**
```typescript
export async function mergeTransactions(incoming: Transaction[]): Promise<Transaction[]> {
  // Insert new only — ON CONFLICT DO NOTHING preserves existing manual corrections
  await insertNewTransactions(incoming)
  // Re-fetch the full list from Supabase (now includes new + existing)
  const all = await getTransactions()
  setLocalTransactions(all)
  return all
}
```

**`addCustomRule` (compound: insert rule + recategorize matching transactions):**
```typescript
export async function addCustomRule(rule: CategoryRule): Promise<void> {
  // 1. Save the rule
  const existingRules = await getCustomRules()
  const idx = existingRules.findIndex(r => r.pattern === rule.pattern)
  if (idx >= 0) existingRules[idx] = rule
  else existingRules.push(rule)
  await saveCustomRules(existingRules)

  // 2. Recategorize matching transactions
  const all = await getTransactions()
  const pattern = rule.pattern.toLowerCase()
  const changes: (Partial<Transaction> & { id: string })[] = []
  for (const t of all) {
    const matchField = (t.rawDescription || t.description).toLowerCase()
    if (matchField.includes(pattern) && t.categorySource !== 'manual') {
      changes.push({
        id: t.id,
        category: rule.category,
        subcategory: rule.subcategory,
        isEssential: rule.isEssential,
        categorySource: 'rule',
      })
    }
  }
  if (changes.length > 0) {
    await updateTransactionsRemote(changes) // uses batched updateTransactions from supabase/storage.ts
  }
}
```

**`getCustomCategories` and `addCustomCategory` (map to user_settings custom_colors):**
```typescript
export async function getCustomCategories(): Promise<Record<string, string>> {
  const settings = await fetchUserSettings()
  if (settings) {
    setLocalCustomColors(settings.customColors)
    return settings.customColors
  }
  return getLocalCustomColors()
}

export async function addCustomCategory(name: string, color: string): Promise<void> {
  const current = await getCustomCategories()
  const updated = { ...current, [name]: color }
  const ok = await updateUserSettings({ custom_colors: updated })
  if (ok) setLocalCustomColors(updated)
}
```

**`getDisplayName` stays synchronous (cache-only reader):**
```typescript
export function getDisplayName(rawName: string): string {
  const nicknames = getLocalAccountNicknames() // sync, from storage-local
  return nicknames[rawName] || rawName
}
```

The implementer should read the full current `storage.ts` (335 lines) and rewrite each function following the patterns above. The `StoredAnalysis` type should be imported from `storage-local.ts` and re-exported for consumers.

**Key distinction for the orchestrator:**
- `mergeTransactions()` → calls `insertNewTransactions()` (DO NOTHING on conflict — CSV dedup)
- `saveTransactions()` → calls `upsertTransactions()` (DO UPDATE on conflict — full save after modifications)
- `updateTransactions()` → calls Supabase `updateTransactions()` (batched partial updates)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/storage.ts 2>&1 | head -30`
Expected: Many errors from consumers calling sync functions — this is expected. The next tasks fix those.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: rewrite storage.ts as Supabase-first orchestrator with localStorage cache"
```

---

## Task 9: Update `useTransactions.ts` and `transactions.tsx` Context

**Files:**
- Modify: `src/hooks/useTransactions.ts`
- Modify: `src/context/transactions.tsx`

- [ ] **Step 1: Update `useTransactions.ts` for async**

Key changes to make:
1. Add `loading` state: `const [loading, setLoading] = useState(true)`
2. Make the `useEffect` init async — replace the synchronous chain with:
   ```typescript
   useEffect(() => {
     let cancelled = false
     async function init() {
       // Show cached data instantly
       const cached = getLocalTransactions() // sync, from storage-local
       if (cached.length > 0 && !loadedRef.current) {
         setAllTransactions(cached)
       }

       // Fetch from Supabase (storage.ts orchestrator handles fallback)
       const data = await getTransactions() // async

       if (cancelled) return

       // Run initialization chain on fetched data
       const currentTypes = await getAccountTypes()
       const detected = detectAllAccountTypes(data, currentTypes)
       await saveAccountTypes(detected)
       const { transactions: reclassified, changed } = reclassifyTransfers(data, detected)
       if (changed > 0) {
         await saveTransactions(reclassified)
       }

       setAllTransactions(reclassified)
       setLoaded(true)
       setLoading(false)
       loadedRef.current = true
     }
     init()
     return () => { cancelled = true }
   }, [])
   ```
3. Remove `recategorizeAll()` from the load path — categories are persisted in Supabase
4. Make mutation methods async:
   - `addTransactions` → `async addTransactions` (calls `await mergeTransactions(...)`)
   - `updateMany` → `async updateMany` (calls `await updateTransactions(...)`)
   - `updateOne` → `async updateOne`
   - `clear` → `async clear`
5. Add `loading` to the return object
6. Import `getLocalTransactions` from `@/lib/storage-local` for the instant cache display
7. All other imports from `@/lib/storage` stay the same (function names unchanged)

- [ ] **Step 2: Update `context/transactions.tsx`**

The context type is `ReturnType<typeof useTransactions>` — this automatically picks up the new `loading` field. No type changes needed.

However, verify that `TransactionProvider` and `useTransactionContext` still work. The only risk is if any consumer destructures a field that no longer exists.

**Note on `src/app/upload/page.tsx`:** This page uses `addTransactions` from the context (not from storage directly). Since `addTransactions` becomes async, the upload page's `processFile` callback needs `await addTransactions(parsedTransactions)`. The return value (merged array) is still returned from the promise. Verify the upload flow handles this — make the callback async and add `await`.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit src/hooks/useTransactions.ts src/context/transactions.tsx 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTransactions.ts src/context/transactions.tsx
git commit -m "feat: async useTransactions with loading state and Supabase-first init"
```

---

## Task 10: Update Dashboard Page and Dashboard Components

**Files:**
- Modify: `src/app/page.tsx` (lines ~505, 524: `getSavingsTargets`, `saveSavingsTargets`)
- Modify: `src/components/dashboard/recommendations-panel.tsx` (lines ~24, 32)
- Modify: `src/components/dashboard/ai-analysis.tsx` (lines ~50, 125, 172)

- [ ] **Step 1: Update `src/app/page.tsx`**

Changes needed:
- Line ~505: `setTargets(getSavingsTargets())` → wrap in async:
  ```typescript
  useEffect(() => {
    getSavingsTargets().then(setTargets)
  }, [])
  ```
- Line ~524: `saveSavingsTargets(updated)` → `await saveSavingsTargets(updated)` (this is in an event handler, make it async)
- Add loading indicator from `useTransactionContext()` if needed

- [ ] **Step 2: Update `recommendations-panel.tsx`**

Changes needed:
- Line ~24: `useState(() => getDismissedRecommendations())` → cannot use async in useState initializer. Change to:
  ```typescript
  const [dismissed, setDismissed] = useState<string[]>([])
  useEffect(() => {
    getDismissedRecommendations().then(setDismissed)
  }, [])
  ```
- Line ~32: `dismissRecommendation(id)` → `await dismissRecommendation(id)` (in event handler)

- [ ] **Step 3: Update `ai-analysis.tsx`**

Changes needed:
- Line ~50: `getAnalysisForCycle(period)` in useEffect → `await getAnalysisForCycle(period)` (already async-compatible if useEffect uses async IIFE)
- Line ~125: `getAnalysisForCycle(period)` → already in async function, just add `await`
- Line ~172: `saveMonthlyAnalysis(period, data.analysis)` → add `await`

- [ ] **Step 4: Verify all three compile**

Run: `npx tsc --noEmit src/app/page.tsx src/components/dashboard/recommendations-panel.tsx src/components/dashboard/ai-analysis.tsx 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/dashboard/recommendations-panel.tsx src/components/dashboard/ai-analysis.tsx
git commit -m "feat: async storage calls in dashboard page and components"
```

---

## Task 11: Update Accounts, Categories, and Transactions Pages

**Files:**
- Modify: `src/app/accounts/page.tsx`
- Modify: `src/app/categories/page.tsx`
- Modify: `src/app/transactions/page.tsx`

- [ ] **Step 1: Update `accounts/page.tsx`**

Changes needed:
- Line ~95: `getDisplayName(rawName)` in useMemo — **no change needed**, `getDisplayName` stays synchronous (reads from cache)
- Line ~227: `saveAccountNickname(rawName, trimmed)` → `await saveAccountNickname(...)` (in event handler)
- Line ~338: `setAccountType(rawName, newType)` → `await setAccountType(...)` (in event handler)
- Line ~464, ~678: `getDisplayName(...)` in render — **no change needed**, stays sync

- [ ] **Step 2: Update `categories/page.tsx`**

Changes needed:
- Line ~86: `setCustomRules(getCustomRules())` in useEffect → `getCustomRules().then(setCustomRules)`
- Line ~140: `addCustomRule(rule)` in onClick → `await addCustomRule(rule)`
- Line ~141: `setCustomRules(getCustomRules())` → `setCustomRules(await getCustomRules())`
- Line ~156: `saveCustomRules(updated)` → `await saveCustomRules(updated)`
- Line ~160: `getTransactions()` → `await getTransactions()`
- Line ~179: `saveTransactions(allTransactions)` → `await saveTransactions(allTransactions)`

- [ ] **Step 3: Update `transactions/page.tsx`**

Changes needed:
- Line ~93, ~200: `getTransactions()` → `await getTransactions()` (already in async callbacks)
- Line ~104, ~208: `saveTransactions(all)` → `await saveTransactions(all)` (already in async callbacks)

- [ ] **Step 4: Verify all three compile**

Run: `npx tsc --noEmit src/app/accounts/page.tsx src/app/categories/page.tsx src/app/transactions/page.tsx 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/accounts/page.tsx src/app/categories/page.tsx src/app/transactions/page.tsx
git commit -m "feat: async storage calls in accounts, categories, transactions pages"
```

---

## Task 12: Update Knowledge, Insights, Ask Pages, and CategoryEditor

**Files:**
- Modify: `src/app/knowledge/page.tsx`
- Modify: `src/app/insights/page.tsx`
- Modify: `src/app/ask/page.tsx`
- Modify: `src/components/CategoryEditor.tsx`

- [ ] **Step 1: Update `knowledge/page.tsx`**

Changes needed:
- Line ~83: `setEntries(getKnowledgeEntries())` in useEffect → `getKnowledgeEntries().then(setEntries)`
- Line ~139: `addKnowledgeEntry({...})` in onClick → `await addKnowledgeEntry(...)` (make handler async)
- Line ~155: `deleteKnowledgeEntry(id)` → `await deleteKnowledgeEntry(id)`
- Line ~188: `saveKnowledgeEntries(updated)` → `await saveKnowledgeEntries(updated)`

- [ ] **Step 2: Update `insights/page.tsx`**

Changes needed:
- Line ~86: `getCachedInsights()` in useEffect → async IIFE: `const cached = await getCachedInsights()`
- Line ~92: `getSavingsTargets()` in useEffect → `await getSavingsTargets()`
- Line ~128: `cacheInsights(data)` → `await cacheInsights(data)` (already in async function)
- Line ~146: `saveSavingsTargets([target])` → `await saveSavingsTargets([target])`

- [ ] **Step 3: Update `ask/page.tsx`**

Changes needed:
- Line ~162: `getKnowledgeEntries()` in useCallback → `await getKnowledgeEntries()` (make the callback async)
- Line ~170: `getAccountNicknames()` in useCallback → `await getAccountNicknames()`

- [ ] **Step 4: Update `CategoryEditor.tsx`**

Changes needed:
- Line ~85: `getCustomCategories()` in useEffect → `getCustomCategories().then(setCategories)` or async IIFE
- Line ~183: `addCustomCategory(name, color)` → `await addCustomCategory(name, color)` (make handler async)
- Line ~201: `addCustomRule({...})` → `await addCustomRule(...)` (make handler async)

- [ ] **Step 5: Verify all four compile**

Run: `npx tsc --noEmit src/app/knowledge/page.tsx src/app/insights/page.tsx src/app/ask/page.tsx src/components/CategoryEditor.tsx 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge/page.tsx src/app/insights/page.tsx src/app/ask/page.tsx src/components/CategoryEditor.tsx
git commit -m "feat: async storage calls in knowledge, insights, ask pages and CategoryEditor"
```

---

## Task 13: Wire Up Migration in Layout Shell

**Files:**
- Modify: `src/components/layout-shell.tsx`

The migration must run BEFORE `TransactionProvider` mounts. Otherwise, the hook's `useEffect` will fetch from Supabase (still empty during migration), get nothing, and overwrite the localStorage cache with empty data.

**Architecture:** Layout shell gates child rendering on migration completion. Migration runs first; only after it completes (or determines no migration is needed) does `TransactionProvider` mount and fetch data.

- [ ] **Step 1: Add migration gate and progress banner**

In `layout-shell.tsx`, add:
```typescript
import { runMigrationIfNeeded, MigrationProgress } from '@/lib/supabase/migration'
import { cleanupBackups } from '@/lib/storage-local'

// Inside the component, BEFORE the TransactionProvider:
const [migrationDone, setMigrationDone] = useState(false)
const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null)

useEffect(() => {
  async function checkMigration() {
    await runMigrationIfNeeded(setMigrationProgress)
    setMigrationDone(true)
    cleanupBackups()
  }
  checkMigration()
}, [])

// Gate: don't render TransactionProvider until migration is done
if (!migrationDone) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      {migrationProgress?.status === 'migrating' ? (
        <div className="text-center">
          <p className="text-lg font-medium">{migrationProgress.message}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {migrationProgress.current} / {migrationProgress.total}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">Loading...</p>
      )}
    </div>
  )
}
// Only after migrationDone === true do we render TransactionProvider + children
```

Also show error banner if migration failed (migration still marks `migrationDone = true` so the app isn't blocked, but warns the user):
```tsx
{migrationProgress?.status === 'error' && (
  <div className="bg-red-600 text-white text-sm px-4 py-2 text-center">
    {migrationProgress.message}
  </div>
)}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/components/layout-shell.tsx 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/layout-shell.tsx
git commit -m "feat: trigger localStorage → Supabase migration on first authenticated load"
```

---

## Task 14: Full Build Verification and Cleanup

**Files:**
- All modified files
- Modify: `src/lib/CLAUDE.md` (update storage docs)

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors. Fix any remaining type issues.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings). Fix any new lint issues.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Successful build with no errors. This catches SSR issues, missing imports, etc.

- [ ] **Step 4: Run dev server and smoke test**

Run: `npm run dev`
- Navigate to `http://localhost:3000` — should load with cached data (no errors in console)
- Check browser console for any Supabase connection errors
- The migration banner should appear if localStorage has data and Supabase is empty

- [ ] **Step 5: Update `src/lib/CLAUDE.md`**

Update the storage documentation to reflect the new architecture:
- `storage.ts` is now an async orchestrator (Supabase primary, localStorage cache)
- `storage-local.ts` is the pure localStorage cache layer
- `supabase/storage.ts` is the Supabase CRUD layer
- `supabase/migration.ts` handles one-time data upload

- [ ] **Step 6: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete localStorage → Supabase migration — build verified"
```

---

## Task 15: Deploy and Verify on Production

**Files:** None (infrastructure only)

- [ ] **Step 1: Push to main (triggers Vercel auto-deploy)**

Run: `git push origin main`
Expected: Push succeeds. Vercel starts building.

- [ ] **Step 2: Monitor Vercel deployment**

Run: `vercel ls`
Expected: New deployment in progress or completed.

- [ ] **Step 3: Verify on production**

- Open `https://savings-lovat.vercel.app` on laptop
- Log in with `larixavieruk7@gmail.com`
- Migration banner should appear and complete
- Verify transactions, rules, targets, knowledge entries, analyses all visible
- Upload a test CSV — verify it appears immediately
- Open on phone — verify same data appears after login

- [ ] **Step 4: Verify household sharing**

- Log in with a second account (`lari_uk@gmail.com` or `gusampteam@hotmail.com`)
- Verify all household transactions are visible
- Upload a CSV from this account
- Switch back to first account — verify the new upload is visible
