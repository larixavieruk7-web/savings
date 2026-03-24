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

### Write pattern (write-through)
1. On save: write to Supabase first (source of truth)
2. If Supabase succeeds: update localStorage cache + update React state
3. If Supabase fails: show error toast, do NOT write to localStorage (prevents drift)

---

## 4. Module Design

### 4.1 `src/lib/supabase/storage.ts` (NEW — core Supabase storage layer)

A new module that mirrors every function in the existing `storage.ts` but talks to Supabase. Each function:
- Takes an implicit `user_id` from the Supabase session (RLS handles filtering)
- Returns typed data matching the existing interfaces
- Handles errors gracefully (returns null/empty on failure)

Functions to implement:

| Existing function | Supabase equivalent | Table |
|---|---|---|
| `getTransactions()` | `fetchTransactions()` | `transactions` |
| `saveTransactions(txns)` | `upsertTransactions(txns)` | `transactions` |
| `mergeTransactions(existing, incoming)` | `upsertTransactions(incoming)` | `transactions` (ON CONFLICT) |
| `updateTransactions(updates)` | `updateTransactions(updates)` | `transactions` |
| `getCustomRules()` | `fetchCategoryRules()` | `category_rules` |
| `saveCustomRules(rules)` | `upsertCategoryRules(rules)` | `category_rules` |
| `getSavingsTargets()` | `fetchSavingsTargets()` | `savings_targets` |
| `saveSavingsTargets(targets)` | `upsertSavingsTargets(targets)` | `savings_targets` |
| `getKnowledgeEntries()` | `fetchKnowledgeEntries()` | `knowledge_entries` |
| `addKnowledgeEntry(entry)` | `insertKnowledgeEntry(entry)` | `knowledge_entries` |
| `deleteKnowledgeEntry(id)` | `deleteKnowledgeEntry(id)` | `knowledge_entries` |
| `getMonthlyAnalyses()` | `fetchMonthlyAnalyses()` | `monthly_analyses` |
| `saveMonthlyAnalysis(analysis)` | `upsertMonthlyAnalysis(analysis)` | `monthly_analyses` |
| `getAccountNicknames()` | `fetchUserSettings().account_nicknames` | `user_settings` |
| `saveAccountNickname(name, nick)` | `updateUserSettings({account_nicknames})` | `user_settings` |
| `getAccountTypes()` | `fetchUserSettings().account_types` | `user_settings` |
| `saveAccountTypes(types)` | `updateUserSettings({account_types})` | `user_settings` |
| `getCustomColors()` | `fetchUserSettings().custom_colors` | `user_settings` |
| `saveCustomColors(colors)` | `updateUserSettings({custom_colors})` | `user_settings` |
| `getDismissedRecommendations()` | `fetchUserSettings().dismissed_recommendations` | `user_settings` |
| `dismissRecommendation(id)` | `updateUserSettings({dismissed_recommendations})` | `user_settings` |
| `getCachedInsights()` | `fetchUserSettings().insights_cache` | `user_settings` |
| `cacheInsights(insights)` | `updateUserSettings({insights_cache})` | `user_settings` |

### 4.2 `src/lib/storage.ts` (MODIFIED — becomes orchestrator)

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
  // 1. Return cached immediately (caller can use for optimistic display)
  const cached = getLocalTransactions()

  // 2. Try Supabase
  const remote = await fetchTransactions()
  if (remote !== null) {
    setLocalTransactions(remote) // update cache
    return remote
  }

  // 3. Fallback to cache
  return cached
}
```

### 4.3 `src/lib/storage-local.ts` (EXTRACTED — pure localStorage functions)

Extract the current localStorage read/write logic into a dedicated module. These become the "cache layer" — only called by `storage.ts`, never directly by hooks or pages.

### 4.4 `src/hooks/useTransactions.ts` (MODIFIED — async-aware)

Key changes:
- Add `loading` state (true until first Supabase fetch completes)
- Add `syncing` state (true during background refresh)
- Initial load: show cached data → fetch from Supabase → merge
- All mutation methods become async
- Expose `loading` and `syncing` to consumers for UI feedback

```typescript
// Simplified new shape
function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Show cached data instantly
    const cached = getLocalTransactions()
    if (cached.length) setTransactions(cached)

    // Then sync from Supabase
    fetchTransactions().then(remote => {
      if (remote) {
        setTransactions(remote)
        setLocalTransactions(remote)
      }
      setLoading(false)
    })
  }, [])

  // ... mutations, computed values unchanged
}
```

### 4.5 `src/context/transactions.tsx` (MODIFIED — expose loading state)

Add `loading` to the context value so pages can show loading indicators.

### 4.6 Other pages/components that call storage directly

These pages bypass the hook and call `storage.ts` functions directly — they need async updates:

| File | Functions called | Change needed |
|---|---|---|
| `src/app/accounts/page.tsx` | `getAccountNicknames`, `saveAccountNickname`, `getAccountTypes`, `saveAccountTypes` | Await async calls |
| `src/app/categories/page.tsx` | `getCustomRules`, `saveCustomRules`, `recategorizeAll` | Await async calls |
| `src/app/knowledge/page.tsx` | `getKnowledgeEntries`, `addKnowledgeEntry`, `deleteKnowledgeEntry` | Await async calls |
| `src/app/insights/page.tsx` | `getCachedInsights`, `cacheInsights` | Await async calls |
| `src/app/page.tsx` (dashboard) | `getDismissedRecommendations`, `dismissRecommendation`, `getMonthlyAnalyses`, `saveMonthlyAnalysis` | Await async calls |

---

## 5. One-Time Data Migration (localStorage → Supabase)

When a user first loads the app after this update:
1. App checks: does Supabase have transactions for this user? (`SELECT count(*) FROM transactions WHERE user_id = ...`)
2. If Supabase is empty AND localStorage has data → trigger migration
3. Migration reads all localStorage keys and uploads to Supabase tables
4. Show a brief "Syncing your data..." indicator during upload
5. After upload: verify counts match, then proceed normally

This handles the transition gracefully — existing users (Larissa with months of data in her browser) get their data migrated automatically on first login.

### Migration order (respects foreign key dependencies):
1. `user_settings` (no dependencies)
2. `category_rules` (no dependencies)
3. `savings_targets` (no dependencies)
4. `knowledge_entries` (no dependencies)
5. `transactions` (no dependencies, but largest dataset — batch in chunks of 500)
6. `monthly_analyses` (no dependencies)

---

## 6. User ID Injection

Supabase RLS requires `user_id` on every row. The current localStorage data has no `user_id`.

**Solution:** On migration, the app reads the current Supabase session (`supabase.auth.getUser()`) and injects the `user_id` into every row before upload.

For ongoing writes, every insert/upsert function in `supabase/storage.ts` will inject `user_id` from the session automatically.

---

## 7. Multi-User Household Consideration

Both Gus and Larissa will upload their own bank statements. Key design decision:

**Shared household view (recommended):** Both users see ALL household transactions. This is achieved by:
- Each user uploads with their own `user_id`
- A `household_id` concept could be added later, but for now: update RLS policies to allow both users to see each other's data

**Simpler approach for now:** Since there are only 2-3 users and this is a household tool:
- Add a `household_members` table or just update RLS policies to use a shared list
- Both users can read/write all transactions
- The `account_name` field already identifies whose bank account a transaction belongs to

**Implementation:** Update RLS policies from:
```sql
USING (auth.uid() = user_id)
```
to:
```sql
USING (user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
))
```

This is simple and correct for a 3-person household. No need for a household abstraction.

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| Supabase unreachable on read | Show cached localStorage data, no error shown |
| Supabase unreachable on write | Show toast: "Saved locally, will sync when online" + write to localStorage only |
| Supabase returns error on write | Show toast with error details, do NOT cache the failed write |
| Migration fails mid-way | Track progress, allow retry, don't duplicate data (upserts are idempotent) |
| User not authenticated | Fall back to localStorage-only mode (preserves current behavior for the login page) |

---

## 9. Testing Strategy

1. **Unit tests for `supabase/storage.ts`** — mock Supabase client, verify correct queries
2. **Integration test for migration** — seed localStorage, run migration, verify Supabase data
3. **Manual smoke test** — upload CSV on laptop, verify it appears on phone
4. **Edge cases:** empty localStorage, partial migration, concurrent uploads from two devices

---

## 10. Files Changed (Summary)

| Action | File | Description |
|---|---|---|
| NEW | `src/lib/supabase/storage.ts` | All Supabase CRUD functions |
| NEW | `src/lib/storage-local.ts` | Extracted pure localStorage functions |
| NEW | `src/lib/supabase/migration.ts` | One-time localStorage → Supabase migration logic |
| MODIFY | `src/lib/storage.ts` | Orchestrator: Supabase primary + localStorage cache |
| MODIFY | `src/hooks/useTransactions.ts` | Async loading, syncing states |
| MODIFY | `src/context/transactions.tsx` | Expose loading state |
| MODIFY | `src/app/page.tsx` | Handle async storage calls, loading state |
| MODIFY | `src/app/accounts/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/categories/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/knowledge/page.tsx` | Handle async storage calls |
| MODIFY | `src/app/insights/page.tsx` | Handle async storage calls |
| MODIFY | `scripts/supabase-migration.sql` | Update RLS for household sharing |

---

## 11. What This Does NOT Change

- CSV parsing logic (stays in `/api/parse-csv` and client-side)
- AI/OpenAI integration (stays in `/api/analyse`, `/api/categorize`, `/api/chat`)
- Categorization pipeline (custom rules → keywords → Amex → GPT)
- Intelligence layer (health scorecard, creep, recommendations)
- All computed values in `useTransactions` (still derived from transaction array)
- Page layouts and components (only loading states added)
- Auth flow (already on Supabase)

---

## 12. Success Criteria

1. Larissa can upload a CSV on her phone and see it on the laptop
2. Gus can upload his bank statements and both see the combined household view
3. Existing data (months of Larissa's transactions) migrates automatically on first login
4. App loads instantly from cache, then syncs in background
5. If Supabase is down, the app still works with cached data
