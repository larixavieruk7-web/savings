-- ============================================================
-- Savings Dashboard — Supabase Migration
-- Run this in the Supabase SQL Editor (SQL tab in dashboard)
-- Project: ekqpsozlqjmjlwzzpyxp
-- ============================================================

-- 1. Transactions
CREATE TABLE IF NOT EXISTS transactions (
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

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON transactions (user_id, category);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Category Rules
CREATE TABLE IF NOT EXISTS category_rules (
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

-- 3. Savings Targets
CREATE TABLE IF NOT EXISTS savings_targets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  month TEXT NOT NULL,
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

-- 4. Knowledge Entries
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  type TEXT CHECK (type IN ('event', 'context', 'goal', 'note')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own entries"
  ON knowledge_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Monthly Analyses (GPT results cache)
CREATE TABLE IF NOT EXISTS monthly_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  period TEXT NOT NULL,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period)
);

ALTER TABLE monthly_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own analyses"
  ON monthly_analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. User Settings (consolidated preferences)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  custom_colors JSONB DEFAULT '{}'::JSONB,
  account_nicknames JSONB DEFAULT '{}'::JSONB,
  account_types JSONB DEFAULT '[]'::JSONB,
  dismissed_recommendations TEXT[] DEFAULT '{}',
  insights_cache JSONB DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Done! All tables created with RLS.
-- Next: disable sign-ups in Auth Settings, then test login.
-- ============================================================
