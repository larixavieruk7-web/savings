'use client';

import type { Transaction, CategoryRule } from '@/types';

const KEYS = {
  transactions: 'savings_transactions',
  customRules: 'savings_custom_rules',
} as const;

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

export function clearTransactions(): void {
  localStorage.removeItem(KEYS.transactions);
}

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
