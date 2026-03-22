'use client';

import type { Transaction, CategoryRule, SavingsTarget, AccountConfig } from '@/types';
import { categorize } from '@/lib/categories';

const KEYS = {
  transactions: 'savings_transactions',
  customRules: 'savings_custom_rules',
  savingsTargets: 'savings_targets',
  insightsCache: 'savings_insights_cache',
  customCategories: 'savings_custom_colors',
  accountNicknames: 'savings_account_nicknames',
  knowledgeBank: 'savings_knowledge_bank',
  accountTypes: 'savings_account_types',
  dismissedRecommendations: 'savings_dismissed_recommendations',
  monthlyAnalyses: 'savings_monthly_analyses',
} as const;

// ─── Transactions ────────────────────────────────────────────────

export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.transactions);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  localStorage.setItem(KEYS.transactions, JSON.stringify(transactions));
}

/** Merge new transactions, deduplicating by id */
export function mergeTransactions(incoming: Transaction[]): Transaction[] {
  const existing = getTransactions();
  const existingIds = new Set(existing.map((t) => t.id));
  const newOnes = incoming.filter((t) => !existingIds.has(t.id));
  const merged = [...existing, ...newOnes].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  saveTransactions(merged);
  return merged;
}

/** Update specific transactions (e.g., after AI categorization or manual correction) */
export function updateTransactions(updates: Partial<Transaction> & { id: string }[]): Transaction[] {
  const existing = getTransactions();
  const updateMap = new Map(updates.map((u) => [u.id, u]));
  const updated = existing.map((t) => {
    const u = updateMap.get(t.id);
    return u ? { ...t, ...u } : t;
  });
  saveTransactions(updated);
  return updated;
}

export function clearTransactions(): void {
  localStorage.removeItem(KEYS.transactions);
}

/** Re-apply keyword rules to all transactions (skips manual corrections) */
export function recategorizeAll(): { updated: number; total: number } {
  const transactions = getTransactions();
  const customRules = getCustomRules();
  let updated = 0;

  for (const t of transactions) {
    // Skip manual corrections — the user explicitly set these
    if (t.categorySource === 'manual') continue;

    const { category, subcategory, isEssential } = categorize(
      t.rawDescription || t.description,
      customRules
    );

    const changed = category !== t.category || t.isEssential !== isEssential;
    if (changed) {
      t.category = category;
      t.subcategory = subcategory;
      t.isEssential = isEssential;
      t.categorySource = 'rule';
      updated++;
    }
  }

  if (updated > 0) saveTransactions(transactions);
  return { updated, total: transactions.length };
}

// ─── Custom Rules (user corrections) ────────────────────────────

export function getCustomRules(): CategoryRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.customRules);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomRules(rules: CategoryRule[]): void {
  localStorage.setItem(KEYS.customRules, JSON.stringify(rules));
}

/** Add a user correction rule and re-categorize matching transactions */
export function addCustomRule(rule: CategoryRule): void {
  const rules = getCustomRules();
  // Replace existing rule for same pattern
  const idx = rules.findIndex(
    (r) => r.pattern.toUpperCase() === rule.pattern.toUpperCase()
  );
  if (idx >= 0) {
    rules[idx] = rule;
  } else {
    rules.push(rule);
  }
  saveCustomRules(rules);

  // Re-categorize all matching transactions
  const transactions = getTransactions();
  const pattern = rule.pattern.toUpperCase();
  let changed = false;
  for (const t of transactions) {
    if (t.description.toUpperCase().includes(pattern) ||
        t.merchantName?.toUpperCase().includes(pattern)) {
      t.category = rule.category;
      t.subcategory = rule.subcategory;
      t.isEssential = rule.isEssential;
      t.categorySource = 'manual';
      t.userNote = rule.note;
      changed = true;
    }
  }
  if (changed) saveTransactions(transactions);
}

// ─── Savings Targets ────────────────────────────────────────────

export function getSavingsTargets(): SavingsTarget[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.savingsTargets);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSavingsTargets(targets: SavingsTarget[]): void {
  localStorage.setItem(KEYS.savingsTargets, JSON.stringify(targets));
}

// ─── Insights Cache ─────────────────────────────────────────────

export function getCachedInsights(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEYS.insightsCache);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheInsights(data: Record<string, unknown>): void {
  localStorage.setItem(KEYS.insightsCache, JSON.stringify({
    ...data,
    cachedAt: Date.now(),
  }));
}

// ─── Custom Categories ──────────────────────────────────────────

export function getCustomCategories(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEYS.customCategories);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function addCustomCategory(name: string, color: string): void {
  const existing = getCustomCategories();
  existing[name] = color;
  localStorage.setItem(KEYS.customCategories, JSON.stringify(existing));
}

// ─── Account Nicknames ──────────────────────────────────────────

export function getAccountNicknames(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEYS.accountNicknames);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAccountNickname(rawName: string, nickname: string): void {
  const existing = getAccountNicknames();
  existing[rawName] = nickname;
  localStorage.setItem(KEYS.accountNicknames, JSON.stringify(existing));
}

export function getDisplayName(rawName: string): string {
  const nicknames = getAccountNicknames();
  return nicknames[rawName] || rawName;
}

// ─── Knowledge Bank ─────────────────────────────────────────────

import type { KnowledgeEntry } from '@/types';

export function getKnowledgeEntries(): KnowledgeEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.knowledgeBank);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveKnowledgeEntries(entries: KnowledgeEntry[]): void {
  localStorage.setItem(KEYS.knowledgeBank, JSON.stringify(entries));
}

export function addKnowledgeEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): KnowledgeEntry {
  const entries = getKnowledgeEntries();
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  saveKnowledgeEntries(entries);
  return newEntry;
}

export function deleteKnowledgeEntry(id: string): void {
  const entries = getKnowledgeEntries().filter((e) => e.id !== id);
  saveKnowledgeEntries(entries);
}

// ─── Account Types (hub/credit-card/savings hierarchy) ──────────

export function getAccountTypes(): AccountConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.accountTypes);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAccountTypes(configs: AccountConfig[]): void {
  localStorage.setItem(KEYS.accountTypes, JSON.stringify(configs));
}

export function setAccountType(rawName: string, type: AccountConfig['type']): void {
  const configs = getAccountTypes();
  const idx = configs.findIndex((c) => c.rawName === rawName);
  if (idx >= 0) {
    configs[idx] = { rawName, type, autoDetected: false };
  } else {
    configs.push({ rawName, type, autoDetected: false });
  }
  saveAccountTypes(configs);
}

// ─── Dismissed Recommendations ──────────────────────────────────

export function getDismissedRecommendations(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.dismissedRecommendations);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function dismissRecommendation(id: string): void {
  const existing = getDismissedRecommendations();
  if (!existing.includes(id)) {
    existing.push(id);
    localStorage.setItem(KEYS.dismissedRecommendations, JSON.stringify(existing));
  }
}

// ─── Monthly AI Analyses ────────────────────────────────────────

export interface StoredAnalysis {
  cycleId: string;
  analysedAt: string; // ISO date
  analysis: Record<string, unknown>;
}

export function getMonthlyAnalyses(): StoredAnalysis[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.monthlyAnalyses);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMonthlyAnalysis(cycleId: string, analysis: Record<string, unknown>): void {
  const existing = getMonthlyAnalyses();
  // Replace existing for same cycle, or add new
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
  localStorage.setItem(KEYS.monthlyAnalyses, JSON.stringify(existing));
}

export function getAnalysisForCycle(cycleId: string): StoredAnalysis | null {
  return getMonthlyAnalyses().find((a) => a.cycleId === cycleId) ?? null;
}
