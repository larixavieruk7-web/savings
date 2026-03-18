# Savings Dashboard

## Project Overview
A cutting-edge personal finance dashboard for a UK household (NatWest bank). Ingests bank statement CSVs, auto-categorizes transactions, and uses OpenAI to surface actionable insights — where money is going, what's getting more expensive, anomalies, and where to save.

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, `src/` directory)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **UI Components**: shadcn/ui (Tailwind-based primitives)
- **Visualization**: Tremor (dashboard KPI cards/widgets) + Recharts (custom charts) + Nivo (calendar heatmaps, sankey money-flow)
- **AI Insights**: OpenAI API (gpt-4o for analysis, gpt-4o-mini for categorization) via server-side API routes
- **Deployment**: Vercel (free tier)
- **CSV Parsing**: PapaParse
- **Date Handling**: date-fns with UK locale
- **Future Banking API**: TrueLayer (best UK Open Banking coverage) or GoCardless (free tier)

## Architecture

### Directory Structure
```
src/
├── app/
│   ├── (dashboard)/        # Main dashboard layout group
│   │   ├── page.tsx         # Dashboard home — summary cards, key metrics
│   │   ├── transactions/    # Transaction explorer with filters
│   │   ├── trends/          # Price trends over time
│   │   ├── insights/        # AI-powered insights page
│   │   └── upload/          # CSV upload & mapping
│   ├── api/
│   │   ├── upload/          # CSV ingestion endpoint
│   │   ├── insights/        # OpenAI insights generation
│   │   └── transactions/    # Transaction CRUD
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                  # Reusable UI primitives
│   ├── charts/              # Chart components (spending, trends, etc.)
│   ├── dashboard/           # Dashboard-specific widgets
│   └── upload/              # CSV upload & preview components
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client
│   │   ├── server.ts        # Server client
│   │   └── types.ts         # Database types
│   ├── openai.ts            # OpenAI client config
│   ├── csv/
│   │   ├── parser.ts        # CSV parsing logic
│   │   └── natwest.ts       # NatWest-specific column mapping
│   └── categories.ts        # Transaction categorization rules
└── types/
    └── index.ts             # Shared TypeScript types
```

### Database Schema (Supabase)
```sql
-- Household members
accounts (id, name, type, created_at)

-- Raw transactions from CSV
transactions (
  id, account_id, date, description,
  amount, balance, type (debit/credit),
  category, subcategory,
  merchant_name,       -- extracted/normalized
  is_recurring,        -- detected pattern
  raw_description,     -- original CSV text
  created_at
)

-- AI-generated insights
insights (
  id, type, title, description,
  severity (info/warning/alert),
  data_json,           -- supporting data for visualization
  period_start, period_end,
  created_at
)

-- Category mappings (learned over time)
category_rules (
  id, pattern, category, subcategory,
  confidence, source (manual/ai),
  created_at
)
```

### NatWest CSV Format
NatWest exports CSVs with columns:
`Date, Type, Description, Value, Balance, Account Name, Account Number`
- Date format: `dd MMMM yyyy` (e.g., "29 May 2025") — NOT dd/MM/yyyy
- Value: signed decimal (negative = outflow), no currency symbol
- Multi-account: single CSV contains rows from multiple accounts (e.g., "Current Account", "Dining/goingOut Fund")
- Description may be quoted with commas inside (PapaParse handles this)

### Transaction Categorization Strategy
1. **Keyword rules** (~70% of transactions) — UK merchant patterns: TESCO/SAINSBURY/ASDA→Groceries, TFL/UBER→Transport, NETFLIX/SPOTIFY→Subscriptions, DELIVEROO/JUST EAT→Dining Out, SHELL/BP→Fuel, etc.
2. **User corrections** (~15%) — Store manual overrides in category_rules table, apply on future imports
3. **OpenAI fallback** (~10%) — Batch uncategorized descriptions to gpt-4o-mini for classification
4. **Manual review** (~5%) — Present truly ambiguous ones to user

### UK Category Taxonomy
Housing, Groceries, Dining Out, Transport, Subscriptions, Shopping, Entertainment, Health & Fitness, Utilities (Gas/Electric/Water/Council Tax), Insurance, Personal Care, Education, Gifts & Donations, Travel & Holidays, Cash Withdrawals, Transfers, Income, Other

### Key Features (Priority Order)
1. **CSV Upload** — Drag-drop NatWest CSVs, preview, deduplicate, import
2. **Auto-Categorization** — Rule-based + OpenAI fallback for unknown merchants
3. **Dashboard Home** — KPI cards (income, spending, net savings), category donut chart, income vs expenses bar chart
4. **Spending Trends** — Area/line charts of category spend over months with period comparison
5. **Price Tracker** — Detect when recurring expenses increase (subscriptions, bills, groceries)
6. **Anomaly Detection** — Flag unusual transactions or spending spikes
7. **AI Insights** — Conversational monthly reports with specific £ amounts and % changes
8. **Savings Opportunities** — Subscription audit, duplicate detection, annual cost projections
9. **Spending Heatmap** — Calendar view showing spending intensity by day (Nivo calendar)
10. **Money Flow** — Sankey diagram: income → category breakdown (Nivo sankey)

### Design Principles
- Dark mode first, clean modern UI
- Mobile responsive (they'll check on phones too)
- Charts should be interactive (hover tooltips, click to drill down)
- AI insights should feel conversational, not robotic
- Show actual £ amounts and % changes — be specific, not vague

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

## Development Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
```

## Conventions
- Use server components by default, `'use client'` only when needed
- API routes handle all OpenAI/Supabase service-role calls (never expose keys client-side)
- Amounts stored as integers (pence) to avoid floating point issues
- Dates stored as ISO 8601 strings
- All monetary display formatted with Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
