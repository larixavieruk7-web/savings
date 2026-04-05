'use client';

// ═══════════════════════════════════════════════════════════════════════
// storage.ts — Supabase-first orchestrator with localStorage cache
//
// Every exported function name is preserved from the original localStorage-
// only module so consumers (hooks, pages) keep working.  All functions are
// now async (return Promises) except getDisplayName which stays synchronous.
//
// Read path:  Supabase → update cache → return.  On error → return cache.
// Write path: Supabase first → update cache only on success.
// ═══════════════════════════════════════════════════════════════════════

import type { Transaction, CategoryRule, SavingsTarget, KnowledgeEntry, AccountConfig, AdvisorBriefing, SpendingTarget, AdvisorCommitment } from '@/types';
import { categorize } from '@/lib/categories';

// ─── localStorage cache layer ──────────────────────────────────────────
import {
  getLocalTransactions,
  setLocalTransactions,
  clearLocalTransactions,
  getLocalCustomRules,
  setLocalCustomRules,
  getLocalSavingsTargets,
  setLocalSavingsTargets,
  getLocalKnowledgeEntries,
  setLocalKnowledgeEntries,
  getLocalMonthlyAnalyses,
  setLocalMonthlyAnalyses,
  getLocalCustomColors,
  setLocalCustomColors,
  getLocalAccountNicknames,
  setLocalAccountNicknames,
  getLocalAccountTypes,
  setLocalAccountTypes,
  getLocalDismissedRecommendations,
  setLocalDismissedRecommendations,
  getLocalEssentialMerchants,
  setLocalEssentialMerchants,
  getLocalInsightsCache,
  setLocalInsightsCache,
  getLocalAdvisorBriefings,
  setLocalAdvisorBriefings,
  getLocalSpendingTargets,
  setLocalSpendingTargets,
  getLocalAdvisorCommitments,
  setLocalAdvisorCommitments,
  getLocalLastWeeklyCheckin,
  setLocalLastWeeklyCheckin,
  getLocalCategorisationState,
  setLocalCategorisationState,
} from '@/lib/storage-local';

export type { CategorisationState } from '@/lib/storage-local';

// Re-export StoredAnalysis so consumers can import from '@/lib/storage'
export type { StoredAnalysis } from '@/lib/storage-local';

// ─── Supabase CRUD layer ───────────────────────────────────────────────
import {
  fetchTransactions,
  insertNewTransactions,
  upsertTransactions,
  updateTransactions as supabaseUpdateTransactions,
  deleteAllTransactions,
  fetchCategoryRules,
  upsertCategoryRules,
  fetchSavingsTargets,
  upsertSavingsTargets,
  fetchKnowledgeEntries,
  insertKnowledgeEntry,
  upsertKnowledgeEntries,
  deleteKnowledgeEntry as supabaseDeleteKnowledgeEntry,
  fetchMonthlyAnalyses,
  fetchAnalysisForCycle,
  upsertMonthlyAnalysis,
  fetchUserSettings,
  updateUserSettings,
  fetchAdvisorBriefings,
  insertAdvisorBriefing,
  updateAdvisorBriefing as supabaseUpdateAdvisorBriefing,
  fetchSpendingTargets,
  upsertSpendingTargets,
  fetchAdvisorCommitments,
  insertAdvisorCommitment,
  updateAdvisorCommitment as supabaseUpdateAdvisorCommitment,
  fetchManualBalances as supabaseFetchManualBalances,
  setManualBalance as supabaseSetManualBalance,
} from '@/lib/supabase/storage';

export async function getManualBalances(): Promise<Record<string, number>> {
  return supabaseFetchManualBalances();
}

export async function saveManualBalance(slotKey: string, pence: number): Promise<boolean> {
  return supabaseSetManualBalance(slotKey, pence);
}

import type { StoredAnalysis } from '@/lib/storage-local';  // used as value type within this file

// ═══════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════

export async function getTransactions(): Promise<Transaction[]> {
  const remote = await fetchTransactions();
  if (remote !== null) {
    setLocalTransactions(remote);
    return remote;
  }
  return getLocalTransactions();
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  const ok = await upsertTransactions(transactions);
  if (ok) setLocalTransactions(transactions);
}

/** Merge new transactions, deduplicating by id (ON CONFLICT DO NOTHING) */
export async function mergeTransactions(
  incoming: Transaction[]
): Promise<{ transactions: Transaction[]; added: number; skipped: number }> {
  // Get existing IDs covering the incoming date range for dedup counting
  const existingAll = await getTransactions();
  const existingIds = new Set(existingAll.map(t => t.id));

  let added = 0;
  let skipped = 0;
  for (const t of incoming) {
    if (existingIds.has(t.id)) {
      skipped++;
    } else {
      added++;
    }
  }

  await insertNewTransactions(incoming);
  const all = await getTransactions();
  return { transactions: all, added, skipped };
}

/** Update specific transactions (e.g., after AI categorization or manual correction) */
export async function updateTransactions(
  updates: (Partial<Transaction> & { id: string })[]
): Promise<Transaction[]> {
  const ok = await supabaseUpdateTransactions(updates);
  if (ok) {
    // Re-fetch full list to return updated data and refresh cache
    return await getTransactions();
  }
  // Fallback: apply updates locally and return
  const existing = getLocalTransactions();
  const updateMap = new Map(updates.map((u) => [u.id, u]));
  const updated = existing.map((t) => {
    const u = updateMap.get(t.id);
    return u ? { ...t, ...u } : t;
  });
  setLocalTransactions(updated);
  return updated;
}

export async function clearTransactions(): Promise<void> {
  await deleteAllTransactions();
  clearLocalTransactions();
}

/** Re-apply keyword rules to all transactions (skips manual corrections) */
export async function recategorizeAll(): Promise<{ updated: number; total: number }> {
  const transactions = await getTransactions();
  const customRules = await getCustomRules();
  let updatedCount = 0;

  const changedUpdates: (Partial<Transaction> & { id: string })[] = [];

  for (const t of transactions) {
    // Skip manual corrections — the user explicitly set these
    if (t.categorySource === 'manual') continue;

    const { category, subcategory, isEssential } = categorize(
      t.rawDescription || t.description,
      customRules
    );

    const changed = category !== t.category || t.isEssential !== isEssential;
    if (changed) {
      changedUpdates.push({
        id: t.id,
        category,
        subcategory,
        isEssential,
        categorySource: 'rule',
      });
      updatedCount++;
    }
  }

  if (changedUpdates.length > 0) {
    const ok = await supabaseUpdateTransactions(changedUpdates);
    if (ok) {
      // Refresh cache with the updated data
      const refreshed = await fetchTransactions();
      if (refreshed !== null) setLocalTransactions(refreshed);
    } else {
      // Fallback: apply changes to local cache directly
      const local = getLocalTransactions();
      const updateMap = new Map(changedUpdates.map((u) => [u.id, u]));
      const patched = local.map((t) => {
        const u = updateMap.get(t.id);
        return u ? { ...t, ...u } : t;
      });
      setLocalTransactions(patched);
    }
  }

  return { updated: updatedCount, total: transactions.length };
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOM RULES (user corrections)
// ═══════════════════════════════════════════════════════════════════════

export async function getCustomRules(): Promise<CategoryRule[]> {
  const remote = await fetchCategoryRules();
  if (remote !== null) {
    setLocalCustomRules(remote);
    return remote;
  }
  return getLocalCustomRules();
}

export async function saveCustomRules(rules: CategoryRule[]): Promise<void> {
  const ok = await upsertCategoryRules(rules);
  if (ok) setLocalCustomRules(rules);
}

/** Count how many transactions match a pattern (for preview before applying a rule) */
export async function countMatchingTransactions(pattern: string): Promise<{ total: number; otherCategory: number }> {
  const transactions = await getTransactions();
  const upper = pattern.toUpperCase();
  let total = 0;
  let otherCategory = 0;
  for (const t of transactions) {
    if (
      t.description.toUpperCase().includes(upper) ||
      t.merchantName?.toUpperCase().includes(upper)
    ) {
      total++;
      if (t.category === 'Other') otherCategory++;
    }
  }
  return { total, otherCategory };
}

/** Add a user correction rule and re-categorize matching transactions. Returns count of updated transactions. */
export async function addCustomRule(rule: CategoryRule): Promise<number> {
  // 1. Save the rule (upsert on user_id + pattern)
  const rules = await getCustomRules();
  const idx = rules.findIndex(
    (r) => r.pattern.toUpperCase() === rule.pattern.toUpperCase()
  );
  if (idx >= 0) {
    rules[idx] = rule;
  } else {
    rules.push(rule);
  }
  await saveCustomRules(rules);

  // 2. Re-categorize all matching transactions
  const transactions = await getTransactions();
  const pattern = rule.pattern.toUpperCase();
  const changedUpdates: (Partial<Transaction> & { id: string })[] = [];

  for (const t of transactions) {
    if (
      t.description.toUpperCase().includes(pattern) ||
      t.merchantName?.toUpperCase().includes(pattern)
    ) {
      changedUpdates.push({
        id: t.id,
        category: rule.category,
        subcategory: rule.subcategory,
        isEssential: rule.isEssential,
        categorySource: 'manual',
        userNote: rule.note,
      });
    }
  }

  if (changedUpdates.length > 0) {
    const ok = await supabaseUpdateTransactions(changedUpdates);
    if (ok) {
      const refreshed = await fetchTransactions();
      if (refreshed !== null) setLocalTransactions(refreshed);
    } else {
      // Fallback: apply locally
      const local = getLocalTransactions();
      const updateMap = new Map(changedUpdates.map((u) => [u.id, u]));
      const patched = local.map((t) => {
        const u = updateMap.get(t.id);
        return u ? { ...t, ...u } : t;
      });
      setLocalTransactions(patched);
    }
  }

  return changedUpdates.length;
}

// ═══════════════════════════════════════════════════════════════════════
// SAVINGS TARGETS
// ═══════════════════════════════════════════════════════════════════════

export async function getSavingsTargets(): Promise<SavingsTarget[]> {
  const remote = await fetchSavingsTargets();
  if (remote !== null) {
    setLocalSavingsTargets(remote);
    return remote;
  }
  return getLocalSavingsTargets();
}

export async function saveSavingsTargets(targets: SavingsTarget[]): Promise<void> {
  const ok = await upsertSavingsTargets(targets);
  if (ok) setLocalSavingsTargets(targets);
}

// ═══════════════════════════════════════════════════════════════════════
// INSIGHTS CACHE
// ═══════════════════════════════════════════════════════════════════════

export async function getCachedInsights(): Promise<Record<string, unknown> | null> {
  const settings = await fetchUserSettings();
  if (settings !== null) {
    const cache = settings.insightsCache;
    if (cache !== null) setLocalInsightsCache(cache);
    return cache;
  }
  return getLocalInsightsCache();
}

export async function cacheInsights(data: Record<string, unknown>): Promise<void> {
  const withTimestamp = { ...data, cachedAt: Date.now() };
  const ok = await updateUserSettings({ insights_cache: withTimestamp });
  if (ok) setLocalInsightsCache(data);
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOM CATEGORIES (colors)
// ═══════════════════════════════════════════════════════════════════════

export async function getCustomCategories(): Promise<Record<string, string>> {
  const settings = await fetchUserSettings();
  if (settings !== null) {
    setLocalCustomColors(settings.customColors);
    return settings.customColors;
  }
  return getLocalCustomColors();
}

export async function addCustomCategory(name: string, color: string): Promise<void> {
  const existing = await getCustomCategories();
  const updated = { ...existing, [name]: color };
  const ok = await updateUserSettings({ custom_colors: updated });
  if (ok) setLocalCustomColors(updated);
}

// ═══════════════════════════════════════════════════════════════════════
// ACCOUNT NICKNAMES
// ═══════════════════════════════════════════════════════════════════════

export async function getAccountNicknames(): Promise<Record<string, string>> {
  const settings = await fetchUserSettings();
  if (settings !== null) {
    setLocalAccountNicknames(settings.accountNicknames);
    return settings.accountNicknames;
  }
  return getLocalAccountNicknames();
}

export async function saveAccountNickname(rawName: string, nickname: string): Promise<void> {
  const existing = await getAccountNicknames();
  const updated = { ...existing, [rawName]: nickname };
  const ok = await updateUserSettings({ account_nicknames: updated });
  if (ok) setLocalAccountNicknames(updated);
}

/** Synchronous — reads from localStorage cache only */
export function getDisplayName(rawName: string): string {
  const nicknames = getLocalAccountNicknames();
  return nicknames[rawName] || rawName;
}

// ═══════════════════════════════════════════════════════════════════════
// KNOWLEDGE BANK
// ═══════════════════════════════════════════════════════════════════════

export async function getKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const remote = await fetchKnowledgeEntries();
  if (remote !== null) {
    setLocalKnowledgeEntries(remote);
    return remote;
  }
  return getLocalKnowledgeEntries();
}

export async function saveKnowledgeEntries(entries: KnowledgeEntry[]): Promise<void> {
  const ok = await upsertKnowledgeEntries(entries);
  if (ok) setLocalKnowledgeEntries(entries);
}

export async function addKnowledgeEntry(
  entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>
): Promise<KnowledgeEntry> {
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  const ok = await insertKnowledgeEntry(newEntry);
  if (ok) {
    // Refresh cache
    const all = await fetchKnowledgeEntries();
    if (all !== null) setLocalKnowledgeEntries(all);
  } else {
    // Fallback: add to local cache
    const local = getLocalKnowledgeEntries();
    local.unshift(newEntry);
    setLocalKnowledgeEntries(local);
  }

  return newEntry;
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const ok = await supabaseDeleteKnowledgeEntry(id);
  if (ok) {
    const all = await fetchKnowledgeEntries();
    if (all !== null) setLocalKnowledgeEntries(all);
  } else {
    // Fallback: remove from local cache
    const local = getLocalKnowledgeEntries().filter((e) => e.id !== id);
    setLocalKnowledgeEntries(local);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ACCOUNT TYPES (hub/credit-card/savings hierarchy)
// ═══════════════════════════════════════════════════════════════════════

export async function getAccountTypes(): Promise<AccountConfig[]> {
  const settings = await fetchUserSettings();
  if (settings !== null) {
    setLocalAccountTypes(settings.accountTypes);
    return settings.accountTypes;
  }
  return getLocalAccountTypes();
}

export async function saveAccountTypes(configs: AccountConfig[]): Promise<void> {
  const ok = await updateUserSettings({ account_types: configs });
  if (ok) setLocalAccountTypes(configs);
}

export async function setAccountType(rawName: string, type: AccountConfig['type']): Promise<void> {
  const configs = await getAccountTypes();
  const idx = configs.findIndex((c) => c.rawName === rawName);
  if (idx >= 0) {
    configs[idx] = { rawName, type, autoDetected: false };
  } else {
    configs.push({ rawName, type, autoDetected: false });
  }
  await saveAccountTypes(configs);
}

// ═══════════════════════════════════════════════════════════════════════
// DISMISSED RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════

export async function getDismissedRecommendations(): Promise<string[]> {
  const settings = await fetchUserSettings();
  if (settings !== null) {
    setLocalDismissedRecommendations(settings.dismissedRecommendations);
    return settings.dismissedRecommendations;
  }
  return getLocalDismissedRecommendations();
}

export async function dismissRecommendation(id: string): Promise<void> {
  const existing = await getDismissedRecommendations();
  if (!existing.includes(id)) {
    const updated = [...existing, id];
    const ok = await updateUserSettings({ dismissed_recommendations: updated });
    if (ok) setLocalDismissedRecommendations(updated);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ESSENTIAL MERCHANTS (mortgage, loan, utilities — don't flag as "still needed?")
// ═══════════════════════════════════════════════════════════════════════

export async function getEssentialMerchants(): Promise<string[]> {
  const settings = await fetchUserSettings();
  if (settings !== null) {
    setLocalEssentialMerchants(settings.essentialMerchants);
    return settings.essentialMerchants;
  }
  return getLocalEssentialMerchants();
}

export async function addEssentialMerchant(merchant: string): Promise<void> {
  const existing = await getEssentialMerchants();
  const normalised = merchant.toLowerCase().trim();
  if (!existing.includes(normalised)) {
    const updated = [...existing, normalised];
    const ok = await updateUserSettings({ essential_merchants: updated });
    if (ok) setLocalEssentialMerchants(updated);
    else setLocalEssentialMerchants(updated); // fallback to localStorage
  }
}

export async function removeEssentialMerchant(merchant: string): Promise<void> {
  const existing = await getEssentialMerchants();
  const normalised = merchant.toLowerCase().trim();
  const updated = existing.filter((m) => m !== normalised);
  const ok = await updateUserSettings({ essential_merchants: updated });
  if (ok) setLocalEssentialMerchants(updated);
  else setLocalEssentialMerchants(updated);
}

// ═══════════════════════════════════════════════════════════════════════
// MONTHLY AI ANALYSES
// ═══════════════════════════════════════════════════════════════════════

export async function getMonthlyAnalyses(): Promise<StoredAnalysis[]> {
  const remote = await fetchMonthlyAnalyses();
  if (remote !== null) {
    setLocalMonthlyAnalyses(remote);
    return remote;
  }
  return getLocalMonthlyAnalyses();
}

export async function saveMonthlyAnalysis(
  cycleId: string,
  analysis: Record<string, unknown>
): Promise<void> {
  const ok = await upsertMonthlyAnalysis(cycleId, analysis);
  if (ok) {
    // Refresh full list cache
    const all = await fetchMonthlyAnalyses();
    if (all !== null) setLocalMonthlyAnalyses(all);
  } else {
    // Fallback: update local cache
    const existing = getLocalMonthlyAnalyses();
    const idx = existing.findIndex((a) => a.cycleId === cycleId);
    const entry: StoredAnalysis = {
      cycleId,
      analysedAt: new Date().toISOString(),
      analysis,
    };
    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.unshift(entry);
    }
    setLocalMonthlyAnalyses(existing);
  }
}

export async function getAnalysisForCycle(cycleId: string): Promise<StoredAnalysis | null> {
  const remote = await fetchAnalysisForCycle(cycleId);
  if (remote !== null) return remote;
  // Fallback: check local cache
  const local = getLocalMonthlyAnalyses();
  return local.find((a) => a.cycleId === cycleId) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// ADVISOR BRIEFINGS
// ═══════════════════════════════════════════════════════════════════════

export async function getAdvisorBriefings(cycleId?: string): Promise<AdvisorBriefing[]> {
  const remote = await fetchAdvisorBriefings(cycleId);
  if (remote !== null) {
    setLocalAdvisorBriefings(remote);
    return remote;
  }
  const local = getLocalAdvisorBriefings();
  if (cycleId) return local.filter((b) => b.cycleId === cycleId);
  return local;
}

export async function saveAdvisorBriefing(
  briefing: Omit<AdvisorBriefing, 'id' | 'createdAt'>
): Promise<void> {
  const ok = await insertAdvisorBriefing(briefing);
  if (ok) {
    // Refresh cache
    const all = await fetchAdvisorBriefings();
    if (all !== null) setLocalAdvisorBriefings(all);
  }
}

export async function dismissAdvisorBriefing(id: string): Promise<void> {
  const ok = await supabaseUpdateAdvisorBriefing(id, { dismissed: true });
  if (ok) {
    // Refresh cache
    const all = await fetchAdvisorBriefings();
    if (all !== null) setLocalAdvisorBriefings(all);
  } else {
    // Fallback: update local cache
    const local = getLocalAdvisorBriefings();
    const updated = local.map((b) => (b.id === id ? { ...b, dismissed: true } : b));
    setLocalAdvisorBriefings(updated);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SPENDING TARGETS (per-category)
// ═══════════════════════════════════════════════════════════════════════

export async function getSpendingTargets(cycleId: string): Promise<SpendingTarget[]> {
  const remote = await fetchSpendingTargets(cycleId);
  if (remote !== null) {
    setLocalSpendingTargets(remote);
    return remote;
  }
  const local = getLocalSpendingTargets();
  return local.filter((t) => t.cycleId === cycleId);
}

export async function saveSpendingTargets(targets: SpendingTarget[]): Promise<void> {
  const ok = await upsertSpendingTargets(targets);
  if (ok) setLocalSpendingTargets(targets);
}

// ═══════════════════════════════════════════════════════════════════════
// ADVISOR COMMITMENTS
// ═══════════════════════════════════════════════════════════════════════

export async function getAdvisorCommitments(cycleId?: string): Promise<AdvisorCommitment[]> {
  const remote = await fetchAdvisorCommitments(cycleId);
  if (remote !== null) {
    setLocalAdvisorCommitments(remote);
    return remote;
  }
  const local = getLocalAdvisorCommitments();
  if (cycleId) return local.filter((c) => c.cycleId === cycleId);
  return local;
}

export async function saveAdvisorCommitment(
  commitment: Omit<AdvisorCommitment, 'id' | 'createdAt'>
): Promise<void> {
  const ok = await insertAdvisorCommitment(commitment);
  if (ok) {
    // Refresh cache
    const all = await fetchAdvisorCommitments();
    if (all !== null) setLocalAdvisorCommitments(all);
  }
}

export async function updateAdvisorCommitment(
  id: string,
  fields: Partial<Pick<AdvisorCommitment, 'status' | 'outcome'>>
): Promise<void> {
  const ok = await supabaseUpdateAdvisorCommitment(id, fields);
  if (ok) {
    // Refresh cache
    const all = await fetchAdvisorCommitments();
    if (all !== null) setLocalAdvisorCommitments(all);
  } else {
    // Fallback: update local cache
    const local = getLocalAdvisorCommitments();
    const updated = local.map((c) => (c.id === id ? { ...c, ...fields } : c));
    setLocalAdvisorCommitments(updated);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LAST WEEKLY CHECK-IN
// ═══════════════════════════════════════════════════════════════════════

export function getLastWeeklyCheckin(): string | null {
  return getLocalLastWeeklyCheckin();
}

export function setLastWeeklyCheckin(date: string | null): void {
  setLocalLastWeeklyCheckin(date);
}

// ═══════════════════════════════════════════════════════════════════════
// CATEGORISATION STATE
// ═══════════════════════════════════════════════════════════════════════

export { getLocalCategorisationState as getCategorisationState, setLocalCategorisationState as setCategorisationState };
