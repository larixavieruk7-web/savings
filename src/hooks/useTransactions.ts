'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getTransactions,
  mergeTransactions,
  clearTransactions,
  updateTransactions,
  saveTransactions,
} from '@/lib/storage';
import type { Transaction, MonthlyBreakdown, PeriodOption } from '@/types';
import { format, parseISO, subDays, subMonths, startOfDay } from 'date-fns';

function getPeriodStartDate(period: PeriodOption): Date | null {
  const now = new Date();
  switch (period) {
    case 'last30':
      return startOfDay(subDays(now, 30));
    case 'last90':
      return startOfDay(subDays(now, 90));
    case 'last6m':
      return startOfDay(subMonths(now, 6));
    case 'last12m':
      return startOfDay(subMonths(now, 12));
    case 'all':
      return null;
  }
}

export function useTransactions() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('last30');

  useEffect(() => {
    setAllTransactions(getTransactions());
    setLoaded(true);
  }, []);

  const reload = useCallback(() => {
    setAllTransactions(getTransactions());
  }, []);

  const addTransactions = useCallback((incoming: Transaction[]) => {
    const merged = mergeTransactions(incoming);
    setAllTransactions(merged);
    return merged;
  }, []);

  const updateMany = useCallback(
    (updates: (Partial<Transaction> & { id: string })[]) => {
      const updated = updateTransactions(updates);
      setAllTransactions(updated);
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
        setAllTransactions([...all]);
      }
    },
    []
  );

  const clear = useCallback(() => {
    clearTransactions();
    setAllTransactions([]);
  }, []);

  // Derive period date boundaries
  const startDate = useMemo(() => {
    const d = getPeriodStartDate(period);
    return d ? d.toISOString() : null;
  }, [period]);

  const endDate = useMemo(() => new Date().toISOString(), []);

  // Filtered transactions based on the active period
  const filteredTransactions = useMemo(() => {
    if (!startDate) return allTransactions;
    return allTransactions.filter((t) => t.date >= startDate);
  }, [allTransactions, startDate]);

  // All computed values use filteredTransactions
  const totalIncome = useMemo(
    () => filteredTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [filteredTransactions]
  );

  const totalSpending = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [filteredTransactions]
  );

  const essentialSpending = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.amount < 0 && t.isEssential === true)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [filteredTransactions]
  );

  const discretionarySpending = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.amount < 0 && t.isEssential === false)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [filteredTransactions]
  );

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of filteredTransactions) {
      if (t.amount < 0) {
        map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
      }
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => ({ category, amount }));
  }, [filteredTransactions]);

  const merchantBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const t of filteredTransactions) {
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
  }, [filteredTransactions]);

  const monthlyBreakdowns = useMemo((): MonthlyBreakdown[] => {
    const map = new Map<string, MonthlyBreakdown>();

    for (const t of filteredTransactions) {
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
  }, [filteredTransactions]);

  const dateRange = useMemo(() => {
    if (filteredTransactions.length === 0) return null;
    const dates = filteredTransactions.map((t) => t.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [filteredTransactions]);

  // Uncategorized count (transactions needing attention)
  const uncategorizedCount = useMemo(
    () => filteredTransactions.filter((t) => t.category === 'Other' && t.amount < 0).length,
    [filteredTransactions]
  );

  return {
    // Unfiltered (for upload page etc.)
    transactions: filteredTransactions,
    allTransactions,
    // Period filter
    period,
    setPeriod,
    startDate,
    endDate,
    filteredTransactions,
    // State
    loaded,
    reload,
    addTransactions,
    updateMany,
    updateOne,
    clear,
    // Computed (all based on filteredTransactions)
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
