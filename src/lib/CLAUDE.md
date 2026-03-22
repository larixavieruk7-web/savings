# src/lib — Storage & Categorization

## localStorage Keys (exact strings — do not rename without updating storage.ts)
```
savings_transactions       — Transaction[]
savings_custom_rules       — CategoryRule[]
savings_targets            — SavingsTarget[]
savings_insights_cache     — cached AI insights results
savings_custom_colors      — Record<string, string> (category name → hex color)
savings_account_nicknames  — Record<string, string> (raw account name → friendly name)
savings_knowledge_bank     — KnowledgeEntry[]
savings_account_types      — AccountConfig[] (hub/credit-card/savings hierarchy)
savings_dismissed_recommendations — string[] (dismissed recommendation IDs)
savings_monthly_analyses   — StoredAnalysis[] (AI monthly analysis results, persisted per cycle)
```
All reads/writes go through `storage.ts` — never access localStorage directly in pages.

## Categorization Pipeline (priority order — never skip steps)
1. **Custom/user rules** — corrections from localStorage, matched by description substring
2. **Keyword rules** — 100+ patterns in `categories.ts` (TESCO→Groceries, NETFLIX→Subscriptions, etc.) + NatWest type-based rules (DPC→Transfers, CHG→Bank Charges, INT→Income)
3. **Amex category mapping** — 30+ Amex pre-categories mapped to our taxonomy
4. **GPT-4o batch** — 150 transactions per API call, parallel batches via `src/app/api/categorize/`
5. **Manual correction** — user clicks category badge in transactions table

## AI Utilities (src/lib/ai/)
- `categoriser.ts` — GPT batch categorization, returns category + essential/discretionary
- `insights-engine.ts` — anomaly detection + savings suggestions (sends summaries only)
- `merchant-extractor.ts` — UK bank description → clean merchant name
- `retry.ts` — exponential backoff for OpenAI 429s; always use this, never raw fetch loops

## Gotchas
- Amounts are integers (pence) — `storage.ts` converts on read/write
- `categories.ts` is the single source of truth for category names and colors — if you add a category, add it here first
- Custom rules persist forever by design — one correction fixes all matching past/future transactions
