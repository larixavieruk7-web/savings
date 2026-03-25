// Supabase CRUD layer — all 6 tables.
// All functions return null/false on error and log to console.error.
// Amounts are always integers (pence). Negative = money out, positive = money in.

import { createClient as createBrowserClient } from './client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction, CategoryRule, SavingsTarget, KnowledgeEntry, AccountConfig, AdvisorBriefing, SpendingTarget, AdvisorCommitment } from '@/types'
import type { StoredAnalysis } from '@/lib/storage-local'
import type { Database } from './database.types'

export type { StoredAnalysis }

// ─── UserSettings ────────────────────────────────────────────────

export interface UserSettings {
  customColors: Record<string, string>
  accountNicknames: Record<string, string>
  accountTypes: AccountConfig[]
  dismissedRecommendations: string[]
  essentialMerchants: string[]
  insightsCache: Record<string, unknown> | null
  migrationCompletedAt: string | null
}

const DEFAULT_SETTINGS: UserSettings = {
  customColors: {},
  accountNicknames: {},
  accountTypes: [],
  dismissedRecommendations: [],
  essentialMerchants: [],
  insightsCache: null,
  migrationCompletedAt: null,
}

// ─── Singleton client ────────────────────────────────────────────

let _client: SupabaseClient<Database> | null = null

function getClient(): SupabaseClient<Database> {
  if (!_client) {
    _client = createBrowserClient() as SupabaseClient<Database>
  }
  return _client
}

// ─── Auth helper ─────────────────────────────────────────────────

export async function getUserId(): Promise<string | null> {
  try {
    const supabase = getClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user.id
  } catch (err) {
    console.error('[storage] getUserId error:', err)
    return null
  }
}

export async function getUserEmail(): Promise<string | null> {
  try {
    const supabase = getClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user.email ?? null
  } catch (err) {
    return null
  }
}

export async function signOut(): Promise<void> {
  const supabase = getClient()
  await supabase.auth.signOut()
}

// ─── Row ↔ App type mappers ───────────────────────────────────────

type TxRow = Database['public']['Tables']['transactions']['Row']
type TxInsert = Database['public']['Tables']['transactions']['Insert']

function rowToTransaction(row: TxRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    type: row.type ?? '',
    description: row.description,
    rawDescription: row.raw_description ?? row.description,
    amount: row.amount,
    balance: row.balance ?? 0,
    category: row.category ?? '',
    subcategory: row.subcategory ?? undefined,
    merchantName: row.merchant_name ?? undefined,
    isRecurring: row.is_recurring ?? false,
    isEssential: row.is_essential ?? undefined,
    accountName: row.account_name ?? undefined,
    source: (row.source as Transaction['source']) ?? undefined,
    categorySource: (row.category_source as Transaction['categorySource']) ?? undefined,
    userNote: row.user_note ?? undefined,
  }
}

function transactionToRow(t: Transaction, userId: string): TxInsert {
  return {
    id: t.id,
    user_id: userId,
    date: t.date,
    type: t.type,
    description: t.description,
    raw_description: t.rawDescription,
    amount: t.amount,
    balance: t.balance,
    category: t.category,
    subcategory: t.subcategory ?? null,
    merchant_name: t.merchantName ?? null,
    is_recurring: t.isRecurring,
    is_essential: t.isEssential ?? null,
    account_name: t.accountName ?? null,
    source: t.source ?? null,
    category_source: t.categorySource ?? null,
    user_note: t.userNote ?? null,
  }
}

// ─── Chunk helper ─────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ═══════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════

export async function fetchTransactions(): Promise<Transaction[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null

    // Supabase default limit is 1000 rows — fetch all in pages
    const PAGE_SIZE = 1000
    const allRows: TxRow[] = []
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        console.error('[storage] fetchTransactions error:', error.message, error.code, error.details)
        return null
      }
      allRows.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    return allRows.map(rowToTransaction)
  } catch (err) {
    console.error('[storage] fetchTransactions error:', err)
    return null
  }
}

/**
 * Insert new transactions from CSV uploads.
 * Uses ignoreDuplicates so existing manual corrections are preserved.
 */
export async function insertNewTransactions(txns: Transaction[]): Promise<boolean> {
  if (txns.length === 0) return true
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const rows = txns.map(t => transactionToRow(t, userId))
    for (const batch of chunk(rows, 500)) {
      const { error } = await supabase
        .from('transactions')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
      if (error) {
        console.error('[storage] insertNewTransactions batch error:', error)
        return false
      }
    }
    return true
  } catch (err) {
    console.error('[storage] insertNewTransactions error:', err)
    return false
  }
}

/**
 * Full upsert for saveTransactions after in-app modifications.
 * Overwrites existing rows on conflict.
 */
export async function upsertTransactions(txns: Transaction[]): Promise<boolean> {
  if (txns.length === 0) return true
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const rows = txns.map(t => transactionToRow(t, userId))
    for (const batch of chunk(rows, 500)) {
      const { error } = await supabase
        .from('transactions')
        .upsert(batch, { onConflict: 'id' })
      if (error) {
        console.error('[storage] upsertTransactions batch error:', error)
        return false
      }
    }
    return true
  } catch (err) {
    console.error('[storage] upsertTransactions error:', err)
    return false
  }
}

/**
 * Partial updates — groups rows by identical field set and batches via .in('id', ids).
 * Used by recategorizeAll which may update hundreds of rows.
 */
export async function updateTransactions(
  updates: Array<Partial<Transaction> & { id: string }>
): Promise<boolean> {
  if (updates.length === 0) return true
  try {
    const supabase = getClient()

    // Map each update to its DB columns (exclude id from the update payload)
    type DbUpdate = Database['public']['Tables']['transactions']['Update']

    function toDbUpdate(partial: Partial<Transaction>): DbUpdate {
      const u: DbUpdate = {}
      if (partial.date !== undefined) u.date = partial.date
      if (partial.type !== undefined) u.type = partial.type
      if (partial.description !== undefined) u.description = partial.description
      if (partial.rawDescription !== undefined) u.raw_description = partial.rawDescription
      if (partial.amount !== undefined) u.amount = partial.amount
      if (partial.balance !== undefined) u.balance = partial.balance
      if (partial.category !== undefined) u.category = partial.category
      if (partial.subcategory !== undefined) u.subcategory = partial.subcategory
      if (partial.merchantName !== undefined) u.merchant_name = partial.merchantName
      if (partial.isRecurring !== undefined) u.is_recurring = partial.isRecurring
      if (partial.isEssential !== undefined) u.is_essential = partial.isEssential
      if (partial.accountName !== undefined) u.account_name = partial.accountName
      if (partial.source !== undefined) u.source = partial.source
      if (partial.categorySource !== undefined) u.category_source = partial.categorySource
      if (partial.userNote !== undefined) u.user_note = partial.userNote
      return u
    }

    // Group updates that share the identical field+value payload
    const groups = new Map<string, { ids: string[]; dbUpdate: DbUpdate }>()
    for (const update of updates) {
      const { id, ...fields } = update
      const dbUpdate = toDbUpdate(fields)
      const key = JSON.stringify(dbUpdate)
      if (!groups.has(key)) {
        groups.set(key, { ids: [], dbUpdate })
      }
      groups.get(key)!.ids.push(id)
    }

    for (const { ids, dbUpdate } of groups.values()) {
      for (const idBatch of chunk(ids, 500)) {
        const { error } = await supabase
          .from('transactions')
          .update(dbUpdate)
          .in('id', idBatch)
        if (error) {
          console.error('[storage] updateTransactions batch error:', error)
          return false
        }
      }
    }
    return true
  } catch (err) {
    console.error('[storage] updateTransactions error:', err)
    return false
  }
}

export async function deleteAllTransactions(): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
    if (error) {
      console.error('[storage] deleteAllTransactions error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] deleteAllTransactions error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY RULES  (unique on user_id, pattern)
// ═══════════════════════════════════════════════════════════════════

type RuleRow = Database['public']['Tables']['category_rules']['Row']

function rowToCategoryRule(row: RuleRow): CategoryRule {
  return {
    pattern: row.pattern,
    category: row.category,
    subcategory: row.subcategory ?? undefined,
    isEssential: row.is_essential ?? undefined,
    source: (row.source as CategoryRule['source']) ?? 'system',
    note: row.note ?? undefined,
  }
}

export async function fetchCategoryRules(): Promise<CategoryRule[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null
    const { data, error } = await supabase
      .from('category_rules')
      .select('*')
      .order('pattern', { ascending: true })
    if (error) {
      console.error('[storage] fetchCategoryRules error:', error.message, error.code)
      return null
    }
    return (data ?? []).map(rowToCategoryRule)
  } catch (err) {
    console.error('[storage] fetchCategoryRules error:', err)
    return null
  }
}

export async function upsertCategoryRules(rules: CategoryRule[]): Promise<boolean> {
  if (rules.length === 0) return true
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const rows = rules.map(r => ({
      user_id: userId,
      pattern: r.pattern,
      category: r.category,
      subcategory: r.subcategory ?? null,
      is_essential: r.isEssential ?? null,
      source: r.source,
      note: r.note ?? null,
    }))

    const { error } = await supabase
      .from('category_rules')
      .upsert(rows, { onConflict: 'user_id,pattern' })
    if (error) {
      console.error('[storage] upsertCategoryRules error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] upsertCategoryRules error:', err)
    return false
  }
}

export async function deleteCategoryRule(pattern: string): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('category_rules')
      .delete()
      .eq('user_id', userId)
      .eq('pattern', pattern)
    if (error) {
      console.error('[storage] deleteCategoryRule error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] deleteCategoryRule error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// SAVINGS TARGETS  (unique on user_id, month)
// ═══════════════════════════════════════════════════════════════════

type TargetRow = Database['public']['Tables']['savings_targets']['Row']

function rowToSavingsTarget(row: TargetRow): SavingsTarget {
  return {
    id: row.id,
    month: row.month,
    targetAmount: row.target_amount,
    description: row.description ?? undefined,
  }
}

export async function fetchSavingsTargets(): Promise<SavingsTarget[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null
    const { data, error } = await supabase
      .from('savings_targets')
      .select('*')
      .order('month', { ascending: true })
    if (error) {
      console.error('[storage] fetchSavingsTargets error:', error.message, error.code)
      return null
    }
    return (data ?? []).map(rowToSavingsTarget)
  } catch (err) {
    console.error('[storage] fetchSavingsTargets error:', err)
    return null
  }
}

export async function upsertSavingsTargets(targets: SavingsTarget[]): Promise<boolean> {
  if (targets.length === 0) return true
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const rows = targets.map(t => ({
      id: t.id,
      user_id: userId,
      month: t.month,
      target_amount: t.targetAmount,
      description: t.description ?? null,
    }))

    const { error } = await supabase
      .from('savings_targets')
      .upsert(rows, { onConflict: 'user_id,month' })
    if (error) {
      console.error('[storage] upsertSavingsTargets error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] upsertSavingsTargets error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// KNOWLEDGE ENTRIES
// ═══════════════════════════════════════════════════════════════════

type KnowledgeRow = Database['public']['Tables']['knowledge_entries']['Row']

function rowToKnowledgeEntry(row: KnowledgeRow): KnowledgeEntry {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    description: row.description ?? '',
    tags: row.tags ?? undefined,
    type: (row.type as KnowledgeEntry['type']) ?? 'note',
    createdAt: row.created_at ?? row.date,
  }
}

export async function fetchKnowledgeEntries(): Promise<KnowledgeEntry[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null
    const { data, error } = await supabase
      .from('knowledge_entries')
      .select('*')
      .order('date', { ascending: false })
    if (error) {
      console.error('[storage] fetchKnowledgeEntries error:', error.message, error.code)
      return null
    }
    return (data ?? []).map(rowToKnowledgeEntry)
  } catch (err) {
    console.error('[storage] fetchKnowledgeEntries error:', err)
    return null
  }
}

export async function insertKnowledgeEntry(entry: KnowledgeEntry): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase.from('knowledge_entries').insert({
      id: entry.id,
      user_id: userId,
      date: entry.date,
      title: entry.title,
      description: entry.description,
      tags: entry.tags ?? null,
      type: entry.type,
      created_at: entry.createdAt,
    })
    if (error) {
      console.error('[storage] insertKnowledgeEntry error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] insertKnowledgeEntry error:', err)
    return false
  }
}

export async function upsertKnowledgeEntries(entries: KnowledgeEntry[]): Promise<boolean> {
  if (entries.length === 0) return true
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const rows = entries.map(e => ({
      id: e.id,
      user_id: userId,
      date: e.date,
      title: e.title,
      description: e.description,
      tags: e.tags ?? null,
      type: e.type,
      created_at: e.createdAt,
    }))

    const { error } = await supabase
      .from('knowledge_entries')
      .upsert(rows, { onConflict: 'id' })
    if (error) {
      console.error('[storage] upsertKnowledgeEntries error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] upsertKnowledgeEntries error:', err)
    return false
  }
}

export async function deleteKnowledgeEntry(id: string): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('knowledge_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) {
      console.error('[storage] deleteKnowledgeEntry error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] deleteKnowledgeEntry error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// MONTHLY ANALYSES  (unique on user_id, period)
// ═══════════════════════════════════════════════════════════════════

type AnalysisRow = Database['public']['Tables']['monthly_analyses']['Row']

function rowToStoredAnalysis(row: AnalysisRow): StoredAnalysis {
  return {
    cycleId: row.period,
    analysedAt: row.created_at ?? new Date().toISOString(),
    analysis: row.analysis as Record<string, unknown>,
  }
}

export async function fetchMonthlyAnalyses(): Promise<StoredAnalysis[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null
    const { data, error } = await supabase
      .from('monthly_analyses')
      .select('*')
      .order('period', { ascending: false })
    if (error) {
      console.error('[storage] fetchMonthlyAnalyses error:', error.message, error.code)
      return null
    }
    return (data ?? []).map(rowToStoredAnalysis)
  } catch (err) {
    console.error('[storage] fetchMonthlyAnalyses error:', err)
    return null
  }
}

export async function fetchAnalysisForCycle(cycleId: string): Promise<StoredAnalysis | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null
    const { data, error } = await supabase
      .from('monthly_analyses')
      .select('*')
      .eq('period', cycleId)
      .maybeSingle()
    if (error) {
      console.error('[storage] fetchAnalysisForCycle error:', error.message, error.code)
      return null
    }
    if (!data) return null
    return rowToStoredAnalysis(data)
  } catch (err) {
    console.error('[storage] fetchAnalysisForCycle error:', err)
    return null
  }
}

export async function upsertMonthlyAnalysis(
  cycleId: string,
  analysis: Record<string, unknown>
): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('monthly_analyses')
      .upsert(
        {
          user_id: userId,
          period: cycleId,
          analysis: analysis as Database['public']['Tables']['monthly_analyses']['Insert']['analysis'],
        },
        { onConflict: 'user_id,period' }
      )
    if (error) {
      console.error('[storage] upsertMonthlyAnalysis error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] upsertMonthlyAnalysis error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// USER SETTINGS  (PK on user_id)
// ═══════════════════════════════════════════════════════════════════

type SettingsRow = Database['public']['Tables']['user_settings']['Row']

function rowToUserSettings(row: SettingsRow): UserSettings {
  return {
    customColors: (row.custom_colors as Record<string, string>) ?? {},
    accountNicknames: (row.account_nicknames as Record<string, string>) ?? {},
    accountTypes: (row.account_types as unknown as AccountConfig[]) ?? [],
    dismissedRecommendations: row.dismissed_recommendations ?? [],
    essentialMerchants: row.essential_merchants ?? [],
    insightsCache: (row.insights_cache as Record<string, unknown>) ?? null,
    migrationCompletedAt: row.migration_completed_at,
  }
}

export async function fetchUserSettings(): Promise<UserSettings | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('[storage] fetchUserSettings error:', error.message, error.code)
      return null
    }
    // No row yet → return defaults
    if (!data) return { ...DEFAULT_SETTINGS }
    return rowToUserSettings(data)
  } catch (err) {
    console.error('[storage] fetchUserSettings error:', err)
    return null
  }
}

export async function updateUserSettings(
  fields: Partial<{
    custom_colors: Record<string, string>
    account_nicknames: Record<string, string>
    account_types: AccountConfig[]
    dismissed_recommendations: string[]
    essential_merchants: string[]
    insights_cache: Record<string, unknown> | null
    migration_completed_at: string | null
  }>
): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, ...fields } as Database['public']['Tables']['user_settings']['Insert'],
        { onConflict: 'user_id' }
      )
    if (error) {
      console.error('[storage] updateUserSettings error:', error.message, error.code, error.details)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] updateUserSettings error:', err)
    return false
  }
}

export async function isMigrationCompleted(): Promise<boolean> {
  try {
    const settings = await fetchUserSettings()
    if (!settings) return false
    return settings.migrationCompletedAt !== null
  } catch (err) {
    console.error('[storage] isMigrationCompleted error:', err)
    return false
  }
}

export async function markMigrationCompleted(): Promise<boolean> {
  return updateUserSettings({
    migration_completed_at: new Date().toISOString(),
  })
}

// ═══════════════════════════════════════════════════════════════════
// ADVISOR BRIEFINGS
// ═══════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAdvisorBriefing(row: any): AdvisorBriefing {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    cycleId: row.cycle_id,
    briefing: row.briefing as Record<string, unknown>,
    dismissed: row.dismissed ?? false,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

export async function fetchAdvisorBriefings(cycleId?: string): Promise<AdvisorBriefing[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null

    let query = supabase
      .from('advisor_briefings' as never)
      .select('*')
      .order('created_at', { ascending: false })
    if (cycleId) {
      query = query.eq('cycle_id', cycleId)
    }
    const { data, error } = await query
    if (error) {
      console.error('[storage] fetchAdvisorBriefings error:', error.message, error.code)
      return null
    }
    return ((data ?? []) as unknown[]).map(rowToAdvisorBriefing)
  } catch (err) {
    console.error('[storage] fetchAdvisorBriefings error:', err)
    return null
  }
}

export async function insertAdvisorBriefing(
  briefing: Omit<AdvisorBriefing, 'id' | 'createdAt'>
): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('advisor_briefings' as never)
      .insert({
        user_id: userId,
        type: briefing.type,
        cycle_id: briefing.cycleId,
        briefing: briefing.briefing,
        dismissed: briefing.dismissed,
      } as never)
    if (error) {
      console.error('[storage] insertAdvisorBriefing error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] insertAdvisorBriefing error:', err)
    return false
  }
}

export async function updateAdvisorBriefing(
  id: string,
  fields: Partial<Pick<AdvisorBriefing, 'dismissed'>>
): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const update: Record<string, unknown> = {}
    if (fields.dismissed !== undefined) update.dismissed = fields.dismissed

    const { error } = await supabase
      .from('advisor_briefings' as never)
      .update(update as never)
      .eq('id' as never, id as never)
    if (error) {
      console.error('[storage] updateAdvisorBriefing error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] updateAdvisorBriefing error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// SPENDING TARGETS (per-category)
// ═══════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSpendingTarget(row: any): SpendingTarget {
  return {
    id: row.id,
    userId: row.user_id,
    cycleId: row.cycle_id,
    category: row.category,
    targetAmount: row.target_amount,
    aiSuggested: row.ai_suggested ?? false,
    previousActual: row.previous_actual ?? 0,
    rollingAverage: row.rolling_average ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

export async function fetchSpendingTargets(cycleId: string): Promise<SpendingTarget[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null

    const { data, error } = await supabase
      .from('spending_targets' as never)
      .select('*')
      .eq('cycle_id', cycleId)
      .order('category', { ascending: true })
    if (error) {
      console.error('[storage] fetchSpendingTargets error:', error.message, error.code)
      return null
    }
    return ((data ?? []) as unknown[]).map(rowToSpendingTarget)
  } catch (err) {
    console.error('[storage] fetchSpendingTargets error:', err)
    return null
  }
}

export async function upsertSpendingTargets(targets: SpendingTarget[]): Promise<boolean> {
  if (targets.length === 0) return true
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const rows = targets.map(t => ({
      user_id: userId,
      cycle_id: t.cycleId,
      category: t.category,
      target_amount: t.targetAmount,
      ai_suggested: t.aiSuggested,
      previous_actual: t.previousActual,
      rolling_average: t.rollingAverage,
    }))

    const { error } = await supabase
      .from('spending_targets' as never)
      .upsert(rows as never, { onConflict: 'user_id,cycle_id,category' })
    if (error) {
      console.error('[storage] upsertSpendingTargets error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] upsertSpendingTargets error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════
// ADVISOR COMMITMENTS
// ═══════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAdvisorCommitment(row: any): AdvisorCommitment {
  return {
    id: row.id,
    userId: row.user_id,
    cycleId: row.cycle_id,
    commitment: row.commitment,
    type: row.type,
    status: row.status ?? 'active',
    source: row.source ?? 'ai_suggested',
    outcome: row.outcome ?? undefined,
    relatedCategory: row.related_category ?? undefined,
    relatedMerchant: row.related_merchant ?? undefined,
    dueCycleId: row.due_cycle_id ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

export async function fetchAdvisorCommitments(cycleId?: string): Promise<AdvisorCommitment[] | null> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return null

    let query = supabase
      .from('advisor_commitments' as never)
      .select('*')
      .order('created_at', { ascending: false })
    if (cycleId) {
      query = query.eq('cycle_id', cycleId)
    }
    const { data, error } = await query
    if (error) {
      console.error('[storage] fetchAdvisorCommitments error:', error.message, error.code)
      return null
    }
    return ((data ?? []) as unknown[]).map(rowToAdvisorCommitment)
  } catch (err) {
    console.error('[storage] fetchAdvisorCommitments error:', err)
    return null
  }
}

export async function insertAdvisorCommitment(
  commitment: Omit<AdvisorCommitment, 'id' | 'createdAt'>
): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const { error } = await supabase
      .from('advisor_commitments' as never)
      .insert({
        user_id: userId,
        cycle_id: commitment.cycleId,
        commitment: commitment.commitment,
        type: commitment.type,
        status: commitment.status,
        source: commitment.source,
        outcome: commitment.outcome ?? null,
        related_category: commitment.relatedCategory ?? null,
        related_merchant: commitment.relatedMerchant ?? null,
        due_cycle_id: commitment.dueCycleId ?? null,
      } as never)
    if (error) {
      console.error('[storage] insertAdvisorCommitment error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] insertAdvisorCommitment error:', err)
    return false
  }
}

export async function updateAdvisorCommitment(
  id: string,
  fields: Partial<Pick<AdvisorCommitment, 'status' | 'outcome'>>
): Promise<boolean> {
  try {
    const supabase = getClient()
    const userId = await getUserId()
    if (!userId) return false

    const update: Record<string, unknown> = {}
    if (fields.status !== undefined) update.status = fields.status
    if (fields.outcome !== undefined) update.outcome = fields.outcome

    const { error } = await supabase
      .from('advisor_commitments' as never)
      .update(update as never)
      .eq('id' as never, id as never)
    if (error) {
      console.error('[storage] updateAdvisorCommitment error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[storage] updateAdvisorCommitment error:', err)
    return false
  }
}
