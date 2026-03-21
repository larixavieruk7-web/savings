# Money Leaks Features — Implementation Plan

**Origin:** NotebookLM research analysis of 8 YouTube videos on household money leaks (see `research-money-leaks-2026-03-21.md`)

**5 features, 3 workstreams.** Features 1+4 share logic (category-level trend analysis). Feature 3 extends existing subscriptions code. Feature 2 is independent. Feature 5 synthesises outputs from 1–4.

---

## Workstream Architecture

```
Workstream A (agent 1):  Feature 1 (Category Creep Alerts) + Feature 4 (Lifestyle Creep Index)
Workstream B (agent 2):  Feature 2 (Convenience Spending Widget) + Feature 3 (Subscription Aging)
Workstream C (agent 3):  Feature 5 (Monthly Report Card) — depends on A + B outputs
```

**Workstream C must run AFTER A and B complete** — it reads the data structures they produce.

---

## Feature 1: 90-Day Category Rolling Average Alerts

### What it does
Flags categories where this month's spending is significantly above the 90-day rolling average, indicating lifestyle creep rather than a one-off spike.

### Why the existing anomaly detection doesn't cover this
The current `detectAnomalies()` in `src/lib/ai/insights-engine.ts:141` works per-merchant (>2.5x merchant avg for individual transactions). It catches "you spent £200 at Tesco when you usually spend £60." It does NOT catch "your total Dining Out spend has crept from £300 to £420 over 3 months" — because no single transaction is anomalous.

### Files to create/modify

**New file: `src/lib/category-trends.ts`**
```typescript
export interface CategoryCreepAlert {
  category: string
  currentMonthPence: number
  rollingAvgPence: number       // 90-day avg (or 3-month avg)
  percentAboveAvg: number       // e.g. 34 means 34% above
  consecutiveMonthsUp: number   // how many months it's been rising
  severity: 'info' | 'warning' | 'alert'
}

export interface CategoryTrendData {
  category: string
  monthlySpend: { month: string; amountPence: number }[]
  rollingAvg90d: number
  currentMonth: number
  trend: 'rising' | 'falling' | 'stable'
  consecutiveUp: number
  consecutiveDown: number
}
```

**Pure computation function** (no AI, no API calls):
```typescript
export function detectCategoryCreep(
  transactions: Transaction[],
  options?: { thresholdPercent?: number; minMonths?: number }
): CategoryCreepAlert[]
```

**Algorithm:**
1. Group all spending transactions (amount < 0) by category, then by month (YYYY-MM)
2. For each category with ≥3 months of data:
   - Compute the 3-month rolling average (excluding the current month)
   - Compare current month's total to that rolling average
   - Count consecutive months where spending > previous month (for `consecutiveMonthsUp`)
3. Flag as:
   - `'warning'` if current month > 20% above rolling avg AND consecutiveUp ≥ 2
   - `'alert'` if current month > 35% above rolling avg AND consecutiveUp ≥ 2
   - `'info'` if > 15% above avg (no consecutive requirement)
4. Filter out categories with monthly spend < £20 (2000 pence) — too noisy
5. Filter out: Transfers, Salary, Income, Other Income, Savings & Investments, Refunds (non-spending categories)
6. Sort by percentAboveAvg descending

**Modify: `src/app/insights/page.tsx`**
- Import `detectCategoryCreep` from the new module
- Call it with the transactions from context (no API call needed)
- Add a new section "Category Creep Alerts" between the Subscriptions panel and the Savings Target
- Render as a list of alert cards, similar style to anomalies but with amber/orange theme:
  ```
  Dining Out ↑ +28% above 90-day average
  £420 this month vs £328 avg — rising for 3 consecutive months
  ```
- Each card shows: category name, current month amount, rolling avg, % above, and consecutive months rising
- Use arrow icons (TrendingUp from lucide-react) instead of AlertTriangle
- Only show this section if there are creep alerts (don't show empty state)

### Invariants
- Amounts in pence (integers), never floats — the function receives Transaction[] from localStorage which is already in pence
- No localStorage writes — this is a read-only computation on existing transaction data
- Excluded categories list should be a const array at the top of the file for easy maintenance

### Test cases to verify
- Category with < 3 months data → not flagged (insufficient history)
- Category with stable spend (±5%) → not flagged
- Category rising 8%/month for 3 months → flagged as warning (compound = ~26% above 3-month-ago level)
- Category that spiked one month but dropped back → flagged as info but NOT warning (consecutiveUp < 2)
- Transfer/Income categories → never flagged

---

## Feature 2: Convenience Spending Aggregation Widget

### What it does
Groups "convenience premium" merchants together (coffee shops, food delivery, taxis) and shows the combined monthly cost + annual projection. These are the transactions where you're paying extra for speed/ease.

### Why existing category breakdown doesn't cover this
These transactions are scattered across Dining Out (Deliveroo, Starbucks), Transport (Uber, Bolt), and sometimes Shopping (Amazon Fresh). The category view never shows them together as "convenience spending."

### Files to create/modify

**Modify: `src/lib/categories.ts`** — Add a convenience merchant pattern list:
```typescript
/** Merchants that represent "convenience premium" spending — paying extra for speed/ease */
export const CONVENIENCE_PATTERNS: string[] = [
  // Food delivery
  'DELIVEROO', 'JUST EAT', 'UBER EATS',
  // Coffee & snacks
  'COSTA', 'STARBUCKS', 'PRET A MANGER', 'CAFFE NERO', 'GREGGS',
  // Ride-hailing
  'UBER ', 'BOLT',
  // Grocery delivery (not the groceries themselves, but the delivery service premium)
  'OCADO',
]
```

**New file: `src/lib/convenience.ts`**
```typescript
import { CONVENIENCE_PATTERNS } from './categories'
import type { Transaction } from '@/types'

export interface ConvenienceData {
  totalPence: number
  monthlyAvgPence: number
  annualProjectionPence: number
  monthlyTrend: { month: string; totalPence: number }[]
  topMerchants: { merchant: string; totalPence: number; count: number }[]
  transactionCount: number
}

export function computeConvenienceSpending(transactions: Transaction[]): ConvenienceData
```

**Algorithm:**
1. Filter transactions where amount < 0 AND (description OR merchantName) matches any CONVENIENCE_PATTERNS
2. Group by month, compute monthly totals
3. Compute monthly average across all months present
4. Annual projection = monthly avg × 12
5. Group by merchant, sum totals, sort by total descending
6. Return the data structure

**New file: `src/components/insights/ConvenienceWidget.tsx`**
- Card component similar to existing SubscriptionsPanel style
- Header: "Convenience Spending" with a Coffee icon (or Zap from lucide-react)
- KPI row: Monthly average | Annual projection | Transaction count
- Mini bar chart (last 6 months) using existing Recharts
- Top 5 merchants ranked by spend
- Style: use the dashboard's dark card theme (`bg-card border border-card-border rounded-xl p-5`)

**Modify: `src/app/insights/page.tsx`**
- Import and render ConvenienceWidget after the Category Creep Alerts section
- Pass transactions from context

### Invariants
- Amounts in pence (integers), matching on upper-cased description
- CONVENIENCE_PATTERNS must use the same casing approach as DEFAULT_RULES (uppercase comparison)
- The pattern `'UBER '` (with trailing space) already exists in DEFAULT_RULES to avoid matching "UBER EATS" — reuse the same pattern

### Design notes
- The widget should show the "shock number" prominently — the annual projection. This is the "oh wow" moment that research says has the biggest psychological impact.
- Keep it computation-only, no AI

---

## Feature 3: Subscription Utilisation Aging

### What it does
Extends the existing subscription detection to flag "ghost subscriptions" — merchants that were recurring but haven't appeared recently.

### Why existing subscription detection doesn't cover this
`computeSubscriptionData()` in `src/lib/subscriptions.ts:57` identifies recurring merchants (≥2 months of payments) and cross-account duplicates. But it has no concept of "last seen date" — it can't tell you "you used to pay Spotify monthly but haven't for 3 months" (which could mean either you cancelled successfully, or there's a ghost DD somewhere).

### Files to modify

**Modify: `src/lib/subscriptions.ts`**

1. Extend `RecurringMerchant` interface:
```typescript
export interface RecurringMerchant {
  merchant: string
  account: string
  monthCount: number
  avgAmountPence: number
  lastSeenMonth: string        // NEW — "2026-01" format
  monthsSinceLastSeen: number  // NEW — 0 = seen this month
}
```

2. Extend `SubscriptionData`:
```typescript
export interface SubscriptionData {
  potentialDuplicates: PotentialDuplicate[]
  recurringMerchants: RecurringMerchant[]
  possiblyGhost: RecurringMerchant[]  // NEW — recurring merchants not seen in 2+ months
}
```

3. In `computeSubscriptionData()`:
   - When building `recurringMerchants`, compute `lastSeenMonth` = max month in the merchant's month set
   - Compute `monthsSinceLastSeen` = number of months between lastSeenMonth and current month
   - After building recurringMerchants, filter those with `monthsSinceLastSeen >= 2` into `possiblyGhost`
   - Return possiblyGhost in the result

**Modify: `src/components/subscriptions/SubscriptionsPanel.tsx`**

Add a new section between "Potential Duplicates" and "All Recurring Payments":
```
Ghost Subscriptions?
These merchants had recurring charges but haven't appeared in 2+ months.
They may be cancelled — or still active somewhere.

PURE GYM
  Last seen: Nov 2025 (4 months ago) · Was: £29.99/mo
  Estimated wasted if still active: £119.96
```

- Use a ghost/phantom icon (maybe `EyeOff` from lucide-react)
- Amber-ish styling, similar to duplicate alerts but slightly different shade
- Show: merchant name, last seen month, months since last seen, avg monthly amount, estimated waste (avg × months since last seen)

**Callers to update:**
- `src/app/insights/page.tsx:155` — destructure `possiblyGhost` from computeSubscriptionData and pass to SubscriptionsPanel
- `src/app/page.tsx:55` — no change needed (DuplicateSubscriptionAlert only uses potentialDuplicates)

### Invariants
- Months comparison: use ISO month strings (YYYY-MM). Current month = `new Date().toISOString().slice(0, 7)` or equivalent with date-fns
- The `monthsSinceLastSeen` calculation: count the number of months between lastSeenMonth and current month. If lastSeenMonth is "2026-01" and current is "2026-03", that's 2 months.
- Don't flag merchants last seen in the current month or previous month — they're probably still active
- Existing callers that destructure `{ potentialDuplicates, recurringMerchants }` will continue to work because the new field is additive

### Edge cases
- Merchant that's recurring but only has 2 months of history 6 months ago → should appear in ghost list
- Merchant with transactions in current month → monthsSinceLastSeen = 0, should NOT be in ghost list

---

## Feature 4: Lifestyle Creep Index (Dashboard Homepage Widget)

### What it does
Compact widget on the main dashboard showing whether key discretionary categories are trending up or down vs 3 months ago.

### Why the Trends page doesn't cover this
The Trends page (`src/app/trends/page.tsx`) shows MoM changes and category line charts, but:
- It only compares the last 2 months (line 78-80), not a 3-month window
- It doesn't name the pattern — it just shows "+ 15%" without calling it "lifestyle creep"
- It's on a separate page that most users won't visit regularly

The dashboard homepage should surface this as a named, at-a-glance widget.

### Files to create/modify

**Reuse: `src/lib/category-trends.ts`** (created in Feature 1)

Add an additional export:
```typescript
export interface LifestyleCreepItem {
  category: string
  recentAvgPence: number    // avg of last 3 months
  priorAvgPence: number     // avg of 3 months before that
  changePercent: number     // ((recent - prior) / prior) * 100
  direction: 'up' | 'down' | 'stable'
}

export function computeLifestyleCreep(
  transactions: Transaction[],
  categories?: string[]  // default: ['Dining Out', 'Shopping', 'Entertainment', 'Personal Care', 'Subscriptions']
): LifestyleCreepItem[]
```

**Algorithm:**
1. Default target categories: `['Dining Out', 'Shopping', 'Entertainment', 'Personal Care', 'Subscriptions']`
2. Group spending by category and month
3. For each target category:
   - Recent window = last 3 completed months (NOT including current partial month)
   - Prior window = 3 months before that
   - If either window has < 2 months of data, skip this category
   - Compute average monthly spend for each window
   - changePercent = ((recentAvg - priorAvg) / priorAvg) × 100
   - direction: 'up' if changePercent > 5%, 'down' if < -5%, else 'stable'
4. Sort by absolute changePercent descending
5. Return all items (let the UI decide what to show)

**New file: `src/components/dashboard/LifestyleCreepWidget.tsx`**

Compact widget showing 3–5 rows:
```
Lifestyle Creep Index
                Last 3 months vs prior 3 months

Dining Out        £420/mo avg    ↑ +28%
Shopping          £310/mo avg    ↑ +15%
Entertainment     £85/mo avg     → stable
Personal Care     £45/mo avg     ↓ -12%
```

- Each row: category dot (using CATEGORY_COLORS), category name, recent avg in GBP, direction arrow + percentage
- Up arrows in red/danger, down arrows in green/success, stable in muted
- If ALL categories are stable or down, show a subtle success state: "No lifestyle creep detected"
- Card style matches dashboard (`bg-card border border-card-border rounded-xl p-6`)
- Header icon: TrendingUp from lucide-react

**Modify: `src/app/page.tsx`**

Insert the LifestyleCreepWidget between the "Essential vs Discretionary" section (line 253) and the "Savings Target Progress" section (line 260):
```tsx
{/* Lifestyle Creep Index */}
<LifestyleCreepWidget transactions={transactions} />
```

### Invariants
- Amounts in pence throughout the computation
- Use `formatGBP()` from `src/lib/utils.ts` for display (it handles the pence → pounds conversion)
- "Completed months" means exclude the current calendar month — it's partial and would skew the comparison
- The widget receives `transactions` from `useTransactionContext()` which is already filtered by the PeriodSelector. However, the creep index should probably use ALL transactions (not period-filtered) to get a meaningful 6-month comparison. **Important decision:** pass `allTransactions` or the period-filtered ones?
  - **Recommendation:** use `allTransactions` (from the hook, before period filter) because the user might have "last 30 days" selected on the dashboard, which would make a 6-month comparison impossible. The `useTransactions` hook exposes `allTransactions` — check the hook for the exact property name.

### How to access allTransactions
Looking at `src/hooks/useTransactions.ts`, the hook stores `allTransactions` as state and derives `transactions` from it via period filtering. The context (`src/context/transactions.tsx`) returns `ReturnType<typeof useTransactions>`. Check what properties the hook returns — if it doesn't expose `allTransactions`, you'll need to add it to the return value.

From the hook (line 31): `const [allTransactions, setAllTransactions] = useState<Transaction[]>([])` — this is internal state. You need to check what the hook returns at the bottom of the file. If `allTransactions` isn't returned, add it.

---

## Feature 5: Monthly Financial Report Card

### What it does
A collapsible "How did we do this month?" section at the top of the dashboard homepage that synthesises existing data into 5 pass/fail items.

### Why it's the last workstream
It reads outputs from Features 1–4:
- Category creep alerts (Feature 1) → "biggest unexpected category"
- Convenience spending total (Feature 2) → "convenience spending this month"
- Ghost subscriptions (Feature 3) → "subscription waste"
- Lifestyle creep data (Feature 4) → "creep direction"

Plus existing data:
- Savings rate from `useTransactionContext()`
- Essential spending % from context
- AI insights cache for "recommended action"

### Files to create/modify

**New file: `src/lib/report-card.ts`**
```typescript
export interface ReportCardItem {
  label: string
  value: string            // e.g. "18%" or "£340"
  target: string           // e.g. "≥ 15%" or "≤ 65%"
  pass: boolean
  detail?: string          // e.g. "3% above target"
}

export interface MonthlyReportCard {
  month: string            // "March 2026"
  items: ReportCardItem[]
  biggestMover: {          // from category creep data
    category: string
    changePercent: number
    amountAboveAvg: number
  } | null
  convenienceTotal: number // pence, from convenience computation
  subscriptionWaste: number // pence, from ghost + duplicate subscriptions
  recommendedAction: string | null // from AI insights cache if available
}

export function computeReportCard(
  transactions: Transaction[],
  totalIncome: number,        // pence, from context
  essentialSpending: number,  // pence, from context
  totalSpending: number,      // pence, from context
  categoryCreepAlerts: CategoryCreepAlert[],
  convenienceData: ConvenienceData,
  subscriptionData: SubscriptionData,
  insightsCache: unknown,     // from getCachedInsights()
): MonthlyReportCard
```

**Items in the report card:**
1. **Savings Rate** — pass if ≥ 15% of income. Value: "X%". Target: "≥ 15%".
2. **Essential Spending** — pass if ≤ 65% of income. Value: "X%". Target: "≤ 65%".
3. **Biggest Category Mover** — informational, always shown. From category creep alerts (highest percentAboveAvg). Not pass/fail.
4. **Subscription Waste** — pass if ghost + duplicate waste < £20/mo. Value: "£X/mo". Shows combined ghost subscription waste + duplicate waste.
5. **Convenience Spending** — informational. Shows this month's total convenience spend.

**recommendedAction**: Pull the top suggestion from `getCachedInsights()` if available. If no cached insights, show null (and the UI hides that row).

**New file: `src/components/dashboard/ReportCard.tsx`**

- Collapsible card (collapsed by default? or expanded?)
  - **Recommendation:** expanded if there are any failing items, collapsed if all pass
- Header: "Monthly Report Card — March 2026" with a ClipboardCheck icon
- 5 rows, each with: label, value, pass/fail badge (green check or red X), detail text
- If recommendedAction exists, show it at the bottom as a highlighted suggestion
- "Collapse" button at the bottom

**Modify: `src/app/page.tsx`**
- Import ReportCard component
- Compute the inputs:
  - `detectCategoryCreep(transactions)` from Feature 1
  - `computeConvenienceSpending(transactions)` from Feature 2
  - `computeSubscriptionData(transactions)` already exists (line 55)
  - `getCachedInsights()` from storage
- Insert ReportCard right after the DuplicateSubscriptionAlert (line 106), before the KPI cards

### Invariants
- All monetary values in pence until display time
- The report card is pure computation — no AI calls, no fetches
- If any input data is empty/unavailable (e.g., no category creep alerts because < 3 months data), gracefully skip that row rather than showing misleading zeros

---

## Implementation Order

### Phase 1: Shared foundation (agent A starts)
1. Create `src/lib/category-trends.ts` with both `detectCategoryCreep()` and `computeLifestyleCreep()`
2. This is the shared dependency for Features 1 and 4

### Phase 2: Parallel work (agents A and B)

**Agent A:**
1. Add Category Creep Alerts section to `src/app/insights/page.tsx` (Feature 1 UI)
2. Create `src/components/dashboard/LifestyleCreepWidget.tsx` (Feature 4 UI)
3. Add LifestyleCreepWidget to `src/app/page.tsx`

**Agent B:**
1. Add `CONVENIENCE_PATTERNS` to `src/lib/categories.ts`
2. Create `src/lib/convenience.ts`
3. Create `src/components/insights/ConvenienceWidget.tsx`
4. Add ConvenienceWidget to `src/app/insights/page.tsx`
5. Extend `src/lib/subscriptions.ts` with ghost subscription detection
6. Update `src/components/subscriptions/SubscriptionsPanel.tsx` with ghost section
7. Update `src/app/insights/page.tsx` to pass possiblyGhost to panel

### Phase 3: Synthesis (agent C, after A and B merge)
1. Create `src/lib/report-card.ts`
2. Create `src/components/dashboard/ReportCard.tsx`
3. Wire up in `src/app/page.tsx`

---

## Files Modified (complete list)

| File | Features | Change type |
|------|----------|-------------|
| `src/lib/category-trends.ts` | 1, 4 | **NEW** — shared trend computation |
| `src/lib/convenience.ts` | 2 | **NEW** — convenience spending computation |
| `src/lib/report-card.ts` | 5 | **NEW** — report card computation |
| `src/lib/categories.ts` | 2 | **MODIFY** — add CONVENIENCE_PATTERNS array |
| `src/lib/subscriptions.ts` | 3 | **MODIFY** — add lastSeenMonth, monthsSinceLastSeen, possiblyGhost |
| `src/components/insights/ConvenienceWidget.tsx` | 2 | **NEW** — convenience spending card |
| `src/components/dashboard/LifestyleCreepWidget.tsx` | 4 | **NEW** — creep index card |
| `src/components/dashboard/ReportCard.tsx` | 5 | **NEW** — monthly report card |
| `src/components/subscriptions/SubscriptionsPanel.tsx` | 3 | **MODIFY** — add ghost section |
| `src/app/insights/page.tsx` | 1, 2, 3 | **MODIFY** — add creep alerts, convenience widget, ghost props |
| `src/app/page.tsx` | 4, 5 | **MODIFY** — add lifestyle creep widget, report card |
| `src/hooks/useTransactions.ts` | 4 | **POSSIBLY MODIFY** — expose allTransactions if not already returned |

---

## Shared file conflicts to avoid

- `src/app/insights/page.tsx` is touched by agents A (category creep) and B (convenience + ghost). **Resolution:** Agent A adds its section first (between SubscriptionsPanel and Savings Target). Agent B adds its sections after Agent A's section. Alternatively, each agent adds at a distinct, non-overlapping insertion point.
- `src/app/page.tsx` is touched by agents A (lifestyle creep widget) and C (report card). **Resolution:** Agent A inserts at line ~258 (between Essential vs Discretionary and Savings Target). Agent C inserts at line ~106 (after DuplicateSubscriptionAlert). Non-overlapping.

---

## UI/UX Notes

- **No new pages** — everything integrates into existing pages (dashboard homepage + insights)
- **No AI calls** — all 5 features are pure client-side computation on existing transaction data
- **No new localStorage keys** — read-only on existing `savings_transactions`
- **All new widgets use `'use client'`** — consistent with project convention
- **Invoke `frontend-design` skill before implementing any UI** (per CLAUDE.md instruction)
- **Colors:** Use existing `CATEGORY_COLORS` for category-related displays. For new semantic colours (creep alerts, ghost subscriptions), use the existing palette:
  - Warnings/alerts: amber (`text-amber-400`, `border-amber-500/30`)
  - Success: green (`text-success`, `#22c55e`)
  - Danger: red (`text-danger`, `#ef4444`)
  - Accent: purple (`text-accent`)
