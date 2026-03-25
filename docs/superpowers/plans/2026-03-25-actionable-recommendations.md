# Actionable Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform recommendations from static text cards into clickable, expandable, action-driven advisor items with smart categorization, subscription intelligence, and GPT-powered savings research.

**Architecture:** Extend the existing `Recommendation` type with evidence data (transactions, accounts). Add category-aware contract intelligence so mortgages/loans/utilities get appropriate messaging. Add a `/api/advisor/research` endpoint for GPT-powered savings research per merchant. Build expandable recommendation cards with inline transaction evidence and action buttons.

**Tech Stack:** Next.js App Router, React, TypeScript, OpenAI GPT-4o, Supabase (essential merchants registry), localStorage (research cache)

---

### Task 1: Extend Recommendation type with evidence data

**Files:**
- Modify: `src/types/index.ts:119-128`

- [ ] **Step 1: Add evidence fields to Recommendation interface**

Add optional evidence fields so each recommendation can carry the underlying transaction data, account info, and source metadata that generated it:

```typescript
export interface RecommendationEvidence {
  transactions?: {
    date: string;
    description: string;
    amount: number; // pence
    account: string;
  }[];
  accounts?: string[];
  monthlyBreakdown?: { month: string; amount: number }[];
  relatedMerchants?: string[];
  serviceType?: string; // for overlapping services
}

export interface Recommendation {
  id: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  category?: string;
  merchant?: string;
  potentialSaving: number;
  actionType: 'reduce' | 'switch' | 'cancel' | 'review' | 'celebrate';
  evidence?: RecommendationEvidence;
  isEssential?: boolean; // true for mortgage, loan, utilities — changes messaging
  essentialAdvice?: string; // alternative advice for essential items (e.g. "check remortgage rates")
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend Recommendation type with evidence and essential fields"
```

---

### Task 2: Add essential merchant registry (storage)

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/lib/storage-local.ts`

- [ ] **Step 1: Add essential merchant storage functions**

Add functions to store/retrieve essential merchants. These are merchants the user has marked as "known essential" (mortgage, loans, etc.) so they don't get flagged as "still needed?":

In `storage-local.ts`:
```typescript
const ESSENTIAL_MERCHANTS_KEY = 'essential_merchants';

export function getLocalEssentialMerchants(): string[] {
  const raw = localStorage.getItem(ESSENTIAL_MERCHANTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function setLocalEssentialMerchants(merchants: string[]): void {
  localStorage.setItem(ESSENTIAL_MERCHANTS_KEY, JSON.stringify(merchants));
}
```

In `storage.ts`:
```typescript
export async function getEssentialMerchants(): Promise<string[]> {
  const settings = await fetchUserSettings();
  if (settings?.essentialMerchants) {
    setLocalEssentialMerchants(settings.essentialMerchants);
    return settings.essentialMerchants;
  }
  return getLocalEssentialMerchants();
}

export async function addEssentialMerchant(merchant: string): Promise<void> {
  const existing = await getEssentialMerchants();
  if (!existing.includes(merchant)) {
    const updated = [...existing, merchant];
    const ok = await updateUserSettings({ essential_merchants: updated });
    if (ok) setLocalEssentialMerchants(updated);
  }
}

export async function removeEssentialMerchant(merchant: string): Promise<void> {
  const existing = await getEssentialMerchants();
  const updated = existing.filter((m) => m !== merchant);
  const ok = await updateUserSettings({ essential_merchants: updated });
  if (ok) setLocalEssentialMerchants(updated);
}
```

- [ ] **Step 2: Add essential_merchants column to user_settings if needed**

Check if user_settings table needs the column added. If using JSONB settings, it may already support arbitrary keys.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts src/lib/storage-local.ts
git commit -m "feat: add essential merchant registry storage"
```

---

### Task 3: Smart contract intelligence — category-aware recommendations

**Files:**
- Modify: `src/lib/intelligence/contract-alerts.ts`
- Modify: `src/lib/intelligence/recommendations.ts`

- [ ] **Step 1: Add category awareness to contract alerts**

Add a `category` field to `ContractAlert` and detect essential categories. Essential categories: `Housing`, `Rent / Mortgage`, `Debt Repayments`, `Utilities`, `Insurance`.

For essential merchants, change the suggestion from "Still needed?" to contextual advice:
- Housing/Mortgage → "Could you remortgage for a better rate? Rates may have changed since you fixed."
- Loan/Debt → "What's the remaining term? Check if overpaying or switching lender could save interest."
- Utilities → "Are you on the best tariff? Compare on Ofgem-accredited sites."
- Insurance → "When does this renew? Get comparison quotes 3 weeks before."

- [ ] **Step 2: Update recommendations to include evidence and handle essentials**

In `generateRecommendations`, attach evidence (transactions, monthly breakdown) to each recommendation. For contract alerts on essential categories, set `isEssential: true` and provide `essentialAdvice` instead of "still needed?".

Accept `essentialMerchants: string[]` parameter and also auto-detect essentials by category.

- [ ] **Step 3: Attach transaction evidence to all recommendation types**

For each recommendation type, include the relevant transactions in `evidence.transactions`:
- Contract alerts: last 3 months of transactions for that merchant
- Duplicates: matching transactions from each account
- Overlapping services: transactions for each service in the group
- Category creep: top 5 merchants driving the increase
- Convenience premium: the actual convenience transactions

- [ ] **Step 4: Commit**

```bash
git add src/lib/intelligence/contract-alerts.ts src/lib/intelligence/recommendations.ts
git commit -m "feat: category-aware contract intelligence with transaction evidence"
```

---

### Task 4: Enhance subscription intelligence

**Files:**
- Modify: `src/lib/subscriptions.ts`
- Modify: `src/lib/intelligence/overlapping-services.ts`

- [ ] **Step 1: Detect same-account duplicate subscriptions**

In `computeSubscriptionData`, add detection for the same merchant being charged multiple times per month on the same account (e.g., 2x Netflix). Flag these as `sameAccountDuplicates`.

- [ ] **Step 2: Add consolidation math to overlapping services**

Enhance `OverlappingService` to include a `consolidationSuggestion` with specific math: "Keep [cheapest N], drop [rest], save £X/month". Include the service names and amounts.

- [ ] **Step 3: Commit**

```bash
git add src/lib/subscriptions.ts src/lib/intelligence/overlapping-services.ts
git commit -m "feat: same-account duplicate detection + consolidation suggestions"
```

---

### Task 5: GPT-powered savings research API

**Files:**
- Create: `src/app/api/advisor/research/route.ts`

- [ ] **Step 1: Create research API endpoint**

New POST endpoint that takes merchant name, category, monthly amount, and duration. Calls GPT-4o to research:
- Alternative providers/services
- Current market rates or deals
- Negotiation tactics
- Specific action steps

System prompt: "You are a UK financial advisor researching savings opportunities for a specific household expense. Be specific with UK providers, current typical rates, and actionable steps. Keep it concise — max 200 words."

Request body:
```typescript
{
  merchant: string;
  category: string;
  monthlyAmount: number; // pence
  months: number;
  context?: string; // e.g. "mortgage", "energy", "streaming"
}
```

Response:
```typescript
{
  alternatives: { provider: string; estimatedCost: string; saving: string }[];
  negotiationTips: string[];
  actionSteps: string[];
  summary: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/advisor/research/route.ts
git commit -m "feat: add GPT-powered savings research API endpoint"
```

---

### Task 6: Build expandable recommendation cards UI

**Files:**
- Modify: `src/components/dashboard/recommendations-panel.tsx`

- [ ] **Step 1: Add expandable card state and click handling**

Each recommendation card becomes clickable. Clicking toggles an expanded detail view showing:
- Transaction evidence (date, description, amount, account) in a compact table
- Monthly breakdown if available
- Related merchants/services if applicable

- [ ] **Step 2: Add action buttons in expanded view**

Different actions per recommendation type:
- **All**: "Dismiss" (existing), "Ask Advisor" (opens chat with context)
- **Contract (essential)**: "Research Better Rate" button
- **Contract (non-essential)**: "Mark as Essential", "Research Savings"
- **Duplicate**: shows which accounts, "View Transactions"
- **Overlap**: "Research Consolidation"
- **Category Creep**: "Set Target" link
- **Convenience**: "View Breakdown"

- [ ] **Step 3: Add research results display**

When "Research Savings" is clicked, call `/api/advisor/research` and display results inline:
- Alternative providers with estimated costs
- Negotiation tips
- Action steps
- Cache results in component state (don't re-research same merchant)

- [ ] **Step 4: Wire up "Mark as Essential" action**

Clicking "Mark as Essential" calls `addEssentialMerchant()`, updates the recommendation in-place to show essential messaging, and persists the choice.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/recommendations-panel.tsx
git commit -m "feat: expandable recommendation cards with actions and research"
```

---

### Task 7: Wire everything together — pass evidence data through the pipeline

**Files:**
- Modify: `src/hooks/useTransactions.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Pass allTransactions and essentialMerchants to generateRecommendations**

Update the `recommendations` useMemo in `useTransactions.ts` to pass the full transaction list so evidence can be extracted, plus load essential merchants.

- [ ] **Step 2: Pass contractAlerts and overlappingServices to RecommendationsPanel**

Update `page.tsx` to pass these as props so the panel can display richer evidence.

- [ ] **Step 3: Add essential merchant callback to RecommendationsPanel**

Pass an `onMarkEssential` callback from the page that calls `addEssentialMerchant` and triggers a re-compute of recommendations.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTransactions.ts src/app/page.tsx
git commit -m "feat: wire evidence data and essential merchants through pipeline"
```

---

### Task 8: Polish and test

- [ ] **Step 1: Run build to check for type errors**

```bash
npm run build
```

- [ ] **Step 2: Test locally — verify expandable cards work**

```bash
npm run dev
```

Check:
- Recommendations expand on click showing transaction evidence
- Contract alerts for mortgage/loan show appropriate messaging
- "Mark as Essential" persists and changes recommendation tone
- "Research Savings" calls API and shows results
- Overlapping services show consolidation math
- Mobile responsive

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish actionable recommendations"
```
