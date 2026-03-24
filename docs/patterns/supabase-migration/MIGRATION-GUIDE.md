# localStorage → Supabase Migration Guide

This guide maps every localStorage key in the Savings Dashboard to a Supabase table.
The migration should be gradual — keep localStorage as a fallback during transition.

## Migration Strategy

1. Create Supabase tables (SQL below)
2. Add Supabase client helpers (see `../supabase-auth/`)
3. Create API routes that read/write Supabase instead of localStorage
4. Update hooks to call API routes
5. Write a one-time migration script to upload existing localStorage data
6. Keep localStorage as offline cache (read from Supabase, write to both)

## Table Mappings

### `savings_transactions` → `transactions` table

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  type TEXT,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL, -- pence, negative = money out
  balance INTEGER,
  category TEXT,
  subcategory TEXT,
  merchant_name TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  is_essential BOOLEAN,
  account_name TEXT,
  source TEXT CHECK (source IN ('natwest', 'amex', 'universal')),
  category_source TEXT CHECK (category_source IN ('rule', 'ai', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id, user_id)
);

CREATE INDEX idx_transactions_user_date ON transactions (user_id, date DESC);
CREATE INDEX idx_transactions_user_category ON transactions (user_id, category);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### `savings_custom_rules` → `category_rules` table

```sql
CREATE TABLE category_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  is_essential BOOLEAN,
  source TEXT DEFAULT 'manual',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, pattern)
);

ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own rules"
  ON category_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### `savings_targets` → `savings_targets` table

```sql
CREATE TABLE savings_targets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  month TEXT NOT NULL, -- YYYY-MM format
  target_amount INTEGER NOT NULL, -- pence
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, month)
);

ALTER TABLE savings_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own targets"
  ON savings_targets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### `savings_knowledge_bank` → `knowledge_entries` table

```sql
CREATE TABLE knowledge_entries (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[], -- array of tag strings
  type TEXT CHECK (type IN ('event', 'context', 'goal', 'note')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own entries"
  ON knowledge_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### `savings_monthly_analyses` → `monthly_analyses` table

```sql
CREATE TABLE monthly_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  period TEXT NOT NULL, -- cycle identifier
  analysis JSONB NOT NULL, -- full GPT analysis result
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period)
);

ALTER TABLE monthly_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own analyses"
  ON monthly_analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### User preferences (consolidated) → `user_settings` table

Combines: `savings_custom_colors`, `savings_account_nicknames`, `savings_account_types`, `savings_dismissed_recommendations`, `savings_insights_cache`

```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  custom_colors JSONB DEFAULT '{}'::JSONB, -- category → hex color
  account_nicknames JSONB DEFAULT '{}'::JSONB, -- account name → nickname
  account_types JSONB DEFAULT '[]'::JSONB, -- AccountConfig[]
  dismissed_recommendations TEXT[] DEFAULT '{}', -- recommendation IDs
  insights_cache JSONB DEFAULT '{}'::JSONB, -- cached AI results
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

## One-Time Migration Script

After creating the tables and setting up auth, run this script to upload existing localStorage data:

```typescript
// scripts/migrate-to-supabase.ts
// Usage: npx tsx scripts/migrate-to-supabase.ts
//
// This script reads from localStorage (via Playwright) and uploads to Supabase.
// Run it once after creating the Supabase project and tables.
//
// Steps:
// 1. Open the app in Playwright
// 2. Read all localStorage keys
// 3. Parse and upload to Supabase using service_role key
// 4. Verify counts match

// Implementation left to Claude Code — it will read the storage.ts keys
// and generate the appropriate upload logic.
```

## Key Invariants

- Amounts are ALWAYS integers (pence) — the database columns use INTEGER, not DECIMAL
- Negative = money out, positive = money in — this convention is preserved
- RLS ensures each user only sees their own data
- The `id` field on transactions comes from the client (includes account number for dedup)
