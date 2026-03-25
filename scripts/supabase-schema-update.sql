-- scripts/supabase-schema-update.sql
-- Run: cat scripts/supabase-schema-update.sql | npx supabase db query --linked

-- 1. Add missing columns to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_description TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_note TEXT;

-- 2. Add migration tracking to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS migration_completed_at TIMESTAMPTZ;

-- 3. Drop redundant composite unique constraint (PK on id already enforces uniqueness)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_id_user_id_key;

-- 4. Add updated_at trigger for user_settings
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_settings_modtime ON user_settings;
CREATE TRIGGER update_user_settings_modtime
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 5. Drop old single-policy RLS and replace with household read / user write
-- TRANSACTIONS
DROP POLICY IF EXISTS "Users see own transactions" ON transactions;
CREATE POLICY "Household reads transactions" ON transactions FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own transactions" ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transactions" ON transactions FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own transactions" ON transactions FOR DELETE
  USING (auth.uid() = user_id);

-- CATEGORY_RULES
DROP POLICY IF EXISTS "Users see own rules" ON category_rules;
CREATE POLICY "Household reads rules" ON category_rules FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own rules" ON category_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rules" ON category_rules FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own rules" ON category_rules FOR DELETE
  USING (auth.uid() = user_id);

-- SAVINGS_TARGETS
DROP POLICY IF EXISTS "Users see own targets" ON savings_targets;
CREATE POLICY "Household reads targets" ON savings_targets FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own targets" ON savings_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own targets" ON savings_targets FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own targets" ON savings_targets FOR DELETE
  USING (auth.uid() = user_id);

-- KNOWLEDGE_ENTRIES
DROP POLICY IF EXISTS "Users see own entries" ON knowledge_entries;
CREATE POLICY "Household reads entries" ON knowledge_entries FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own entries" ON knowledge_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own entries" ON knowledge_entries FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own entries" ON knowledge_entries FOR DELETE
  USING (auth.uid() = user_id);

-- MONTHLY_ANALYSES
DROP POLICY IF EXISTS "Users see own analyses" ON monthly_analyses;
CREATE POLICY "Household reads analyses" ON monthly_analyses FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own analyses" ON monthly_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own analyses" ON monthly_analyses FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own analyses" ON monthly_analyses FOR DELETE
  USING (auth.uid() = user_id);

-- USER_SETTINGS
DROP POLICY IF EXISTS "Users see own settings" ON user_settings;
CREATE POLICY "Household reads settings" ON user_settings FOR SELECT
  USING (user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('lari_uk@gmail.com', 'larixavieruk7@gmail.com', 'gusampteam@hotmail.com')
  ));
CREATE POLICY "Users insert own settings" ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON user_settings FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own settings" ON user_settings FOR DELETE
  USING (auth.uid() = user_id);
