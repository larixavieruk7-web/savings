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
import type { Transaction, MonthlyBreakdown, PeriodOption, AccountConfig, SalaryFlow, CategoryCreep, HealthScorecard, Recommendation } from '@/types';
import { format, parseISO, addMonths, setDate, subMonths } from 'date-fns';
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
  id: string;    // 'cycle-2026-02'
  label: string; // 'Feb 2026'
  start: string; // '2026-02-26' ISO date
  end: string;   // '2026-03-25' ISO date
}

// Salary cycle boundary: 23rd of each month.
// UK employers pay "around the 26th" but shift earlier for weekends/holidays.
// Dec 25 = Christmas, Dec 26 = Boxing Day → salary lands Dec 23-24.
// Using the 23rd gives a 3-day buffer to catch early payments.
const CYCLE_START_DAY = 23;

/** Salary cycles run from the 23rd of one month to the 22nd of the next */
function buildCycle(year: number, month: number): SalaryCycle {
  // month is 1-based
  const startDate = setDate(new Date(year, month - 1, 1), CYCLE_START_DAY);
  const endDate = setDate(addMonths(new Date(year, month - 1, 1), 1), CYCLE_START_DAY - 1);
  const id = `cycle-${format(startDate, 'yyyy-MM')}`;
  const label = format(startDate, 'MMM yyyy');
  return {
    id,
    label,
    start: format(startDate, 'yyyy-MM-dd'),
    end: format(endDate, 'yyyy-MM-dd'),
  };
}

function getCurrentCycle(): SalaryCycle {
  const now = new Date();
  const cycleStartMonth = now.getDate() >= CYCLE_START_DAY
    ? now
    : subMonths(now, 1);
  return buildCycle(cycleStartMonth.getFullYear(), cycleStartMonth.getMonth() + 1);
}

function getAvailableCycles(transactions: Transaction[]): SalaryCycle[] {
  if (transactions.length === 0) return [getCurrentCycle()];

  const dates = transactions.map((t) => t.date).sort();
  const earliest = parseISO(dates[0]);

  const startYear = earliest.getFullYear();
  const startMonth = earliest.getMonth() + 1;
  const cycleStartMonth = earliest.getDate() >= CYCLE_START_DAY
    ? new Date(startYear, startMonth - 1, 1)
    : subMonths(new Date(startYear, startMonth - 1, 1), 1);

  const current = getCurrentCycle();
  const cycles: SalaryCycle[] = [];
  let cursor = cycleStartMonth;

  while (true) {
    const cycle = buildCycle(cursor.getFullYear(), cursor.getMonth() + 1);
    cycles.push(cycle);
    if (cycle.id === current.id) break;
    cursor = addMonths(cursor, 1);
    // Safety: don't go past current
    if (cursor > new Date()) break;
  }

  return cycles.reverse(); // most recent first
}

function getCycleBoundaries(period: PeriodOption): { start: string | null; end: string | null } {
  if (period === 'all') return { start: null, end: null };
  if (period.startsWith('cycle-')) {
    const [, yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const cycle = buildCycle(year, month);
    return { start: cycle.start, end: cycle.end };
  }
  return { start: null, end: null };
}

export function useTransactions() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>(getCurrentCycle().id);
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
    const merged = await mergeTransactions(incoming);
    setAllTransactions(merged);
    return merged;
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

  // Available salary cycles, derived from all loaded transactions
  const availableCycles = useMemo(
    () => getAvailableCycles(allTransactions),
    [allTransactions]
  );

  // Derive period date boundaries from cycle or 'all'
  const { start: startDate, end: endDate } = useMemo(
    () => getCycleBoundaries(period),
    [period]
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
