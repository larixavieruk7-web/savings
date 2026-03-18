'use client';

import type { Transaction, CategoryRule, SavingsTarget } from '@/types';

const KEYS = {
  transactions: 'savings_transactions',
  customRules: 'savings_custom_rules',
  savingsTargets: 'savings_targets',
  insightsCache: 'savings_insights_cache',
  customCategories: 'savings_custom_colors',
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
