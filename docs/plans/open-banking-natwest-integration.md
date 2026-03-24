# Open Banking NatWest Integration — Implementation Plan

**Origin:** Research into eliminating manual CSV downloads for NatWest. Amex is NOT available via Open Banking in the UK (not part of CMA9), so Amex stays on CSV import.

**Provider:** [Lunch Flow](https://www.lunchflow.app/) — £30/year, REST API, NatWest supported via GoCardless Open Banking. Only provider found that serves personal/individual use at reasonable cost. All other providers (Plaid, TrueLayer, Tink, Yapily) require business entity + FCA compliance or have enterprise-minimum pricing ($500+/month).

**Cost:** £2.50/month (yearly plan). 7-day free trial available.

---

## Research Summary

### Why Lunch Flow (and not the others)

| Provider | NatWest | Individual Use | Cost | Verdict |
|----------|---------|----------------|------|---------|
| **Lunch Flow** | Yes (via GoCardless) | Yes | £30/year | **Winner** — only personal-use option |
| Plaid | Yes | No — UK = Custom plan only, sales required | ~$500/month min | Too expensive |
| TrueLayer | Yes | No — requires business entity + FCA KYB | Opaque, sales-driven | Not accessible |
| Tink | Yes | No — "don't serve end-users" | €0.50/user but sales gate | Inaccessible |
| Yapily | Yes | No — B2B only | Sales-driven | Inaccessible |
| GoCardless/Nordigen | Yes | Was free | **Closed to new signups July 2025** | Dead end |
| Direct NatWest API | Yes | No — requires FCA RAISP registration (£4K+ first year) | Regulatory cost | Overkill |

### What Lunch Flow Gives Us

**API:** 3 endpoints, API key auth via `x-api-key` header

| Method | Endpoint | Returns |
|--------|----------|---------|
| `GET` | `/accounts` | List of connected bank accounts |
| `GET` | `/accounts/:id/transactions` | Transactions for an account |
| `GET` | `/accounts/:id/balance` | Balance for an account |

**Transaction schema from API:**
```typescript
{
  id: string | null,       // Can be null — we generate our own dedup IDs
  accountId: number,
  date: string,            // ISO 8601
  amount: number,          // Float (pounds) — MUST convert to pence
  currency: string,        // "GBP"
  merchant: string,
  description: string,
  isPending?: boolean
}
```

**Key differences from our CSV pipeline:**
- Amount is a **float in pounds** (not pence) — needs `Math.round(amount * 100)`
- **No categories** — our full categorization pipeline still runs
- **No transaction ID guarantee** — `id` can be null, we generate from date+amount+description+account
- Sign convention: negative = outflow, positive = inflow (matches our convention)
- Daily auto-sync by Lunch Flow; we poll on-demand

### Limitations / Gotchas

1. **90-day re-auth** — FCA requirement. Every ~90 days, user must re-authorize NatWest via Lunch Flow's dashboard. Not automatable. Lunch Flow sends reminders.
2. **No Amex** — Amex is not part of UK Open Banking. CSV import remains for Amex.
3. **No categories from API** — our categorization pipeline is still the brain.
4. **Transaction history depth** — typically 12-24 months depending on bank.
5. **Not real-time** — daily sync + on-demand polling. Pending transactions available via `?include_pending=true`.

---

## Architecture

### How It Fits Into Existing System

```
BEFORE:
  NatWest CSV file ──→ NatWest parser ──→ Transaction[] ──→ localStorage ──→ Dashboard
  Amex CSV file ─────→ Amex parser ────→ Transaction[] ──→ localStorage ──→ Dashboard

AFTER:
  Lunch Flow API ────→ LF transformer ──→ Transaction[] ──→ localStorage ──→ Dashboard  (NEW)
  Amex CSV file ─────→ Amex parser ────→ Transaction[] ──→ localStorage ──→ Dashboard  (UNCHANGED)
  NatWest CSV file ──→ NatWest parser ──→ Transaction[] ──→ localStorage ──→ Dashboard  (FALLBACK)
```

Everything downstream of `Transaction[]` is **unchanged** — categorization, insights, AI chat, storage, display.

### New Files

```
src/lib/open-banking/
  lunchflow.ts              — API client (server-side only)
  transform.ts              — LunchFlowTransaction → Transaction mapper
  CLAUDE.md                 — Context for this directory

src/app/api/bank-sync/
  route.ts                  — POST endpoint to trigger NatWest sync
  status/route.ts           — GET endpoint to check sync status + connection health

src/components/dashboard/
  bank-sync-button.tsx      — "Sync from bank" button + status indicator
  bank-connection-status.tsx — Shows connection health, last sync time, re-auth warnings
```

### Modified Files

```
src/lib/storage.ts          — Add sync metadata storage (last sync cursor, timestamp)
src/types/index.ts          — Add BankSyncMetadata type, LunchFlowTransaction type
src/app/page.tsx            — Add bank sync button to dashboard header
.env.local                  — Add LUNCHFLOW_API_KEY
```

---

## Implementation Phases

### Phase 0: Lunch Flow Account Setup (Manual, ~10 mins)
**Not code — user action required.**

1. Sign up at lunchflow.app (7-day free trial)
2. Connect NatWest account via Lunch Flow dashboard (redirects to NatWest Open Banking consent)
3. Add "API" destination in Lunch Flow dashboard → generates API key
4. Add `LUNCHFLOW_API_KEY=xxx` to `.env.local`

---

### Phase 1: API Client + Transformer (Backend Only)

**Goal:** Fetch NatWest transactions from Lunch Flow and convert to our `Transaction` format.

#### 1a. Lunch Flow API Client — `src/lib/open-banking/lunchflow.ts`

```typescript
// Server-side only — NEVER import client-side
// Calls Lunch Flow REST API with API key from env
// Returns raw LunchFlowTransaction[] and LunchFlowAccount[]
// Handles: retry with exponential backoff, error mapping
// Does NOT handle: categorization, storage (that's the caller's job)
```

Key design decisions:
- **API key from `process.env.LUNCHFLOW_API_KEY`** — never exposed to client
- **Retry logic**: 3 attempts with exponential backoff for 5xx errors
- **`include_pending=true`** by default — we want pending transactions flagged in the UI

#### 1b. Transaction Transformer — `src/lib/open-banking/transform.ts`

Maps `LunchFlowTransaction` → `Transaction` (our schema):

| Lunch Flow field | Our field | Transform |
|-----------------|-----------|-----------|
| `id` | Used in dedup ID generation | Fallback to `${date}-${amount}-${merchant}` if null |
| `date` | `date` | Ensure ISO 8601 |
| `amount` | `amount` | `Math.round(amount * 100)` — **float pounds → integer pence** |
| `merchant` | `merchantName`, `description` | Direct map |
| `description` | `rawDescription` | Direct map |
| `accountId` | `accountName` | Lookup from `/accounts` response |
| — | `source` | `'natwest'` (hardcoded for NatWest connections) |
| — | `category` | `null` — categorization pipeline handles this |
| — | `categorySource` | `null` |
| `isPending` | New field or skip | Flag but don't persist pending transactions |

**Dedup ID generation:**
```typescript
// Must be compatible with existing NatWest CSV dedup IDs where possible
// Format: `${date}-${amountPence}-${accountNumber}-${description}`
// Account number comes from the /accounts endpoint
```

**CRITICAL:** The transformer must produce IDs that don't collide with existing CSV-imported transactions but DO deduplicate if the same transaction appears in both CSV and API.

#### 1c. Types — additions to `src/types/index.ts`

```typescript
interface LunchFlowTransaction {
  id: string | null;
  accountId: number;
  date: string;
  amount: number;       // Float pounds
  currency: string;
  merchant: string;
  description: string;
  isPending?: boolean;
}

interface LunchFlowAccount {
  id: number;
  name: string;
  institution_name: string;
}

interface BankSyncMetadata {
  lastSyncAt: string;          // ISO 8601
  lastSyncTransactionCount: number;
  connectionStatus: 'active' | 'needs-reauth' | 'error';
  connectedAccounts: Array<{
    lunchflowId: number;
    name: string;
    institution: string;
  }>;
}
```

---

### Phase 2: API Route + Sync Logic

**Goal:** Server-side endpoint that fetches, transforms, deduplicates, and returns new transactions.

#### 2a. Sync Endpoint — `src/app/api/bank-sync/route.ts`

```
POST /api/bank-sync
Body: { fromDate?: string }   // defaults to last sync date or 90 days ago
Response: {
  newTransactions: Transaction[],
  duplicatesSkipped: number,
  accounts: LunchFlowAccount[],
  syncedAt: string
}
```

Flow:
1. Call Lunch Flow `/accounts` → get connected accounts
2. For each NatWest account, call `/accounts/:id/transactions?include_pending=true`
3. Transform all transactions via `transform.ts`
4. Return to client (client handles dedup against localStorage + categorization)

**Why client-side dedup?** Because localStorage is client-side. The API route fetches + transforms, but the client compares against existing transactions and stores new ones.

#### 2b. Status Endpoint — `src/app/api/bank-sync/status/route.ts`

```
GET /api/bank-sync/status
Response: {
  connected: boolean,
  accounts: LunchFlowAccount[],
  apiKeyConfigured: boolean
}
```

Simple health check — does the API key work, what accounts are connected.

---

### Phase 3: Frontend — Sync Button + Status

**Goal:** User can trigger sync from dashboard and see connection status.

#### 3a. Bank Sync Button — `src/components/dashboard/bank-sync-button.tsx`

- Shows on dashboard header next to existing controls
- States: idle → syncing (spinner) → success (count of new transactions) → error
- On success: new transactions auto-categorized via existing pipeline, auto-saved to localStorage
- Shows last sync timestamp

#### 3b. Connection Status — `src/components/dashboard/bank-connection-status.tsx`

- Small indicator showing NatWest connection health
- Warns when 90-day re-auth is approaching (based on last successful sync age)
- Links to Lunch Flow dashboard for re-auth when needed
- Shows "Not configured" state when `LUNCHFLOW_API_KEY` is not set

#### 3c. Dashboard Integration — `src/app/page.tsx`

- Add sync button to dashboard header area
- After sync, automatically run categorization on new transactions
- Toast/notification showing "X new transactions synced from NatWest"

---

### Phase 4: Auto-Sync + Polish

**Goal:** Reduce friction to near-zero.

#### 4a. Auto-Sync on Page Load

- When dashboard loads, check if last sync was >24 hours ago
- If yes, auto-trigger sync in background
- Show subtle notification of new transactions (don't block UI)

#### 4b. Sync Metadata in localStorage

- Store `BankSyncMetadata` under key `savings_bank_sync`
- Track: last sync time, connection status, account list
- Use to power auto-sync timing and status display

#### 4c. Merged Upload Experience

- Upload page shows two paths: "Sync from NatWest" (button) + "Upload Amex CSV" (drag-drop)
- Clear messaging: NatWest is automatic, Amex needs CSV
- Both feed into the same transaction pipeline

---

## Workstream Architecture

```
Phase 0:  Manual setup (user action, no code)
Phase 1:  API client + transformer (backend, no UI) — can be built independently
Phase 2:  API routes (depends on Phase 1)
Phase 3:  Frontend components (depends on Phase 2)
Phase 4:  Auto-sync polish (depends on Phase 3)
```

**All phases are sequential** — no agent team parallelism needed. Each phase is small (~1-2 files).

**Estimated scope:** ~8 new/modified files, no architectural changes to existing code.

---

## Environment Setup Checklist

```
# .env.local additions
LUNCHFLOW_API_KEY=           # From Lunch Flow dashboard → Destinations → API

# npm additions
# None — we use native fetch(), no SDK needed
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lunch Flow shuts down or changes pricing | Lose NatWest auto-sync | CSV fallback always works; transformer is thin layer, easy to swap provider |
| 90-day re-auth missed | Sync silently fails | Connection status widget warns proactively; fallback to CSV |
| Transaction ID null from API | Dedup breaks | Generate deterministic IDs from date+amount+description+account |
| Amount float precision | Rounding errors in pence | `Math.round(amount * 100)` — standard pattern, tested |
| API rate limits hit | Sync fails | Exponential backoff + max 1 sync per hour client-side |
| Lunch Flow API changes | Integration breaks | Pin to known response shape; transformer isolates changes |

---

## Success Criteria

1. User can sync NatWest transactions with one click from dashboard
2. New transactions auto-categorized via existing pipeline
3. No duplicate transactions when same data exists from CSV + API
4. Amex CSV upload continues working unchanged
5. Dashboard auto-syncs daily without user action
6. Clear status indicator for connection health + re-auth warnings
7. Total cost: £30/year
