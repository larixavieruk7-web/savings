# AI Financial Advisor — Design & Execution Plan

**Date:** 2026-03-25
**Status:** Ready for implementation
**Vision owner:** Larissa (Gus contributed technical context)

---

## 1. Vision

Transform the savings dashboard from a **passive data viewer** into an **active AI financial advisor** — the equivalent of paying someone full-time to watch every penny, challenge spending decisions, enforce targets, and celebrate wins.

### What "winning" looks like
- **Behaviour change** that leads to **measurable savings** — both, feeding each other
- Two full-time working parents (2 kids) who don't have time to review transactions daily
- The system must do what they can't: pay attention to every transaction, every trend, every pattern — and speak up

### Advisor personality
- **Celebrate wins** — reinforce good habits ("Groceries down 8% vs last quarter. Meal planning is working.")
- **Tough love when needed** — "You said you'd keep dining under £300. You hit £480. Third month running. What's changing?"
- **Data-grounded always** — every statement references specific amounts, merchants, trends
- **Never generic** — no "consider reducing discretionary spending." Always specific: "Deliveroo 12 times this month, £186. That's £2,232/year."

### API cost philosophy
- £10-20/month in OpenAI API costs is acceptable if the system saves hundreds annually
- Use GPT-5 (not mini) for advisory features — optimize for insight quality, not cost
- Rule-based intelligence is preferred where sufficient, but don't avoid AI calls when they add value

---

## 2. Current State (What Exists Today)

### Intelligence Layer (Rule-Based, Free)
| Feature | File | What it does |
|---------|------|-------------|
| Health Scorecard | `src/lib/intelligence/health-scorecard.ts` | 0-100 monthly score across 4 dimensions (savings rate, essentials ratio, category creep, money flow clarity) |
| Category Creep | `src/lib/intelligence/category-creep.ts` | Compares current cycle spending per category against 3-cycle rolling average, flags >20% increases |
| Convenience Premium | `src/lib/intelligence/convenience-premium.ts` | Detects premium-for-convenience spending (Deliveroo, Uber, coffee shops — 40+ UK merchants) |
| Recommendations | `src/lib/intelligence/recommendations.ts` | Generates severity-rated recommendations from scorecard + creep + premium data |

### AI Layer (OpenAI-Powered)
| Feature | Route/File | Model | What it does |
|---------|-----------|-------|-------------|
| Monthly Analysis | `/api/analyse` | GPT-5, temp 0.4 | Full financial advisor report: grade, patterns, push-back, savings opportunities, positives, warnings, next month target |
| Chat/Ask AI | `/api/chat` | GPT-5, temp 0.7 | Conversational advisor with full financial context (scorecard, creep, salary flow, recommendations, knowledge bank) |
| Categorization | `/api/categorize` | GPT-5-mini, temp 0 | Batch categorization (150 txns/call) for uncategorized transactions |
| Savings Suggestions | `/api/insights` | GPT-5, temp 0.3 | Generates specific savings ideas with estimated amounts |
| CSV Detection | `src/lib/ai/csv-parser.ts` | GPT-5-mini, temp 0 | Fallback column detection for unusual CSV formats |

### Frontend Pages
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Period selector, income/spending totals, category pie, card breakdown, health scorecard, recommendations, salary flow Sankey, AI analysis widget |
| Upload | `/upload` | CSV drag-and-drop, bank detection, parsing, storage |
| Transactions | `/transactions` | Search, filter, sort, bulk categorize, "Recategorize All" button |
| Trends | `/trends` | Income vs spending chart, category trend lines, month-over-month table |
| AI Insights | `/insights` | Generate insights button, anomalies, savings suggestions, subscriptions |
| Ask AI | `/ask` | Free-form chat with suggested starters |
| Categories | `/categories` | Category management and rules |
| Knowledge | `/knowledge` | User knowledge bank (life events, goals, context) |
| Accounts | `/accounts` | Account hierarchy and nicknames |

### The Gap
Everything is **passive**. User must click buttons, navigate to pages, and pull insights. Nothing pushes. Nothing nags. Nothing holds you accountable. The AI analysis exists but only runs when you click "Run Analysis." The chat exists but waits for you to ask. Targets exist as a simple monthly savings number with no enforcement.

---

## 3. What We're Building

### 3.1 The Advisor Loop

The advisor operates on a **continuous loop** at four cadences:

```
ON UPLOAD (immediate)
  "12 uncategorized. Go sort them."
  → after categorization →
  "This upload: £2,340 in spending. Dining out £180 above target.
   Spotted what looks like 2 Netflix charges."

WEEKLY CHECK-IN (when app opened, >5 days since last)
  "This week: 23 transactions, £890 total.
   Dining pace: £220 of £300 target — on track.
   Watch: 3 Amazon purchases, £145."

MONTHLY DEEP REVIEW (end of salary cycle)
  "Month grade: C+. You committed to £300 dining — spent £480.
   Third month of creep. Savings rate 12% vs 20% target.
   BUT: Groceries down 8%, transport stable. Good discipline there.
   Next month: bring dining back to £350. Call Sky about that £76/month."

ON DEMAND (enhanced chat)
  User: "How are we doing this month?"
  Advisor: "Honestly? Mixed. You're tracking well on groceries (£380 vs £400 target)
   but dining is at £290 with 10 days left and your target is £300.
   Ease off Deliveroo — 8 orders so far, £94. Cook this weekend."
```

### 3.2 Categorization Shepherd

**Current:** User uploads CSV → navigates to /transactions → clicks "Recategorize All" manually.

**New:** Persistent, prominent nag that cannot be ignored.

- After upload, if ANY transactions are category "Other" with `categorySource !== 'manual'`:
  - Show a **blocking banner** at the top of the dashboard: "**14 transactions need categorizing.** I can't give you a proper analysis until these are sorted. [Categorize Now]"
  - The button triggers AI categorization automatically (no need to navigate to /transactions)
  - After AI categorization, if some remain uncategorized, show: "**3 still uncategorized** — AI couldn't figure these out. [Review Manually]" → links to filtered /transactions view
  - Once all categorized → auto-trigger upload briefing

- **State tracking:** per cycle, track `{total, categorized, uncategorized, lastNaggedAt}`
- **Component:** `CategorisationShepherd` — renders in dashboard layout, above all content

### 3.3 Post-Upload Advisor Briefing

After categorization is complete, the advisor automatically generates an **upload briefing**:

**System prompt addition for upload briefings:**
```
You are reviewing a fresh batch of transactions just uploaded to a UK household's
financial dashboard. Compare against their spending targets and previous cycle data.

Be IMMEDIATE and SPECIFIC:
- How much new spending was added
- Which categories are over/approaching target
- Any suspicious patterns (duplicates, unusual merchants, high single transactions)
- How this changes the month's trajectory

Tone: Direct. Celebrate if things look good. Push back if they don't.
Reference specific merchants and amounts. No hand-waving.
```

**Response schema:**
```typescript
interface UploadBriefing {
  headline: string;          // "£2,340 uploaded. 3 areas need attention."
  newSpendTotal: number;     // pence
  targetAlerts: {            // categories approaching or exceeding target
    category: string;
    spent: number;           // pence, this cycle total
    target: number;          // pence
    status: 'on_track' | 'approaching' | 'exceeded';
    message: string;         // "£40 left with 12 days to go"
  }[];
  suspiciousItems: {         // things that need attention
    description: string;
    amount: number;
    reason: string;          // "Possible duplicate", "Unusually high", "New merchant"
  }[];
  quickWins: string[];       // immediate actionable suggestions
  moodEmoji: string;         // summarises the upload mood
}
```

### 3.4 Spending Targets System

**Current:** A simple `savings_targets` table with one monthly number.

**New:** Per-category targets with AI suggestions and enforcement.

**How targets are set:**
1. AI analyses 3-month rolling average per category
2. Suggests targets that are 5-10% below current average (realistic, not aspirational)
3. User can accept, adjust, or reject each target
4. Total spending target and savings rate target are computed from category targets
5. Targets roll forward: next cycle inherits previous targets unless changed

**How targets are enforced:**
- Real-time tracking: on every page, the advisor knows where you stand vs targets
- Mid-cycle warnings: "You're at £220 of £300 dining target with 15 days left. Pace yourself."
- End-of-cycle accountability: "You said £300. You spent £480. What's the plan?"
- Trend tracking: "This is the third month dining exceeded target. Time to either raise the target or change the behaviour."

**Target data shape:**
```typescript
interface SpendingTarget {
  id: string;                // UUID
  userId: string;
  cycleId: string;           // 'cycle-2026-03'
  category: string;          // 'Dining Out'
  targetAmount: number;      // pence
  aiSuggested: boolean;      // was this AI-recommended?
  previousCycleActual: number; // pence — what was actually spent last cycle
  rollingAverage: number;    // pence — 3-cycle average
  createdAt: string;
}
```

### 3.5 Weekly Check-In

Generated when:
- User opens the app AND
- Last weekly briefing was >5 days ago AND
- There are transactions in the current cycle

**System prompt for weekly check-ins:**
```
You are doing a mid-week financial check-in for a UK household. This is NOT
a full review — it's a quick status update to keep them on track.

Focus on:
- Spending velocity: are they on pace for their targets?
- Any notable transactions this week (high amounts, new merchants, patterns)
- One specific thing to watch for the rest of the week
- One positive if there is one

Keep it SHORT — 100 words max. Think of it as a text from their accountant friend.
Tone: Casual but data-backed. No fluff.
```

**Response schema:**
```typescript
interface WeeklyCheckin {
  headline: string;          // "Solid week. One thing to watch."
  weekSpend: number;         // pence — this week's total spending
  paceStatus: {
    category: string;
    spent: number;           // pence, cycle-to-date
    target: number;          // pence
    projection: number;      // pence, projected at current pace
    status: 'on_track' | 'watch' | 'over';
  }[];
  notable: string[];         // "£145 at Amazon (3 purchases)"
  encouragement: string;     // positive observation
  watchItem: string;         // one thing to be careful about
}
```

### 3.6 Monthly Deep Review (Enhanced)

Upgrade existing `/api/analyse` to include:

**New inputs to send:**
- Spending targets for this cycle (all categories)
- Target vs actual for each category
- Previous month's commitments and their outcomes
- Year-to-date trajectory (total saved vs planned)
- Same month last year (if data exists) for seasonal comparison

**New sections in response:**
```typescript
interface EnhancedMonthlyAnalysis {
  // ... existing fields (summary, monthGrade, topInsight, spendingPatterns, etc.)

  // NEW: Target accountability
  targetReport: {
    category: string;
    target: number;          // pence
    actual: number;          // pence
    variance: number;        // pence (negative = under target, positive = over)
    verdict: string;         // "Nailed it" | "Close enough" | "Missed by a mile"
    trend: string;           // "Improving" | "Stable" | "Getting worse"
  }[];

  // NEW: Commitment follow-up
  commitmentReview: {
    commitment: string;      // "Renegotiate Sky contract"
    status: 'completed' | 'missed' | 'unknown';
    followUp: string;        // "Did you call Sky? Their retention team..."
  }[];

  // NEW: Savings trajectory
  savingsTrajectory: {
    savedThisCycle: number;  // pence
    savedYTD: number;        // pence
    projectedAnnual: number; // pence at current rate
    targetAnnual: number;    // pence
    message: string;         // "At this pace, you'll save £8,400 this year. Target was £12,000."
  };

  // NEW: Contract/renewal alerts
  contractAlerts: {
    merchant: string;        // "Sky Digital"
    monthlyAmount: number;   // pence
    months: number;          // how many months this has been charging
    suggestion: string;      // "You've paid Sky £76/month for 18 months. Call retentions."
    estimatedSaving: string; // "Typical saving: £15-25/month"
  }[];

  // NEW: Next cycle targets (AI-suggested)
  suggestedTargets: {
    category: string;
    suggestedAmount: number; // pence
    rationale: string;       // "Based on 3-month avg of £320, suggest £300 (-6%)"
  }[];
}
```

### 3.7 Enhanced Chat (Advisor Personality Upgrade)

Upgrade the `/api/chat` system prompt to embody the full advisor personality:

**Key additions to system prompt:**
```
PERSONALITY:
- You celebrate wins genuinely. Good habits deserve recognition.
- You push back HARD on bad patterns. Don't sugarcoat.
- If they've set targets, hold them accountable. "You committed to X. You're at Y."
- If they ask a vague question, answer it specifically AND proactively flag the most important thing they should know right now.
- Reference previous analyses and briefings. "Last month I flagged dining creep. It's still climbing."

ACCOUNTABILITY:
- You know their spending targets. Reference them.
- You know their commitments. Follow up on them.
- You know their history. Compare this month to last month, and to 3 months ago.
- If savings rate is below target, say so in every interaction until it improves.

PROACTIVE:
- Don't just answer the question. Add the most important thing they need to hear right now.
- If category creep is happening, mention it even if they didn't ask.
- If a commitment is overdue, bring it up.
- If there's a quick win they haven't acted on, suggest it again.
```

**New context to pass to chat:**
- Current spending targets and progress
- Active commitments and their status
- Previous briefings (upload + weekly) for continuity
- Year-to-date savings trajectory

### 3.8 Pattern Detection Enhancements

**3.8.1 Contract Renewal Alerting**
- Detect merchants charging monthly for 12+ months
- Flag for renegotiation: "You've paid Vodafone £42/month for 14 months. Your contract may be up. Call retentions or check Uswitch."
- Store detected contracts in intelligence layer

**3.8.2 Duplicate Subscription Detection (Enhanced)**
- Current: Detects same merchant on multiple accounts
- Add: Detect overlapping services (e.g., Netflix + Disney+ + Amazon Prime + Apple TV = 4 streaming services at £45/month total)
- Add: Detect unused subscriptions (charged but no related spending — e.g., gym membership but no nearby transport to gym)

**3.8.3 Spending Trajectory Projection**
- For each category: if current pace continues, what's the end-of-cycle total?
- For overall: if current pace continues, what's the annual savings?
- "At current pace, dining will hit £520 this cycle (target: £300)"

**3.8.4 Year-over-Year Comparison**
- Same cycle last year vs this year
- "March 2025: £4,200 total spending. March 2026: £4,800. That's £600 more — mostly dining (+£200) and shopping (+£180)."

### 3.9 Advisor Dashboard Transformation

**Current dashboard:** Dense, data-heavy, passive. Shows everything at once.

**New dashboard concept:** Advisor-led, with the briefing as the centrepiece.

**Layout (top to bottom):**

1. **Categorisation Shepherd** (if applicable)
   - Blocking banner: "14 transactions need categorizing. [Categorize Now]"
   - Only shows when uncategorized exist

2. **Latest Advisor Briefing** (the centrepiece)
   - Upload briefing, weekly check-in, or monthly review — whichever is most recent/relevant
   - Headline, key alerts, target status, quick wins
   - Expandable sections for detail
   - "Ask me about this" button → opens chat with briefing context

3. **Target Tracker** (compact)
   - Bar chart: each category's progress vs target
   - Color coded: green (on track), amber (approaching), red (exceeded)
   - Tappable: opens detail for that category

4. **Active Commitments** (compact)
   - "Renegotiate Sky" — due this cycle — [Done] [Defer]
   - "Keep dining under £300" — tracking: £220/£300

5. **Quick Stats** (existing, kept compact)
   - Income / Spending / Net / Savings Rate
   - Health score badge

6. **Everything Else** (collapsed/secondary)
   - Category pie, card breakdown, salary flow — available but not the hero

---

## 4. New Data Model

### 4.1 New Supabase Tables

```sql
-- Advisor briefings (the "push" content)
CREATE TABLE advisor_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('upload', 'weekly', 'monthly')) NOT NULL,
  cycle_id TEXT NOT NULL,
  briefing JSONB NOT NULL,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_advisor_briefings_user_cycle
  ON advisor_briefings(user_id, cycle_id, type);

ALTER TABLE advisor_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own briefings"
  ON advisor_briefings FOR ALL
  USING (auth.uid() = user_id);

-- Per-category spending targets
CREATE TABLE spending_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cycle_id TEXT NOT NULL,
  category TEXT NOT NULL,
  target_amount INTEGER NOT NULL,     -- pence
  ai_suggested BOOLEAN DEFAULT false,
  previous_actual INTEGER,            -- pence, last cycle's actual
  rolling_average INTEGER,            -- pence, 3-cycle average
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, cycle_id, category)
);

ALTER TABLE spending_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own targets"
  ON spending_targets FOR ALL
  USING (auth.uid() = user_id);

-- Advisor commitments (things user/advisor agreed to)
CREATE TABLE advisor_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cycle_id TEXT NOT NULL,
  commitment TEXT NOT NULL,
  type TEXT CHECK (type IN ('reduce_spending', 'renegotiate', 'cancel', 'investigate', 'save', 'other')) NOT NULL,
  status TEXT CHECK (status IN ('active', 'completed', 'missed', 'deferred')) DEFAULT 'active',
  source TEXT CHECK (source IN ('ai_suggested', 'user_set')) DEFAULT 'ai_suggested',
  outcome TEXT,
  related_category TEXT,
  related_merchant TEXT,
  due_cycle_id TEXT,         -- which cycle this should be done by
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE advisor_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own commitments"
  ON advisor_commitments FOR ALL
  USING (auth.uid() = user_id);
```

### 4.2 localStorage Cache Keys (New)

| Key | Type | Purpose |
|-----|------|---------|
| `savings_advisor_briefings` | `AdvisorBriefing[]` | Cache of recent briefings |
| `savings_spending_targets` | `SpendingTarget[]` | Current cycle targets |
| `savings_advisor_commitments` | `AdvisorCommitment[]` | Active commitments |
| `savings_last_weekly_checkin` | `string` (ISO date) | When last weekly was generated |
| `savings_categorisation_state` | `{ total, categorized, uncategorized }` | Per-cycle categorization progress |

---

## 5. New API Routes

### 5.1 POST `/api/advisor/briefing`

**Purpose:** Generate an advisor briefing of a given type.

**Input:**
```typescript
interface BriefingRequest {
  type: 'upload' | 'weekly' | 'monthly';
  cycleId: string;
  // For upload type:
  newTransactionIds?: string[];       // which transactions were just uploaded
  // For all types:
  currentCycleTransactions: {         // summarised, not raw
    totalIncome: number;              // pence
    totalSpending: number;
    byCategory: Record<string, { spent: number; target: number; txnCount: number }>;
    topMerchants: { merchant: string; amount: number; count: number }[];
  };
  targets: SpendingTarget[];          // current cycle targets
  commitments: AdvisorCommitment[];   // active commitments
  previousBriefing?: object;          // last briefing for continuity
  categoryCreep?: CategoryCreep[];
  healthScorecard?: HealthScorecard;
  savingsTrajectory?: {
    savedYTD: number;
    targetAnnual: number;
  };
}
```

**Model:** GPT-5, temperature 0.5
**Output:** Type-specific briefing JSON (see schemas in sections 3.3, 3.5, 3.6)

### 5.2 POST `/api/advisor/targets`

**Purpose:** Get AI-suggested targets or save user-confirmed targets.

**Input (suggest mode):**
```typescript
{
  action: 'suggest';
  cycleId: string;
  historicalSpending: {
    category: string;
    last3Cycles: number[];    // pence per cycle
    average: number;          // pence
  }[];
}
```

**Output (suggest mode):**
```typescript
{
  suggestions: {
    category: string;
    suggestedTarget: number;  // pence
    rationale: string;
    difficulty: 'easy' | 'moderate' | 'stretch';
  }[];
  overallSavingsTarget: number; // pence
  message: string;              // "Based on your history, here's what I think is realistic..."
}
```

**Input (save mode):**
```typescript
{
  action: 'save';
  cycleId: string;
  targets: { category: string; targetAmount: number; aiSuggested: boolean }[];
}
```

### 5.3 POST `/api/advisor/commitments`

**Purpose:** CRUD for advisor commitments.

**Input:**
```typescript
{
  action: 'list' | 'create' | 'update';
  cycleId?: string;
  commitment?: Partial<AdvisorCommitment>;
}
```

---

## 6. New & Modified Frontend Components

### 6.1 New Components

| Component | File | Purpose |
|-----------|------|---------|
| `CategorisationShepherd` | `src/components/advisor/categorisation-shepherd.tsx` | Blocking banner for uncategorized transactions. Triggers AI categorization. Shows progress. |
| `AdvisorBriefingCard` | `src/components/advisor/briefing-card.tsx` | Renders any briefing type (upload/weekly/monthly). Headline, alerts, expandable sections. |
| `TargetTracker` | `src/components/advisor/target-tracker.tsx` | Bar chart of category targets vs actuals. Color-coded status. |
| `CommitmentList` | `src/components/advisor/commitment-list.tsx` | Active commitments with [Done]/[Defer] actions. |
| `TargetSetupWizard` | `src/components/advisor/target-setup-wizard.tsx` | Guided target-setting flow: AI suggests → user adjusts → confirm. |
| `AdvisorChatEnhanced` | `src/components/advisor/chat-enhanced.tsx` | Upgraded chat with target/commitment awareness, proactive suggestions. |

### 6.2 Modified Components

| Component | File | Changes |
|-----------|------|---------|
| Dashboard | `src/app/page.tsx` | Restructure: shepherd → briefing → targets → commitments → stats → details |
| Upload page | `src/app/upload/page.tsx` | After upload, redirect to dashboard where shepherd takes over |
| Layout Shell | `src/components/layout-shell.tsx` | Add `useAdvisorState()` hook for global advisor awareness |
| Sidebar | `src/components/dashboard/sidebar.tsx` | Replace "AI Insights" + "Ask AI" with unified "Advisor" entry |

### 6.3 New Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAdvisorState` | `src/hooks/useAdvisorState.ts` | Tracks uncategorized count, pending briefings, target progress, active commitments. Single source of truth for advisor status. |
| `useSpendingTargets` | `src/hooks/useSpendingTargets.ts` | CRUD for spending targets. Computes progress vs targets for current cycle. |
| `useAdvisorBriefings` | `src/hooks/useAdvisorBriefings.ts` | Fetch/generate briefings. Manages weekly check-in timing. |
| `useCommitments` | `src/hooks/useCommitments.ts` | CRUD for commitments. Surfaces overdue commitments. |

---

## 7. Enhanced AI Prompts

### 7.1 Advisor Chat — New System Prompt

Replace the current `/api/chat` system prompt with:

```
You are the personal financial advisor for Gus and Larissa's household. You have
direct access to their real transaction data, health scorecard, spending targets,
commitments, and intelligence signals. You are NOT a chatbot — you are their advisor.

PERSONALITY:
- Celebrate wins genuinely. "Groceries down 8% — the meal planning is paying off."
- Push back HARD on bad patterns. No sugarcoating. "Dining out: £480 against a £300
  target. Third month in a row. Something needs to change."
- Be specific ALWAYS. Never say "consider reducing spending." Say "Deliveroo 12 times
  this month, £186. That's £2,232 annualised. Cook twice more per week."
- Reference their targets and commitments. "You committed to renegotiating Sky. Did you?"
- If savings rate is below target, mention it in every interaction until it improves.

ACCOUNTABILITY:
- You know their spending targets. Reference them in answers.
- You know their commitments. Follow up proactively.
- You know their history. Compare this month to last, and to 3 months ago.
- Track patterns over time. "This is the third month dining exceeded target."

PROACTIVE:
- Don't just answer the question. Also flag the most important thing they need to know.
- If category creep is happening, mention it even if they didn't ask.
- If a commitment is overdue, bring it up.
- If there's a quick win they haven't acted on, nudge them.

HARD RULES:
- NEVER suggest external apps or services. You ARE the tool.
- NEVER give generic advice. Every statement must reference their data.
- Format amounts as £X.XX from their actual figures.
- Keep responses under 200 words. Be direct, not thorough.
- Never say "I don't have enough information" if the data contains relevant sections.
```

### 7.2 Monthly Analysis — Enhanced System Prompt

Add to the existing `/api/analyse` system prompt:

```
ADDITIONAL CONTEXT — TARGETS AND COMMITMENTS:

You now have access to spending targets and commitments for this household.

For each category target provided:
- Compare actual vs target. Be specific: "Dining Out: £480 spent, £300 target, £180 over."
- If exceeded 2+ months in a row, escalate: "This is a pattern, not a one-off."
- If met or under, celebrate: "Transport: £185 vs £200 target. Well managed."

For each commitment provided:
- If status is 'active', follow up: "Last month I suggested renegotiating Sky. Did you call?"
- If completed, acknowledge: "You followed through on switching energy providers. Good."
- If missed/deferred, push: "The Sky renegotiation is now 2 months overdue. Call today: 0333 759 1018."

NEW SECTIONS in your JSON response:
- "targetReport": per-category target vs actual with verdict
- "commitmentReview": follow-up on each commitment
- "savingsTrajectory": YTD saved, projected annual, target annual
- "contractAlerts": merchants charging 12+ months, suggest renegotiation
- "suggestedTargets": AI-recommended targets for next cycle
```

---

## 8. Implementation Phases

### Phase 1: Data Foundation
**Parallelizable: YES (3 independent streams)**

**Stream A — Database tables:**
- Create migration SQL for `advisor_briefings`, `spending_targets`, `advisor_commitments`
- Apply via `npx supabase db query --linked`
- Add RLS policies
- Add to `src/lib/supabase/storage.ts`: CRUD functions for all 3 tables

**Stream B — Hooks and state:**
- Create `useAdvisorState`, `useSpendingTargets`, `useAdvisorBriefings`, `useCommitments`
- Add localStorage cache keys
- Wire into `TransactionProvider` or create new `AdvisorProvider`

**Stream C — API routes:**
- Create `/api/advisor/briefing` (3 briefing types)
- Create `/api/advisor/targets` (suggest + save)
- Create `/api/advisor/commitments` (list + create + update)
- All use GPT-5, follow existing retry/error patterns

### Phase 2: Categorisation Shepherd + Upload Flow
**Sequential (depends on Phase 1)**

1. Build `CategorisationShepherd` component
2. Integrate into dashboard layout (top of page, above all content)
3. Add auto-categorization trigger (calls `/api/categorize` without navigating to /transactions)
4. Add categorization progress tracking (total/done/remaining)
5. After categorization completes → auto-call `/api/advisor/briefing` with type `upload`
6. Modify upload page: after successful upload, redirect to dashboard where shepherd takes over

### Phase 3: Target System
**Parallelizable: YES (2 streams)**

**Stream A — Target Setup:**
- Build `TargetSetupWizard` component
- AI suggests targets based on 3-month rolling averages (calls `/api/advisor/targets` suggest mode)
- User reviews, adjusts, confirms
- Save to Supabase
- Show on first visit of a new cycle if no targets set

**Stream B — Target Tracking:**
- Build `TargetTracker` component (bar chart, color-coded)
- Real-time computation: for each category, current cycle spent vs target
- Projection: at current pace, will target be hit?
- Integrate into dashboard and into chat context

### Phase 4: Advisor Briefings
**Parallelizable: YES (3 streams)**

**Stream A — Upload Briefing:**
- Wire post-categorization trigger to generate upload briefing
- Build `AdvisorBriefingCard` for upload type
- Show on dashboard after new upload

**Stream B — Weekly Check-in:**
- Add timing logic to `useAdvisorBriefings`: if last weekly >5 days ago AND app opened
- Generate weekly briefing on app load
- Build `AdvisorBriefingCard` for weekly type

**Stream C — Monthly Review (Enhanced):**
- Upgrade `/api/analyse` with new prompt sections (targets, commitments, trajectory, contracts)
- Build `AdvisorBriefingCard` for monthly type
- Add `suggestedTargets` flow: after monthly review, prompt target-setting for next cycle
- Add commitment creation from monthly review suggestions

### Phase 5: Enhanced Chat + Commitments
**Parallelizable: YES (2 streams)**

**Stream A — Chat Upgrade:**
- Replace `/api/chat` system prompt with new advisor personality
- Pass spending targets, commitments, recent briefings as additional context
- Add proactive flag in every response (most important thing right now)

**Stream B — Commitment System:**
- Build `CommitmentList` component
- Wire commitment creation from monthly reviews and chat suggestions
- Add [Done]/[Defer] actions
- Commitments carry forward across cycles until resolved

### Phase 6: Dashboard Transformation
**Sequential (depends on Phases 2-5)**

1. Restructure dashboard layout:
   - CategorisationShepherd (top, if applicable)
   - Latest AdvisorBriefingCard (hero section)
   - TargetTracker (compact)
   - CommitmentList (compact)
   - Quick stats (income/spending/net/savings rate)
   - Existing details (collapsed/secondary)
2. Replace sidebar "AI Insights" + "Ask AI" with unified "Advisor" entry
3. Mobile: move Advisor to primary tab bar (replace one of the current 4)

### Phase 7: Pattern Detection Enhancements
**Parallelizable: YES (independent of UI)**

- Contract renewal detection (12+ months same merchant)
- Overlapping service detection (multiple streaming, multiple insurance, etc.)
- Spending trajectory projection per category
- Year-over-year comparison (same cycle last year)
- Feed all into advisor briefings and chat context

---

## 9. Agent Team Strategy

When executing this plan, use agent teams for maximum parallelism:

### Phase 1 Execution (3 agents)
```
Agent A: "Create advisor Supabase tables and storage functions"
  - migration SQL
  - src/lib/supabase/storage.ts additions
  - localStorage cache functions in storage-local.ts

Agent B: "Create advisor hooks"
  - useAdvisorState.ts
  - useSpendingTargets.ts
  - useAdvisorBriefings.ts
  - useCommitments.ts

Agent C: "Create advisor API routes"
  - /api/advisor/briefing/route.ts
  - /api/advisor/targets/route.ts
  - /api/advisor/commitments/route.ts
```

### Phase 2 Execution (1 agent — sequential)
```
Agent A: "Build categorisation shepherd and upload flow"
  - CategorisationShepherd component
  - Dashboard integration
  - Auto-categorize trigger
  - Post-categorize briefing trigger
  - Upload page redirect
```

### Phase 3 Execution (2 agents)
```
Agent A: "Build target setup wizard"
  - TargetSetupWizard component
  - AI target suggestion flow
  - First-visit-of-cycle trigger

Agent B: "Build target tracker"
  - TargetTracker component
  - Real-time progress computation
  - Projection logic
```

### Phase 4 Execution (3 agents)
```
Agent A: "Upload briefing system"
Agent B: "Weekly check-in system"
Agent C: "Enhanced monthly review"
```

### Phase 5 Execution (2 agents)
```
Agent A: "Upgrade chat system prompt and context"
Agent B: "Build commitment management system"
```

### Phase 6 Execution (1 agent — sequential)
```
Agent A: "Dashboard transformation"
  - Restructure layout
  - Navigation changes
  - Mobile tab bar update
```

---

## 10. Financial Advisor Research — Codified Principles

Based on research into what professional financial advisors do (Ramit Sethi's Conscious Spending Plan, Dave Ramsey's Zero-Based Budgeting, Nischa's P&L Method, YNAB's 4 Rules), these principles are embedded throughout the design:

### The Advisor Meeting Structure (codified into briefings)
1. **"What changed?"** → Upload briefing: new transactions analysed
2. **"Are you on track?"** → Target tracker: real-time progress bars
3. **"Where did you creep?"** → Category creep detection + alerts
4. **"What will you commit to?"** → Commitment system with follow-through tracking

### The Payday Routine (codified into monthly cycle)
- Salary cycle 23rd-22nd triggers cycle transition
- End of cycle = monthly deep review
- Start of new cycle = target-setting for next period
- Review actuals before setting next targets

### The P&L Mindset (codified into targets)
- Every pound has a job (category targets)
- Track variance (actual vs plan)
- Course-correct the variance (advisor pushback)
- Celebrate positive variance (win reinforcement)

### Behavioural Coaching (codified into personality)
- Make the invisible visible (annualise small amounts: "£3.50 coffee x 5/week = £910/year")
- Save people from themselves (push back on emotional spending)
- Accountability partner (follow up on commitments)
- Celebrate to reinforce (good habits get acknowledged)

---

## 11. Success Metrics

The advisor is working when:
- **Categorisation completion rate** increases (fewer "Other" transactions left unresolved)
- **Target adherence** improves over time (more categories green, fewer red)
- **Commitments completed** (renegotiations made, subscriptions cancelled)
- **Savings rate trending up** (the ultimate measure)
- **User engagement** (opening the app weekly, interacting with briefings)
- **Cost per insight** (API spend vs savings identified) — target: 10:1 ROI minimum

---

## 12. Key File Paths Reference

For the implementing session — where everything lives:

| What | Path |
|------|------|
| Transaction type | `src/types/index.ts` |
| Storage orchestrator | `src/lib/storage.ts` |
| Supabase CRUD | `src/lib/supabase/storage.ts` |
| localStorage cache | `src/lib/storage-local.ts` |
| Transaction hook | `src/hooks/useTransactions.ts` |
| Transaction context | `src/context/transactions.tsx` |
| Intelligence layer | `src/lib/intelligence/` |
| AI categoriser | `src/lib/ai/categoriser.ts` |
| AI insights engine | `src/lib/ai/insights-engine.ts` |
| Monthly analysis API | `src/app/api/analyse/route.ts` |
| Chat API | `src/app/api/chat/route.ts` |
| Categorize API | `src/app/api/categorize/route.ts` |
| Insights API | `src/app/api/insights/route.ts` |
| Dashboard page | `src/app/page.tsx` |
| Upload page | `src/app/upload/page.tsx` |
| Transactions page | `src/app/transactions/page.tsx` |
| Layout shell | `src/components/layout-shell.tsx` |
| Sidebar | `src/components/dashboard/sidebar.tsx` |
| Mobile tab bar | `src/components/mobile/bottom-tab-bar.tsx` |
| Health scorecard | `src/lib/intelligence/health-scorecard.ts` |
| Category creep | `src/lib/intelligence/category-creep.ts` |
| Convenience premium | `src/lib/intelligence/convenience-premium.ts` |
| Recommendations | `src/lib/intelligence/recommendations.ts` |
| Categories system | `src/lib/categories.ts` |
| Migration SQL | `scripts/supabase-migration.sql` |
| Existing specs | `docs/superpowers/specs/` |

---

## 13. What NOT To Change

- Money invariants (pence integers, negative=out, positive=in)
- Categorization pipeline order (custom → keyword → Amex → GPT)
- Salary cycle boundaries (23rd-22nd)
- Auth system (OTP, 3 allowed emails)
- CSV parsing (NatWest + Amex parsers work correctly)
- localStorage ↔ Supabase storage pattern (Supabase primary, localStorage cache)

---

## 14. Session Handoff Instructions

Paste this into a new Claude Code session to begin implementation:

```
I have a comprehensive execution plan for transforming my savings dashboard into an
AI financial advisor. The plan is at:

docs/superpowers/specs/2026-03-25-ai-financial-advisor-design.md

Please read it fully. It contains:
- Complete vision and personality spec
- Current state of the codebase (all file paths, data models, AI prompts)
- 7 implementation phases with parallelization strategy
- Agent team assignments for each phase
- New database tables, API routes, components, and hooks
- Enhanced AI prompts (full text)
- Key file paths reference

Start with Phase 1 (Data Foundation) — it has 3 independent streams that can
run as parallel agents. Then proceed through phases sequentially.

Important: Do NOT use MCP Supabase/Vercel tools — use CLI only (npx supabase, vercel, gh).
Read CLAUDE.md for all project conventions.
```
