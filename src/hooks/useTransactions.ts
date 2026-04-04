'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getTransactions,
  mergeTransactions,
  clearTransactions,
  updateTransactions,
  saveTransactions,
  getAccountTypes,
  saveAccountTypes,
  getEssentialMerchants,
} from '@/lib/storage';
import { getLocalTransactions, getLocalAccountTypes } from '@/lib/storage-local';
import type { Transaction, MonthlyBreakdown, PeriodOption, SalaryFlow, CategoryCreep, HealthScorecard, Recommendation } from '@/types';
import { format, parseISO, subDays } from 'date-fns';
import { detectAllAccountTypes, reclassifyTransfers } from '@/lib/account-hierarchy';
import { computeSalaryFlow } from '@/lib/money-flow';
import { detectCategoryCreep } from '@/lib/intelligence/category-creep';
import { detectConveniencePremiums } from '@/lib/intelligence/convenience-premium';
import { computeHealthScorecard } from '@/lib/intelligence/health-scorecard';
import { generateRecommendations } from '@/lib/intelligence/recommendations';
import { computeSubscriptionData } from '@/lib/subscriptions';
import { detectContractAlerts } from '@/lib/intelligence/contract-alerts';
import { detectOverlappingServices } from '@/lib/intelligence/overlapping-services';
import { projectCategorySpending, projectSavingsTrajectory } from '@/lib/intelligence/trajectory';
import { compareYearOverYear } from '@/lib/intelligence/yoy-comparison';
import type { ContractAlert } from '@/lib/intelligence/contract-alerts';
import type { OverlappingService } from '@/lib/intelligence/overlapping-services';
import type { CategoryTrajectory, SavingsTrajectory } from '@/lib/intelligence/trajectory';
import type { YoYComparison } from '@/lib/intelligence/yoy-comparison';

// Categories that represent internal money movement — not real income or spending
const INTERNAL_CATEGORIES = new Set(['Transfers', 'Savings & Investments']);

// Only salary counts as household income — refunds, transfers in, rewards etc. are excluded
const INCOME_CATEGORIES = new Set(['Salary']);

export interface SalaryCycle {
  id: string;         // 'cycle-2026-02'
  label: string;      // 'Feb 2026'
  start: string;      // ISO date of salary deposit that opens this cycle
  end: string;        // ISO date: day before next salary (closed) or today (open)
  isOpen: boolean;    // true = current in-progress cycle
  salaryDate: string; // ISO date of the salary deposit
}

/** Find actual salary deposit dates from transactions */
function detectSalaryDates(transactions: Transaction[]): string[] {
  const salaryTxns = transactions.filter(
    (t) => t.amount > 0 && (t.category === 'Salary' || t.description?.includes('JPMCB'))
  );
  // Deduplicate by calendar month — keep earliest salary date per month
  const byMonth = new Map<string, string>();
  for (const t of salaryTxns) {
    const monthKey = t.date.slice(0, 7); // 'yyyy-MM'
    const existing = byMonth.get(monthKey);
    if (!existing || t.date < existing) {
      byMonth.set(monthKey, t.date);
    }
  }
  return Array.from(byMonth.values()).sort();
}

/** Build cycles anchored to actual salary deposit dates */
function buildCyclesFromSalaryDates(salaryDates: string[], today: string): SalaryCycle[] {
  if (salaryDates.length === 0) {
    // Fallback: no salary data yet — single open cycle covering all time
    return [{
      id: 'cycle-open',
      label: 'Current',
      start: '2000-01-01',
      end: today,
      isOpen: true,
      salaryDate: today,
    }];
  }

  const cycles: SalaryCycle[] = [];

  for (let i = 0; i < salaryDates.length; i++) {
    const salaryDate = salaryDates[i];
    const isLast = i === salaryDates.length - 1;

    let end: string;
    let isOpen: boolean;

    if (isLast) {
      // Open cycle — runs from this salary to today
      end = today;
      isOpen = true;
    } else {
      // Closed cycle — runs from this salary to day before next salary
      const nextSalary = parseISO(salaryDates[i + 1]);
      end = format(subDays(nextSalary, 1), 'yyyy-MM-dd');
      isOpen = false;
    }

    const parsed = parseISO(salaryDate);
    cycles.push({
      id: `cycle-${format(parsed, 'yyyy-MM')}`,
      label: format(parsed, 'MMM yyyy'),
      start: salaryDate,
      end,
      isOpen,
      salaryDate,
    });
  }

  return cycles.reverse(); // most recent first
}

function getCycleBoundariesFromList(
  period: PeriodOption,
  cycles: SalaryCycle[]
): { start: string | null; end: string | null } {
  if (period === 'all') return { start: null, end: null };
  const found = cycles.find((c) => c.id === period);
  if (found) return { start: found.start, end: found.end };
  return { start: null, end: null };
}

export function useTransactions() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [periodRaw, setPeriodRaw] = useState<PeriodOption>('all');
  const [userHasChosen, setUserHasChosen] = useState(false);
  const loadedRef = useRef(false);
  const [essentialMerchants, setEssentialMerchants] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Show cached data instantly (sync read from localStorage)
      const cached = getLocalTransactions();
      if (cached.length > 0 && !loadedRef.current) {
        setAllTransactions(cached);
      }

      // Fetch from Supabase
      const data = await getTransactions();

      if (cancelled) return;

      // Account type detection + reclassification
      const currentTypes = await getAccountTypes();
      const detected = detectAllAccountTypes(data, currentTypes);
      await saveAccountTypes(detected);

      // CRITICAL: reclassifyTransfers returns { transactions, changed } — destructure correctly!
      const { transactions: reclassified, changed } = reclassifyTransfers(data, detected);
      if (changed > 0) {
        await saveTransactions(reclassified);
      }

      if (cancelled) return;

      setAllTransactions(reclassified);

      // Load essential merchants for smart contract alerts
      getEssentialMerchants().then(setEssentialMerchants).catch(() => {});

      setLoaded(true);
      setLoading(false);
      loadedRef.current = true;
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const reload = useCallback(async () => {
    const data = await getTransactions();
    setAllTransactions(data);
  }, []);

  const addTransactions = useCallback(async (incoming: Transaction[]) => {
    const { transactions: merged, added, skipped } = await mergeTransactions(incoming);
    setAllTransactions(merged);
    return { transactions: merged, added, skipped };
  }, []);

  const updateMany = useCallback(
    async (updates: (Partial<Transaction> & { id: string })[]) => {
      const updated = await updateTransactions(updates);
      setAllTransactions(updated);
      return updated;
    },
    []
  );

  const updateOne = useCallback(
    async (id: string, changes: Partial<Transaction>) => {
      const updated = await updateTransactions([{ id, ...changes }]);
      setAllTransactions(updated);
    },
    []
  );

  const clear = useCallback(async () => {
    await clearTransactions();
    setAllTransactions([]);
  }, []);

  // Available salary cycles, anchored to actual salary deposit dates
  const availableCycles = useMemo(() => {
    const salaryDates = detectSalaryDates(allTransactions);
    const today = format(new Date(), 'yyyy-MM-dd');
    return buildCyclesFromSalaryDates(salaryDates, today);
  }, [allTransactions]);

  // Auto-default to latest cycle until user explicitly picks a period
  const period = useMemo(() => {
    if (!userHasChosen && availableCycles.length > 0 && availableCycles[0].id !== 'cycle-open') {
      return availableCycles[0].id;
    }
    return periodRaw;
  }, [periodRaw, availableCycles, userHasChosen]);

  const setPeriod = useCallback((p: PeriodOption) => {
    setUserHasChosen(true);
    setPeriodRaw(p);
  }, []);

  // Derive period date boundaries from the pre-built cycles list
  const { start: startDate, end: endDate } = useMemo(
    () => getCycleBoundariesFromList(period, availableCycles),
    [period, availableCycles]
  );

  // Filtered transactions based on the active period
  const filteredTransactions = useMemo(() => {
    if (!startDate && !endDate) return allTransactions;
    return allTransactions.filter((t) => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    });
  }, [allTransactions, startDate, endDate]);

  // All computed values use filteredTransactions
  const totalIncome = useMemo(
    () => filteredTransactions
      .filter((t) => t.amount > 0 && INCOME_CATEGORIES.has(t.category))
      .reduce((s, t) => s + t.amount, 0),
    [filteredTransactions]
  );

  const totalSpending = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category))
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
      const isInternal = INTERNAL_CATEGORIES.has(t.category);
      if (t.amount > 0) {
        if (INCOME_CATEGORIES.has(t.category)) m.income += t.amount;
      } else {
        if (!isInternal) {
          m.spending += Math.abs(t.amount);
          if (t.isEssential === true) m.essentialSpend += Math.abs(t.amount);
          else m.discretionarySpend += Math.abs(t.amount);
        }
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

  const uncategorizedCount = useMemo(
    () => filteredTransactions.filter((t) => t.category === 'Other' && t.amount < 0).length,
    [filteredTransactions]
  );

  // ─── Account hierarchy ──────────────────────────────────────────
  // Read from localStorage cache (sync) — updated during init and after saves
  const accountTypes = useMemo(() => getLocalAccountTypes(), [allTransactions]);

  // ─── Intelligence: salary flow ──────────────────────────────────
  const currentCycleMeta = useMemo(() => {
    if (period === 'all') return null;
    return availableCycles.find((c) => c.id === period) ?? null;
  }, [period, availableCycles]);

  const salaryFlow = useMemo((): SalaryFlow | null => {
    if (!currentCycleMeta) return null;
    return computeSalaryFlow(allTransactions, accountTypes, currentCycleMeta);
  }, [allTransactions, accountTypes, currentCycleMeta]);

  // ─── Intelligence: category creep ───────────────────────────────
  const categoryCreep = useMemo((): CategoryCreep[] => {
    return detectCategoryCreep(allTransactions, availableCycles);
  }, [allTransactions, availableCycles]);

  // ─── Intelligence: convenience premium ──────────────────────────
  const conveniencePremium = useMemo(
    () => detectConveniencePremiums(filteredTransactions),
    [filteredTransactions]
  );

  // ─── Intelligence: health scorecard ─────────────────────────────
  const healthScorecard = useMemo((): HealthScorecard | null => {
    if (!salaryFlow) return null;
    return computeHealthScorecard(
      salaryFlow,
      categoryCreep,
      conveniencePremium.totalPremium,
      totalIncome,
      totalSpending,
      essentialSpending
    );
  }, [salaryFlow, categoryCreep, conveniencePremium.totalPremium, totalIncome, totalSpending, essentialSpending]);

  // ─── Intelligence: contract alerts ─────────────────────────────
  const contractAlerts = useMemo((): ContractAlert[] => {
    return detectContractAlerts(allTransactions, essentialMerchants);
  }, [allTransactions, essentialMerchants]);

  // ─── Intelligence: overlapping services ───────────────────────
  const overlappingServices = useMemo((): OverlappingService[] => {
    return detectOverlappingServices(allTransactions);
  }, [allTransactions]);

  // ─── Intelligence: spending trajectory ────────────────────────
  const categoryTrajectory = useMemo((): CategoryTrajectory[] => {
    if (!currentCycleMeta) return [];
    // Build targets map from spending targets if available — empty for now
    const targets: Record<string, number> = {};
    return projectCategorySpending(
      allTransactions,
      currentCycleMeta.start,
      currentCycleMeta.end,
      targets
    );
  }, [allTransactions, currentCycleMeta]);

  const savingsTrajectory = useMemo((): SavingsTrajectory | null => {
    if (!currentCycleMeta) return null;
    return projectSavingsTrajectory(
      allTransactions,
      currentCycleMeta.start,
      currentCycleMeta.end
    );
  }, [allTransactions, currentCycleMeta]);

  // ─── Intelligence: year-over-year comparison ──────────────────
  const yoyComparison = useMemo((): YoYComparison | null => {
    if (!currentCycleMeta) return null;
    return compareYearOverYear(
      allTransactions,
      currentCycleMeta.start,
      currentCycleMeta.end
    );
  }, [allTransactions, currentCycleMeta]);

  // ─── Intelligence: recommendations ──────────────────────────────
  const recommendations = useMemo((): Recommendation[] => {
    if (!healthScorecard || !salaryFlow) return [];
    const { potentialDuplicates: duplicates } = computeSubscriptionData(allTransactions);
    return generateRecommendations(
      healthScorecard,
      categoryCreep,
      conveniencePremium,
      salaryFlow,
      duplicates,
      contractAlerts,
      overlappingServices,
      filteredTransactions,
    );
  }, [healthScorecard, salaryFlow, categoryCreep, conveniencePremium, allTransactions, contractAlerts, overlappingServices, filteredTransactions]);

  // Callback to reload essential merchants (called when user marks a merchant as essential)
  const reloadEssentialMerchants = useCallback(async () => {
    const merchants = await getEssentialMerchants();
    setEssentialMerchants(merchants);
  }, []);

  return {
    // Unfiltered (for upload page etc.)
    transactions: filteredTransactions,
    allTransactions,
    // Period filter
    period,
    setPeriod,
    availableCycles,
    startDate,
    endDate,
    filteredTransactions,
    // State
    loaded,
    loading,
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
    // Account hierarchy
    accountTypes,
    // Cycle metadata (includes isOpen flag)
    currentCycleMeta,
    // Intelligence
    salaryFlow,
    categoryCreep,
    conveniencePremium,
    healthScorecard,
    recommendations,
    contractAlerts,
    overlappingServices,
    categoryTrajectory,
    savingsTrajectory,
    yoyComparison,
    reloadEssentialMerchants,
  };
}
