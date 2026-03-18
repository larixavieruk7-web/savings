'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getTransactions,
  mergeTransactions,
  clearTransactions,
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

  const addTransactions = useCallback((incoming: Transaction[]) => {
    const merged = mergeTransactions(incoming);
    setTransactions(merged);
    return merged;
  }, []);

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
          byCategory: {},
        });
      }
      const m = map.get(month)!;
      if (t.amount > 0) {
        m.income += t.amount;
      } else {
        m.spending += Math.abs(t.amount);
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

  return {
    transactions,
    loaded,
    addTransactions,
    clear,
    totalIncome,
    totalSpending,
    categoryBreakdown,
    monthlyBreakdowns,
    dateRange,
  };
}
