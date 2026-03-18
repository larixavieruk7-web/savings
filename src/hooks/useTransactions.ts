'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getTransactions,
  mergeTransactions,
  clearTransactions,
  updateTransactions,
  saveTransactions,
} from '@/lib/storage';
import type { Transaction, MonthlyBreakdown } from '@/types';
import { format, parseISO } from 'date-fns';

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTransactions(getTransactions());
    setLoaded(true);
  }, []);

  const reload = useCallback(() => {
    setTransactions(getTransactions());
  }, []);

  const addTransactions = useCallback((incoming: Transaction[]) => {
    const merged = mergeTransactions(incoming);
    setTransactions(merged);
    return merged;
  }, []);

  const updateMany = useCallback(
    (updates: (Partial<Transaction> & { id: string })[]) => {
      const updated = updateTransactions(updates);
      setTransactions(updated);
      return updated;
    },
    []
  );

  const updateOne = useCallback(
    (id: string, changes: Partial<Transaction>) => {
      const all = getTransactions();
      const idx = all.findIndex((t) => t.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...changes };
        saveTransactions(all);
        setTransactions([...all]);
      }
    },
    []
  );

  const clear = useCallback(() => {
    clearTransactions();
    setTransactions([]);
  }, []);

  const totalIncome = useMemo(
    () => transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const totalSpending = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions]
  );

  const essentialSpending = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0 && t.isEssential === true)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions]
  );

  const discretionarySpending = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0 && t.isEssential === false)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions]
  );

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.amount < 0) {
        map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
      }
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => ({ category, amount }));
  }, [transactions]);

  const merchantBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const t of transactions) {
      if (t.amount < 0 && t.merchantName) {
        const key = t.merchantName.toUpperCase();
        if (!map[key]) map[key] = { total: 0, count: 0 };
        map[key].total += Math.abs(t.amount);
        map[key].count++;
      }
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([merchant, data]) => ({ merchant, ...data }));
  }, [transactions]);

  const monthlyBreakdowns = useMemo((): MonthlyBreakdown[] => {
    const map = new Map<string, MonthlyBreakdown>();

    for (const t of transactions) {
      const month = format(parseISO(t.date), 'yyyy-MM');
      if (!map.has(month)) {
        map.set(month, {
          month,
          income: 0,
          spending: 0,
          net: 0,
          essentialSpend: 0,
          discretionarySpend: 0,
          byCategory: {},
        });
      }
      const m = map.get(month)!;
      if (t.amount > 0) {
        m.income += t.amount;
      } else {
        m.spending += Math.abs(t.amount);
        if (t.isEssential === true) m.essentialSpend += Math.abs(t.amount);
        else m.discretionarySpend += Math.abs(t.amount);
        m.byCategory[t.category] =
          (m.byCategory[t.category] || 0) + Math.abs(t.amount);
      }
      m.net = m.income - m.spending;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
  }, [transactions]);

  const dateRange = useMemo(() => {
    if (transactions.length === 0) return null;
    const dates = transactions.map((t) => t.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [transactions]);

  // Uncategorized count (transactions needing attention)
  const uncategorizedCount = useMemo(
    () => transactions.filter((t) => t.category === 'Other' && t.amount < 0).length,
    [transactions]
  );

  return {
    transactions,
    loaded,
    reload,
    addTransactions,
    updateMany,
    updateOne,
    clear,
    totalIncome,
    totalSpending,
    essentialSpending,
    discretionarySpending,
    categoryBreakdown,
    merchantBreakdown,
    monthlyBreakdowns,
    dateRange,
    uncategorizedCount,
  };
}
