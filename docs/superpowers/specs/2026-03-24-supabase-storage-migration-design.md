# localStorage → Supabase Storage Migration — Design Spec

**Date:** 2026-03-24
**Goal:** Replace localStorage with Supabase as the primary data store so both Gus and Larissa can upload CSV bank statements from any device (including mobiles) and see shared household financial data with AI insights.

---

## 1. Problem

The app currently stores all data in the browser's localStorage. This means:
- Data is trapped on one device, one browser
- Two people can't share a household view
- Uploading from a phone doesn't sync to the laptop
- If the browser cache is cleared, all data is lost

Supabase tables and auth are already deployed. The app needs to read/write Supabase instead of localStorage.

---

## 2. Architecture Decision: Client-Side Supabase (Not API Routes)

**Chosen approach:** Replace `storage.ts` internals with Supabase browser client calls, keeping identical function signatures.

**Why not API routes?**
- RLS (Row Level Security) already enforces per-user data isolation at the database level
- The Supabase browser client uses the authenticated session cookie automatically
- Adding API routes would mean: extra latency, extra files, extra maintenance — for zero security benefit over RLS
- All pages are already `'use client'` — client-side Supabase calls are natural

**Why keep localStorage as cache?**
- Instant page load (no spinner on every navigation)
- Offline resilience (app still works if Supabase is temporarily unreachable)
- Pattern: show cached data immediately → refresh from Supabase in background

---

## 3. Data Flow (Before vs After)

### Before (current)
```
User action → useTransactions hook → storage.ts → localStorage
                                                      ↕
                                              (stuck on one device)
```

### After (target)
```
User action → useTransactions hook → storage.ts → Supabase (primary)
                                         ↕
                                    localStorage (cache)
```

### Read pattern (stale-while-revalidate)
1. On page load: read localStorage cache → render immediately
2. In background: fetch from Supabase → update state + refresh cache
3. If Supabase fails: cached data is still displayed, no error shown to user

### Write pattern (write-through, no offline queue)
1. On save: write to Supabase first (source of truth)
2. If Supabase succeeds: update localStorage cache + update React state
3. If Supabase fails: show error toast, do NOT write to localStorage (prevents drift). User retries.

**Rationale for no offline writes:** This is a household dashboard where users upload CSVs weekly. True offline write support would require a sync queue and conflict resolution — complexity that provides negligible benefit. If Supabase is unreachable, the user sees cached data and retries the write when online.

---

## 4. Schema Changes Required

Before modifying the storage layer, the `transactions` table needs two additional columns that exist in the TypeScript `Transaction` interface but were omitted from the original migration SQL:

```sql
ALTER TABLE transactions ADD COLUMN raw_description TEXT;
ALTER TABLE transactions ADD COLUMN user_note TEXT;
```

- `raw_description`: The original bank statement text before merchant name cleaning. Used by `recategorizeAll()` to re-apply categorization rules against the raw string. Without it, recategorization matches against cleaned descriptions and produces incorrect results.
- `user_note`: Free-text user annotation (e.g., "Health Express = Mounjaro for Larissa"). Losing these would destroy user context.

Drop the redundant composite unique constraint (the PK on `id` already enforces uniqueness):
```sql
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_id_user_id_key;
```

Add the migration tracking column to `user_settings`:
```sql
ALTER TABLE user_settings ADD COLUMN migration_completed_at TIMESTAMPTZ;
```

Additionally, add an `updated_at` auto-update trigger for `user_settings`:
```sql
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_settings_modtime BEFORE UPDATE ON user_settings
FOR EACH ROW EXECUTE FUNCTION update_modified_column();
```

---

## 5. Module Design

### 5.1 `src/lib/supabase/storage.ts` (NEW — core Supabase storage layer)

A new module that mirrors every function in the existing `storage.ts` but talks to Supabase. Each function:
- Takes an implicit `user_id` from the Supabase session (RLS handles filtering)
- Returns typed data matching the existing interfaces
- Handles errors gracefully (returns null/empty on failure)
- Uses a singleton Supabase browser client (created once at module scope via `createClient()`)

**Generate Supabase TypeScript types** before implementation:
```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
This enables compile-time schema validation and catches column mismatches early.

Functions to implement:

| Existing function | Supabase equivalent | Table |
|---|---|---|
| `getTransactions()` | `fetchTransactions()` | `transactions` |
| `saveTransactions(txns)` | `upsertTransactions(txns)` | `transactions` |
| `mergeTransactions(existing, incoming)` | `mergeTransactions(incoming)` | `transactions` (see conflict strategy below) |
| `updateTransactions(updates)` | `updateTransactions(updates)` | `transactions` |
| `clearTransactions()` | `deleteAllTransactions()` | `transactions` (`DELETE WHERE user_id = auth.uid()`) |
| `getCustomRules()` | `fetchCategoryRules()` | `category_rules` |
| `saveCustomRules(rules)` | `upsertCategoryRules(rules)` | `category_rules` |
| `addCustomRule(rule)` | `insertCategoryRule(rule)` + `updateTransactionCategories(matchingIds, category)` | `category_rules` + `transactions` (compound — see §5.5) |
| `getSavingsTargets()` | `fetchSavingsTargets()` | `savings_targets` |
| `saveSavingsTargets(targets)` | `upsertSavingsTargets(targets)` | `savings_targets` |
| `getKnowledgeEntries()` | `fetchKnowledgeEntries()` | `knowledge_entries` |
| `addKnowledgeEntry(entry)` | `insertKnowledgeEntry(entry)` | `knowledge_entries` |
| `saveKnowledgeEntries(entries)` | `upsertKnowledgeEntries(entries)` | `knowledge_entries` (full replace via delete + insert) |
| `deleteKnowledgeEntry(id)` | `deleteKnowledgeEntry(id)` | `knowledge_entries` |
| `getMonthlyAnalyses()` | `fetchMonthlyAnalyses()` | `monthly_analyses` |
| `getAnalysisForCycle(cycleId)` | `fetchAnalysisForCycle(cycleId)` | `monthly_analyses` (server-filtered) |
| `saveMonthlyAnalysis(analysis)` | `upsertMonthlyAnalysis(analysis)` | `monthly_analyses` |
| `getAccountNicknames()` | `fetchUserSettings().account_nicknames` | `user_settings` |
| `saveAccountNickname(name, nick)` | `updateUserSettings({account_nicknames})` | `user_settings` |
| `getAccountTypes()` | `fetchUserSettings().account_types` | `user_settings` |
| `saveAccountTypes(types)` / `setAccountType()` | `updateUserSettings({account_types})` | `user_settings` (read-modify-write on JSONB) |
| `getCustomColors()` / `getCustomCategories()` | `fetchUserSettings().custom_colors` | `user_settings` |
| `saveCustomColors(colors)` / `addCustomCategory()` | `updateUserSettings({custom_colors})` | `user_settings` |
| `getDismissedRecommendations()` | `fetchUserSettings().dismissed_recommendations` | `user_settings` |
| `dismissRecommendation(id)` | `updateUserSettings({dismissed_recommendations})` | `user_settings` |
| `getCachedInsights()` | `fetchUserSettings().insights_cache` | `user_settings` |
| `cacheInsights(insights)` | `updateUserSettings({insights_cache})` | `user_settings` |
| `getDisplayName(account)` | N/A — stays synchronous, reads from localStorage cache only | — |

### 5.2 Merge/Dedup Conflict Strategy

The current `mergeTransactions()` **preserves existing data** when a duplicate ID is found — incoming duplicates are discarded, keeping manual category corrections intact.

For Supabase, this translates to `ON CONFLICT (id) DO NOTHING` for most fields. However, for the upload flow, we want to update certain fields if the transaction already exists (e.g., `balance` may not have been present in the original upload).

**Strategy:**
- New CSV upload → `INSERT ... ON CONFLICT (id) DO NOTHING` (preserves existing, including manual corrections)
- Manual category edit → `UPDATE ... WHERE id = X` (explicit update of specific fields)
- `recategorizeAll()` → batch `UPDATE` for changed rows only (see §5.5)

**Global dedup (not per-user):** Transaction IDs include the account number, so they are globally unique. Change the constraint from `UNIQUE (id, user_id)` to just the existing `PRIMARY KEY (id)`. This prevents the same transaction appearing twice when Larissa uploads Gus's bank statement and then Gus uploads the same file. The first upload wins.

### 5.3 `src/lib/storage.ts` (MODIFIED — becomes orchestrator)

The existing `storage.ts` becomes a thin orchestrator that:
1. Keeps all existing function signatures (no breaking changes to consumers)
2. Makes functions async (returns Promises)
3. Implements the read/write patterns described in section 3
4. Falls back to localStorage-only when not authenticated (login page, etc.)

```typescript
// Example transformation
// BEFORE:
export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(KEYS.transactions)
  return raw ? JSON.parse(raw) : []
}

// AFTER:
export async function getTransactions(): Promise<Transaction[]> {
  // 1. Read cache as fallback (the hook handles optimistic display separately)
  const cached = getLocalTransactions()

  // 2. Try Supabase (if authenticated)
  const remote = await fetchTransactions()
  if (remote !== null) {
    setLocalTransactions(remote) // update cache
    return remote
  }

  // 3. Fallback to cache
  return cached
}
```

### 5.4 `src/lib/storage-local.ts` (EXTRACTED — pure localStorage functions)

Extract the current localStorage read/write logic into a dedicated module. These become the "cache layer" — only called by `storage.ts`, never directly by hooks or pages.

### 5.5 Compound Operations: `recategorizeAll()` and `addCustomRule()`

These are read-modify-write operations that need special handling:

**`recategorizeAll()`:**
1. Fetch all transactions from Supabase (household-wide via RLS read policy), then filter to only `user_id = currentUser` since RLS will reject updates to other users' rows
2. Apply categorization rules client-side (using `rawDescription` for matching)
3. Diff against current categories — collect only the changed transactions
4. Batch-update ONLY changed rows in Supabase (`UPDATE transactions SET category = X WHERE id IN (...)`)
5. RLS ensures each user can only update their own transactions (see §8 for household policy)

**Performance note:** `recategorizeAll()` currently runs on every page load in `useTransactions.ts`. After migration, this should run ONLY when rules change (not on every load), since Supabase transactions already have their categories persisted. On page load, just fetch the pre-categorized data.

**`addCustomRule()`:**
1. Insert the new rule into `category_rules`
2. Fetch transactions matching the rule pattern from Supabase
3. Update their categories in a single batch
4. Return the updated transactions for React state update

### 5.6 `src/hooks/useTransactions.ts` (MODIFIED — async-aware)

Key changes:
- Add `loading` state (true until first Supabase fetch completes)
- Remove `recategorizeAll()` from the load path (categories are already persisted in Supabase)
- Preserve the full initialization chain: fetch → detectAccountTypes → reclassifyTransfers → setState
- All mutation methods become async
- Expose `loading` to consumers for UI feedback

```typescript
// Full async initialization chain (not simplified)
function useTransactions() {
  const [transactions, setAllTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      // 1. Show cached data instantly
      const cached = getLocalTransactions()
      if (cached.length) {
        setAllTransactions(cached)
      }

      // 2. Fetch from Supabase
      const remote = await fetchTransactions()
      const data = remote ?? cached

      // 3. Run initialization chain (same as current, but on fetched data)
      const accountTypes = await getAccountTypes()
      const detected = detectAllAccountTypes(data, accountTypes)
      const reclassified = reclassifyTransfers(data, detected)

      // 4. Update state and cache
      setAllTransactions(reclassified)
      setLocalTransactions(reclassified)
      setLoading(false)
    }
    init()
  }, [])

  // ... mutations, computed values unchanged
}
```

### 5.7 `src/context/transactions.tsx` (MODIFIED — expose loading state)

Add `loading` to the context value so pages can show loading indicators.

### 5.8 All pages/components that call storage directly

Complete list of files that bypass the hook and call `storage.ts` functions directly — all need async updates:

| File | Functions called | Change needed |
|---|---|---|
| `src/app/accounts/page.tsx` | `getAccountNicknames`, `saveAccountNickname`, `getAccountTypes`, `saveAccountTypes`, `setAccountType` | Await async calls |
| `src/app/categories/page.tsx` | `getCustomRules`, `saveCustomRules`, `recategorizeAll` | Await async calls |
| `src/app/knowledge/page.tsx` | `getKnowledgeEntries`, `addKnowledgeEntry`, `deleteKnowledgeEntry` | Await async calls |
| `src/app/insights/page.tsx` | `getCachedInsights`, `cacheInsights`, `getSavingsTargets`, `saveSavingsTargets` | Await async calls |
| `src/app/page.tsx` (dashboard) | `getDismissedRecommendations`, `dismissRecommendation`, `getMonthlyAnalyses`, `saveMonthlyAnalysis`, `getSavingsTargets`, `saveSavingsTargets` | Await async calls |
| `src/app/transactions/page.tsx` | `saveTransactions`, `getTransactions`, `recategorizeAll` | Await async calls |
| `src/app/ask/page.tsx` | `getKnowledgeEntries`, `getAccountNicknames` | Await async calls (read-only) |
| `src/components/dashboard/recommendations-panel.tsx` | `getDismissedRecommendations`, `dismissRecommendation` | Await async calls |
| `src/components/dashboard/ai-analysis.tsx` | `getAnalysisForCycle`, `saveMonthlyAnalysis` | Await async calls |
| `src/components/CategoryEditor.tsx` | `addCustomRule`, `getCustomCategories`, `addCustomCategory` | Await async calls |

**Note on `getDisplayName()`:** This pure helper reads nicknames and returns a display string. It remains synchronous — it reads from the localStorage cache only. No Supabase call needed since nicknames are fetched and cached on init.

---

## 6. One-Time Data Migration (localStorage → Supabase)

### Trigger mechanism

Use a dedicated `migration_completed_at` timestamp in `user_settings` (not a row count check). Logic:

1. App loads → check `user_settings.migration_completed_at` for current user
2. If null AND localStorage has data → trigger migration
3. If migration succeeds → set `migration_completed_at = NOW()`
4. If migration fails mid-way → do NOT set the flag → retry on next load

This is robust against partial failures: if 500 of 2000 transactions uploaded before a network error, the flag is not set, so the next load retries. Upserts with `ON CONFLICT DO NOTHING` make retries idempotent.

### Data validation before upload

Before uploading, validate each record:
- Amounts are integers (no floats that crept in)
- Dates parse as valid ISO strings
- Required fields present (`description`, `amount` for transactions)
- Skip invalid records with a warning log (don't block the whole migration)

### Migration order (respects foreign key dependencies):
1. `user_settings` (no dependencies) — creates the row with `migration_completed_at = null`
2. `category_rules` (no dependencies)
3. `savings_targets` (no dependencies)
4. `knowledge_entries` (no dependencies)
5. `transactions` (largest dataset — batch in chunks of 500)
6. `monthly_analyses` (no dependencies)
7. Set `migration_completed_at = NOW()` on success

### Progress tracking

Show a progress indicator: "Syncing your data... (1,500 of 3,200 transactions)". Track the last successfully uploaded batch index in a temporary localStorage key (`savings_migration_progress`). On retry, skip already-uploaded batches (combined with `ON CONFLICT DO NOTHING` for safety).

### Rollback safety

During migration, preserve original localStorage data under backup keys (e.g., `savings_transactions_backup_v1`). The stale-while-revalidate pattern would normally overwrite localStorage with Supabase data — the backup prevents this from destroying the original. Clean up backups after 30 days via a simple timestamp check.

### User interaction during migration

The user CAN interact with the app during migration — they see cached data immediately. The migration runs in the background. A small banner shows progress. Once complete, the banner disappears and fresh data loads from Supabase.

---

## 7. User ID Injection

Supabase RLS requires `user_id` on every row. The current localStorage data has no `user_id`.

**Solution:** On migration, the app reads the current Supabase session (`supabase.auth.getUser()`) and injects the `user_id` into every row before upload.

For ongoing writes, every insert/upsert function in `supabase/storage.ts` will inject `user_id` from the session automatically.

---

## 8. Multi-User Household: Split RLS Policies

Both Gus and Larissa will upload their own bank statements. The household needs shared reading but safe writing.

### RLS approach: Read All, Write Own

Create a `household_members` table for future flexibility, but for now use a simple approach with split policies:

```sql
-- All tables get this pattern:

-- Read: household can see all members' data
CREATE POLICY "Household reads" ON transactions FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));

-- Insert: only as yourself
CREATE POLICY "Users insert own" ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update: only your own rows
CREATE POLICY "Users update own" ON transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete: only your own rows
CREATE POLICY "Users delete own" ON transactions FOR DELETE
  USING (auth.uid() = user_id);
```

This prevents `recategorizeAll()` by one user from overwriting another user's category corrections. Each user's recategorization only touches rows where `user_id = auth.uid()`.

**Tech debt note:** The hardcoded email list works for this 3-person household. If the household changes, a `household_members` table with `household_id` would be the upgrade path. Not needed now.

### Transaction dedup across users

Transaction IDs include the account number, making them globally unique. With `PRIMARY KEY (id)` (no composite with `user_id`), if Larissa uploads Gus's Amex CSV, and Gus later uploads the same file, the second upload is a no-op (`ON CONFLICT DO NOTHING`). The `user_id` on the row reflects whoever uploaded first — this is fine because both users can read all household data.

---

## 9. Error Handling

| Scenario | Behavior |
|---|---|
| Supabase unreachable on read | Show cached localStorage data, no error shown |
| Supabase unreachable on write | Show error toast: "Could not save — check your connection and try again". Do NOT write to localStorage (prevents drift) |
| Supabase returns error on write | Show toast with error details, do NOT cache the failed write |
| Migration fails mid-way | Do not set `migration_completed_at` flag. Retry on next load. Progress tracked for resume. Upserts are idempotent. |
| User not authenticated | Fall back to localStorage-only mode (preserves current behavior for the login page) |

---

## 10. Testing Strategy

1. **Unit tests for `supabase/storage.ts`** — mock Supabase client, verify correct queries and conflict handling
2. **Integration test for migration** — seed localStorage, run migration, verify Supabase data, verify backup keys created
3. **Manual smoke test** — upload CSV on laptop, verify it appears on phone
4. **Edge cases:** empty localStorage, partial migration resume, concurrent uploads from two devices, recategorizeAll with mixed user_ids
5. **Generate TypeScript types** — `npx supabase gen types typescript` to catch schema mismatches at compile time

---

## 11. Files Changed (Summary)

| Action | File | Description |
|---|---|---|
| NEW | `src/lib/supabase/storage.ts` | All Supabase CRUD functions |
| NEW | `src/lib/supabase/database.types.ts` | Generated Supabase TypeScript types |
| NEW | `src/lib/supabase/migration.ts` | One-time localStorage → Supabase migration logic |
| NEW | `src/lib/storage-local.ts` | Extracted pure localStorage functions (cache layer) |
| MODIFY | `src/lib/storage.ts` | Orchestrator: Supabase primary + localStorage cache |
| MODIFY | `src/hooks/useTransactions.ts` | Async loading, remove recategorizeAll from load path |
| MODIFY | `src/context/transactions.tsx` | Expose loading state |
| MODIFY | `src/app/page.tsx` | Handle async storage calls, loading state |
| MODIFY | `src/app/accounts/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/categories/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/knowledge/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/insights/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/transactions/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/ask/page.tsx` | Handle async storage calls (read-only) |
| MODIFY | `src/components/dashboard/recommendations-panel.tsx` | Handle async storage calls |
| MODIFY | `src/components/dashboard/ai-analysis.tsx` | Handle async storage calls |
| MODIFY | `src/components/CategoryEditor.tsx` | Handle async storage calls |
| MODIFY | `scripts/supabase-migration.sql` | Add columns, update RLS, add trigger |

---

## 12. What This Does NOT Change

- CSV parsing logic (stays in `/api/parse-csv` and client-side)
- AI/OpenAI integration (stays in `/api/analyse`, `/api/categorize`, `/api/chat`)
- Categorization pipeline (custom rules → keywords → Amex → GPT)
- Intelligence layer (health scorecard, creep, recommendations)
- All computed values in `useTransactions` (still derived from transaction array)
- Page layouts and components (only loading states added)
- Auth flow (already on Supabase)

---

## 13. Success Criteria

1. Larissa can upload a CSV on her phone and see it on the laptop
2. Gus can upload his bank statements and both see the combined household view
3. Existing data (months of Larissa's transactions) migrates automatically on first login
4. App loads instantly from cache, then syncs in background
5. If Supabase is down, the app still works with cached read-only data
6. Manual category corrections are never overwritten by another user's recategorization
7. Re-uploading the same CSV is a safe no-op (dedup by transaction ID)

---

## 14. Known Limitations / Future Work

- **No cross-tab sync:** If two tabs are open, uploading in one won't auto-refresh the other. Acceptable for now; Supabase Realtime subscriptions could add this later.
- **No offline writes:** Writes require Supabase connectivity. Acceptable for a weekly-upload household tool.
- **Hardcoded household emails in RLS:** Works for 3 users. Upgrade to `household_members` table if the household changes.
