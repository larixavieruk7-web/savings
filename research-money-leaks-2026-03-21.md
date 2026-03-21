# Research Brief: Hidden Money Leaks for High-Earning UK Households
*Generated: 2026-03-21 | NotebookLM analysis of 8 YouTube sources*

---

## Top Videos Analysed

| # | Title | Channel | Views | URL |
|---|-------|---------|-------|-----|
| 1 | How To Manage Your Money Like The 1% | Nischa | 2.96M | https://www.youtube.com/watch?v=NEzqHbtGa9U |
| 2 | The Savings Expert: Passive Income Is A Scam | Diary of a CEO | 2.38M | https://www.youtube.com/watch?v=jFlnRBO8mcg |
| 3 | ACCOUNTANT EXPLAINS: How I manage my money on payday | Nischa | 1.64M | https://www.youtube.com/watch?v=4sT2B2SRypo |
| 4 | The One Simple Budgeting Method That Changed My Life | Humphrey Yang | 366K | https://www.youtube.com/watch?v=N2aODJWw7Xw |
| 5 | 9 Money Leaks Affecting Your Finances And How To Fix Them | Clever Girl Finance | 91K | https://www.youtube.com/watch?v=nK8wf3nTeJQ |
| 6 | How To Find Money Leaks and Plug Them | Under the Median | 12K | https://www.youtube.com/watch?v=4xk9n4Jwr74 |
| 7 | Invisible Money Leaks: How To Find Them | Finn Flow | N/A | https://www.youtube.com/watch?v=QWeeHFhmb8s |
| 8 | Money Leaks Affecting Your Finances — Podcast | Clever Girl Finance | 2.3K | https://www.youtube.com/watch?v=Bvs74mIahGg |

---

## Key Insights from NotebookLM Analysis

### The Core Problem: "Lifestyle Creep + Automation Blindness"
High earners typically don't have a single big leak — they have dozens of small, automated, normalised ones that compound. The central blind spot is that once spending is automated (direct debits, subscriptions, delivery apps), it becomes psychologically "invisible."

### Category-Level Leaks

| Category | The Leak | Mechanism |
|----------|----------|-----------|
| **Food & Drink** | 30–40% of purchased food wasted; daily coffee/snacks £10–20/day | Habit-blind, normalised |
| **Subscriptions** | Gym, streaming, magazines running 3–6 months unused | Automated billing = forgotten |
| **Insurance** | Policies for items no longer owned; no annual renegotiation | Assumed "fixed" |
| **Utilities & Mobile** | No negotiation after 12 months; premium plans assumed necessary | Loyalty penalty |
| **Delivery & Convenience** | Delivery fees, premium speeds, "free shipping" minimum-spend traps | Friction-free = overuse |
| **Lifestyle Upgrades** | Car, home, groceries upgraded with income — maintenance balloons | Lifestyle creep |
| **Bank Fees** | ATM fees, paper statement charges, overdraft fees | Too small to notice individually |

### Habits & Behavioural Blind Spots

1. **"Spaving"** — Buying more to "save" via bulk deals or discounts. Money spent isn't saved.
2. **Brand loyalty tax** — Name brands vs store brands; identical products, 20–40% premium.
3. **Status signalling** — Purchases driven by how they look to others, not utility. The "Desert Island Test": would you buy it if nobody could see?
4. **Mental accounting** — The brain creates fake walls between budget categories, masking the total drain.
5. **Decision fatigue** — Evening/weekend purchases are impulsive. The leaks cluster around low-willpower moments.
6. **Sunk cost fallacy** — Keeping unused subscriptions because "I've already paid for it."

### Key Metrics Financial Experts Flag

| Metric | Healthy | Warning |
|--------|---------|---------|
| Savings floor | ≥ 15–20% of net income | < 15% any month |
| Essential spending | ≤ 50–65% of net income | > 65% |
| Category vs 90-day average | Within ±10% | > 20% spike |
| Subscription active use | Used in past 60 days | Unused 3–6 months |
| Dining out + delivery combined | < 15% of food budget | Trending up 3+ months |

### Expert-Recommended Review Cadence
- **Weekly**: 5-minute scan for unusual charges, new fees, frequency spikes
- **Monthly**: Full category review vs 90-day rolling average; flag any >10% creep
- **Quarterly**: Subscription audit; renegotiate insurance, mobile, utilities

---

## Dashboard Improvement Suggestions (Grounded in Existing Code)

The existing dashboard already has: anomaly detection (per-merchant spikes), duplicate subscription alerts, month-over-month category changes, 50/30/20 rule, essential/discretionary split, and AI savings suggestions. The gaps below are what research shows matters most but isn't yet surfaced.

---

### 1. 90-Day Category Rolling Average Alerts
**The leak it catches:** Lifestyle creep — gradual category inflation that looks "normal" month to month but compounds over a quarter.

**What's missing:** The existing anomaly detection flags per-merchant spikes (>2.5x merchant avg). But it doesn't flag when a *category* has crept up steadily over 3 months. Dining could go up 8% each month — never triggering a spike alert — but be 26% higher than 3 months ago.

**How to build it:** In `src/lib/ai/insights-engine.ts`, add a `detectCategoryCreep()` function alongside `detectAnomalies()`. For each category, compute the 90-day rolling average spend and compare it to the current month. Flag if >20% above average AND the trend has been upward for 2+ consecutive months. Surface this on the Insights page as "Category Creep Alerts."

**Estimated impact:** Catches the #1 high-earner blind spot. Requires no new data — all in existing transactions.

---

### 2. "Convenience Spending" Aggregation Widget
**The leak it catches:** Delivery fees, coffee shop habits, Uber/taxi, takeaways — individually small, collectively massive.

**What's missing:** These transactions exist categorised as Dining, Transport, or Shopping. But they're never grouped as "convenience spending" — the pattern of paying a premium for frictionless consumption.

**How to build it:** Add a `CONVENIENCE_MERCHANTS` list in `src/lib/categories.ts` (matching patterns: Deliveroo, Uber Eats, Just Eat, Costa, Starbucks, Pret, Caffe Nero, Bolt, Citymapper, etc). Add a new widget on `/insights` that sums these up monthly, shows the trend, and projects the annual cost. No AI needed — pure computation.

**Estimated impact:** Most visible "oh wow" moment. Households routinely underestimate this by 3–5x.

---

### 3. Subscription Utilisation Aging
**The leak it catches:** Ghost subscriptions — services paid for but not appearing in recent months (cancelled at source but DD still running), or seasonal services billed year-round.

**What's missing:** The existing `computeSubscriptionData()` in `src/lib/subscriptions.ts` identifies recurring merchants but doesn't flag when a recurring merchant *stops* appearing. A gym membership that's been paid for 18 months but hasn't appeared in the last 3 is a ghost subscription.

**How to build it:** Extend `RecurringMerchant` type to include `lastSeenDate` and `monthsSinceLastSeen`. In the SubscriptionsPanel, add a "Possibly Cancelled" section: merchants that were recurring but haven't appeared in 2+ months. Show their last charge date and estimated wasted spend.

**Estimated impact:** Low implementation cost (extends existing code), high value for spotting forgotten subscriptions.

---

### 4. Lifestyle Creep Index on Dashboard Homepage
**The leak it catches:** The slow, compounding drift upward across key discretionary categories as income rises.

**What's missing:** The trends page shows category trends, but nowhere does the dashboard say "your Dining Out spending is 34% higher than 6 months ago." It's buried in charts; it's not surfaced as a named insight.

**How to build it:** Add a compact "Lifestyle Creep" widget to `src/app/page.tsx` (below the 50/30/20 widget). Compare average monthly spend in 3–4 key discretionary categories (Dining, Shopping, Entertainment, Personal Care) across two windows: last 3 months vs the 3 months before that. Show as: "Dining Out +28% vs 3 months ago" with a simple up-arrow trend indicator. All data is already in localStorage.

**Estimated impact:** Makes the invisible visible. High psychological impact because it names the behaviour.

---

### 5. Monthly Financial Health Digest ("Report Card")
**The leak it catches:** No single consolidated view of whether the month was "good" or "bad" — users have to piece it together from 5 different pages.

**What's missing:** The dashboard has all the ingredients (savings rate, essential %, biggest category mover, anomaly count, subscription waste) but never synthesises them into a verdict. Users need a "how did we actually do this month?" answer on the homepage.

**How to build it:** Add a collapsible "Monthly Report Card" section at the top of `src/app/page.tsx` for the current/last completed month. Show 5 items as pass/fail:
- Savings rate: ✓ 18% (above 15% floor) or ✗ 9% (below target)
- Essential spending: ✓ 52% of income (within range) or ✗ 71% (over budget)
- Biggest unexpected spend: "Dining Out was £340 above your 90-day average"
- Subscription waste: "£47/month in potential duplicates"
- One recommended action (generated from existing AI insights cache)

Uses only existing data and existing AI insights cache — no new API calls.

---

## Gaps Not Worth Building
- Weekly digest emails/notifications — no backend, localStorage only
- Food waste tracking — no itemised grocery data in bank CSV
- "Desert Island Test" purchase prompts — intervention at point of sale, outside dashboard scope

---

*NotebookLM notebook: feaf42d7-7ed9-45fc-851b-15aaf880ec2d ("UK Household Money Leaks Research")*
