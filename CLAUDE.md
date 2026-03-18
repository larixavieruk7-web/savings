# Savings Dashboard

## Project Overview
A cutting-edge personal finance dashboard for a UK household (Larissa & Gus). Ingests bank statement CSVs from NatWest and Amex, auto-categorizes transactions using rules + GPT-4o, and surfaces actionable insights — where money is going, what's getting more expensive, anomalies, and where to save. Goal: aggressively find savings, not just pretty charts.

## Household
- **Larissa** (MRS LARISSA DA SILVA) — Amex card ending -21013, NatWest accounts
- **Gus** (G XAVIER DA SILVA) — Amex card ending -21005, NatWest Current Account
- Banks: NatWest (current accounts, savings, credit cards) + Amex (2 credit cards)

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, `src/` directory)
- **Styling**: Tailwind CSS (dark mode first)
- **Storage**: localStorage (no database — personal use, single machine)
- **Visualization**: Recharts (bar, area, line, pie/donut charts)
- **AI**: OpenAI GPT-4o via server-side API routes (categorization, insights, chat)
- **AI Libraries**: Battle-tested from Haisem's Distil SaaS (categoriser, insights engine, merchant extractor, retry utility)
- **Deployment**: Vercel (free tier)
- **CSV Parsing**: PapaParse
- **Date Handling**: date-fns with UK locale
- **Icons**: lucide-react

## Architecture

### Directory Structure
```
src/
├── app/
│   ├── page.tsx              # Dashboard home — KPIs, charts, 50/30/20 budget, savings target
│   ├── upload/page.tsx       # CSV upload (auto-detects NatWest vs Amex)
│   ├── accounts/page.tsx     # Account overview, nicknames, cross-account duplicates
│   ├── transactions/page.tsx # Transaction explorer — search, filter, sort, bulk categorize
│   ├── categories/page.tsx   # Category rules management (system + custom)
│   ├── trends/page.tsx       # Cash flow, net savings, category trend lines
│   ├── insights/page.tsx     # AI anomaly detection + savings suggestions + target tracker
│   ├── knowledge/page.tsx    # Life events journal (context for AI)
│   ├── ask/page.tsx          # AI chatbot — ask about your finances
│   ├── api/
│   │   ├── categorize/       # GPT batch categorization (150/batch, parallel)
│   │   ├── insights/         # Anomaly detection + AI savings suggestions
│   │   ├── chat/             # Conversational AI with spending + knowledge context
│   │   └── parse-csv/        # Universal CSV parser (GPT column detection fallback)
│   ├── layout.tsx            # Root layout with sidebar + TransactionProvider
│   └── globals.css           # Dark mode theme variables
├── components/
│   ├── dashboard/
│   │   ├── sidebar.tsx       # Navigation sidebar
│   │   └── period-selector.tsx # Global date range filter (30d/3m/6m/12m/all)
│   └── CategoryEditor.tsx    # Inline category correction with create-new + search
├── context/
│   └── transactions.tsx      # React context providing filtered transaction data
├── hooks/
│   └── useTransactions.ts    # Core hook — period filtering, computed breakdowns
├── lib/
│   ├── ai/
│   │   ├── categoriser.ts    # GPT-4o batch categorization (essential/discretionary)
│   │   ├── csv-parser.ts     # Universal CSV parser with GPT column detection
│   │   ├── insights-engine.ts # Anomaly detection + AI savings advisor
│   │   ├── merchant-extractor.ts # UK bank description → merchant name
│   │   └── retry.ts          # Exponential backoff for OpenAI (handles 429s)
│   ├── csv/
│   │   ├── natwest.ts        # NatWest CSV parser (dd MMMM yyyy format)
│   │   └── amex.ts           # Amex CSV parser (flipped sign convention, pre-categories)
│   ├── categories.ts         # 100+ keyword rules + category colors
│   ├── storage.ts            # localStorage CRUD (transactions, rules, targets, knowledge)
│   └── utils.ts              # GBP formatting, tooltip formatter, percentage helpers
└── types/
    └── index.ts              # Transaction, CategoryRule, KnowledgeEntry, SavingsTarget, etc.
```

### Data Storage (localStorage)
```
savings_transactions      — Transaction[] (all imported transactions, deduplicated)
savings_custom_rules      — CategoryRule[] (user corrections, applied to future imports)
savings_targets           — SavingsTarget[] (monthly savings goals)
savings_insights_cache    — cached AI insights results
savings_custom_colors     — Record<string, string> (user-created category colors)
savings_account_nicknames — Record<string, string> (raw account name → friendly name)
savings_knowledge_bank    — KnowledgeEntry[] (life events, context, goals)
```

### NatWest CSV Format
Columns: `Date, Type, Description, Value, Balance, Account Name, Account Number`
- Date format: `dd MMMM yyyy` (e.g., "29 May 2025")
- Value: signed decimal (negative = outflow)
- Multi-account: single CSV contains rows from multiple accounts
- Transaction types: DPC (transfers), INT (interest), D/D (direct debit), BAC (salary), CHG (charges), FEES, POS, PURCHASE, PAYMENT, TFR, C/L (cash)

### Amex CSV Format
Columns: `Date, Description, Card Member, Account #, Amount, Extended Details, Appears On Your Statement As, Address, Town/City, Postcode, Country, Reference, Category`
- Date format: `DD/MM/YYYY`
- Amount: POSITIVE = charge (opposite to our convention — parser flips sign)
- Card Member identifies Larissa vs Gus
- Amex pre-categorizes (Entertainment-Restaurants, General Purchases-Groceries, etc.) — mapped to our taxonomy
- Multi-line descriptions in quoted fields (PapaParse handles this)

### Transaction Categorization Strategy
1. **Custom/user rules** (highest priority) — manual corrections stored in localStorage, applied to all matching transactions
2. **Keyword rules** (~70%) — 100+ UK merchant patterns (TESCO→Groceries, NETFLIX→Subscriptions, etc.) + NatWest type-based rules (DPC→Transfers, CHG→Bank Charges, INT→Income)
3. **Amex category mapping** — 30+ Amex categories mapped to our taxonomy
4. **GPT-4o batch categorization** (~10%) — 150 transactions per API call, parallel batches, returns category + essential/discretionary tag
5. **Manual correction** — Click category badge in transactions table, dropdown with search + create-new-category option

### Category Taxonomy
**Essential:** Rent / Mortgage, Utilities, Groceries, Insurance, Transport, Phone & Internet, Childcare & Education, Healthcare, Debt Repayments
**Discretionary:** Dining Out, Entertainment, Shopping, Subscriptions, Personal Care, Holidays & Travel, Drinks & Nights Out
**Financial:** Savings & Investments, Transfers, Cash Withdrawals, Bank Charges, Charity
**Income:** Salary, Benefits, Refunds, Other Income

### Key Features (Built)
1. **CSV Upload** — Drag-drop, auto-detects NatWest vs Amex, auto-saves, deduplicates, shows bank badge
2. **AI Categorization** — Auto-triggers on upload for uncategorized items, "Categorize with AI" button for existing data
3. **Dashboard** — KPI cards, income vs spending bar chart, category donut, top spending bars, essential vs discretionary split, 50/30/20 budget rule, savings target progress
4. **Spending Trends** — Cash flow area chart, net savings bars, category trend lines with toggleable chips, month-over-month changes
5. **Transactions** — Search/filter/sort, bulk select + categorize, inline category editing with notes, AI re-categorize button
6. **Categories** — Manage system rules (100+) and custom rules, add/delete, search, match counts
7. **Accounts** — Per-account overview, editable nicknames, cross-account duplicate detection
8. **AI Insights** — Anomaly detection (statistical), AI savings suggestions with £/month estimates, savings target tracker (£300/month default)
9. **Knowledge Bank** — Life events journal (trips, broken appliances, medication context), timeline with tags, feeds into AI chatbot
10. **Ask AI** — Chat with GPT-4o about your finances, pre-loaded with spending summary + knowledge bank, suggested questions
11. **Period Filter** — Global date range selector (Last 30 days default, 3m, 6m, 12m, All) on Dashboard, Transactions, Trends

### NatWest-Specific Rules (from real data)
- `XAVIER DA SILVA G` → Salary (Gus)
- `DPC To/From A/C` → Transfers
- `ROUND UP FROM` → Savings & Investments
- `INTER BON` → Income (interest)
- `NON-STERLING TRANSACTION` → Bank Charges
- `NATWEST LOAN` → Debt Repayments
- `OCTOPUS ENERGY`, `BRISTOLWESSEXWATER`, `BCP COUNCIL` → Utilities
- `MYREWARDS` → Income
- `FASTER PAYMENT RECEIVED` → Income

### Design Principles
- Dark mode first, clean modern UI
- Mobile responsive
- Charts interactive (hover tooltips)
- AI insights conversational, not robotic — specific £ amounts and % changes
- Aggressive savings focus — every feature should answer "how does this help save money?"
- Auto-save everything — no manual save buttons, no data loss on navigation
- Corrections remembered forever — one fix applies to all matching transactions

## Environment Variables
```
OPENAI_API_KEY=           # Shared with Haisem's Distil project — don't burn through it
```
Note: No Supabase needed — localStorage only. API key in `.env.local` (gitignored).

## Development Commands
```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
```

## Conventions
- `'use client'` on all pages (localStorage-dependent)
- API routes handle all OpenAI calls (never expose key client-side)
- Amounts stored as integers (pence) to avoid floating point issues
- Dates stored as ISO 8601 strings
- All monetary display: `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })`
- Negative amounts = money out, positive = money in (consistent everywhere)
- Transaction IDs include account number for multi-account dedup
- AI sends spending SUMMARIES not raw transactions (cost control)

## Cost Management
- GPT-4o categorization: ~$0.01-0.03 per batch of 150 transactions
- Insights generation: ~$0.01-0.02 per run (sends summary only)
- Chat: ~$0.01-0.03 per message (summary context)
- Total for full import + insights: typically under $0.20
