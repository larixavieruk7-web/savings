-- Migration: Add advisor system tables
-- Applied: 2026-03-25

-- Advisor briefings (upload/weekly/monthly push content)
CREATE TABLE IF NOT EXISTS advisor_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('upload', 'weekly', 'monthly')) NOT NULL,
  cycle_id TEXT NOT NULL,
  briefing JSONB NOT NULL,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advisor_briefings_user_cycle
  ON advisor_briefings(user_id, cycle_id, type);

ALTER TABLE advisor_briefings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see own briefings"
    ON advisor_briefings FOR ALL
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Per-category spending targets
CREATE TABLE IF NOT EXISTS spending_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cycle_id TEXT NOT NULL,
  category TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  ai_suggested BOOLEAN DEFAULT false,
  previous_actual INTEGER,
  rolling_average INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, cycle_id, category)
);

ALTER TABLE spending_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own targets"
    ON spending_targets FOR ALL
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Advisor commitments (things user/advisor agreed to do)
CREATE TABLE IF NOT EXISTS advisor_commitments (
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
  due_cycle_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE advisor_commitments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own commitments"
    ON advisor_commitments FOR ALL
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
