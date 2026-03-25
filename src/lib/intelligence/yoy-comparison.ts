import type { Transaction } from '@/types';
import { formatGBP } from './utils';

export interface YoYComparison {
  currentCycle: string;        // 'cycle-2026-03'
  previousYearCycle: string;   // 'cycle-2025-03'
  currentTotal: number;        // pence
  previousTotal: number;       // pence
  difference: number;          // pence (positive = spending more)
  percentChange: number;       // e.g. +14.3
  categoryChanges: {
    category: string;
    current: number;           // pence
    previous: number;          // pence
    difference: number;        // pence
    percentChange: number;
  }[];
  headline: string;            // "March 2026: £4,800 vs March 2025: £4,200. That's £600 more."
}

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getSpendByCategory(
  transactions: Transaction[],
  start: string,
  end: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.date < start || t.date > end) continue;
    if (t.amount >= 0) continue;
    if (INTERNAL_CATEGORIES.has(t.category)) continue;
    map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount));
  }
  return map;
}

/**
 * Compare current salary cycle spending to the same cycle one year ago.
 * Returns null if there is no data for the previous year's cycle.
 *
 * Salary cycles run 23rd–22nd, so "same cycle last year" means
 * the cycle starting on the 23rd of the same month, one year earlier.
 */
export function compareYearOverYear(
  allTransactions: Transaction[],
  currentCycleStart: string,
  currentCycleEnd: string
): YoYComparison | null {
  // Compute previous year cycle dates
  // currentCycleStart is e.g. '2026-03-23', previous year = '2025-03-23'
  const currentStartDate = new Date(currentCycleStart);
  const prevStartDate = new Date(currentStartDate);
  prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);

  const currentEndDate = new Date(currentCycleEnd);
  const prevEndDate = new Date(currentEndDate);
  prevEndDate.setFullYear(prevEndDate.getFullYear() - 1);

  const prevStart = prevStartDate.toISOString().slice(0, 10);
  const prevEnd = prevEndDate.toISOString().slice(0, 10);

  // Get spending for both periods
  const currentSpend = getSpendByCategory(allTransactions, currentCycleStart, currentCycleEnd);
  const previousSpend = getSpendByCategory(allTransactions, prevStart, prevEnd);

  // Bail if no previous year data
  if (previousSpend.size === 0) return null;

  const currentTotal = Array.from(currentSpend.values()).reduce((s, a) => s + a, 0);
  const previousTotal = Array.from(previousSpend.values()).reduce((s, a) => s + a, 0);
  const difference = currentTotal - previousTotal;
  const percentChange = previousTotal > 0
    ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10
    : 0;

  // Compute per-category changes
  const allCategories = new Set([...currentSpend.keys(), ...previousSpend.keys()]);
  const categoryChanges: YoYComparison['categoryChanges'] = [];

  for (const category of allCategories) {
    const current = currentSpend.get(category) || 0;
    const previous = previousSpend.get(category) || 0;
    const catDiff = current - previous;
    const catPctChange = previous > 0
      ? Math.round(((current - previous) / previous) * 1000) / 10
      : current > 0 ? 100 : 0;

    // Only include categories with meaningful changes (> £5 difference)
    if (Math.abs(catDiff) > 500) {
      categoryChanges.push({
        category,
        current,
        previous,
        difference: catDiff,
        percentChange: catPctChange,
      });
    }
  }

  // Sort by absolute difference descending
  categoryChanges.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  // Derive cycle IDs
  const currentMonth = currentCycleStart.slice(0, 7); // YYYY-MM
  const prevMonth = prevStart.slice(0, 7);
  const currentCycleId = `cycle-${currentMonth}`;
  const prevCycleId = `cycle-${prevMonth}`;

  // Build headline
  const monthIndex = parseInt(currentMonth.split('-')[1], 10) - 1;
  const monthName = MONTH_NAMES[monthIndex] || currentMonth;
  const currentYear = currentMonth.split('-')[0];
  const prevYear = prevMonth.split('-')[0];

  let headline: string;
  if (difference > 0) {
    headline = `${monthName} ${currentYear}: ${formatGBP(currentTotal)} vs ${monthName} ${prevYear}: ${formatGBP(previousTotal)}. That's ${formatGBP(difference)} more (+${Math.abs(percentChange)}%).`;
  } else if (difference < 0) {
    headline = `${monthName} ${currentYear}: ${formatGBP(currentTotal)} vs ${monthName} ${prevYear}: ${formatGBP(previousTotal)}. That's ${formatGBP(Math.abs(difference))} less (${percentChange}%). Well done!`;
  } else {
    headline = `${monthName} ${currentYear}: ${formatGBP(currentTotal)} — same as ${monthName} ${prevYear}.`;
  }

  return {
    currentCycle: currentCycleId,
    previousYearCycle: prevCycleId,
    currentTotal,
    previousTotal,
    difference,
    percentChange,
    categoryChanges,
    headline,
  };
}
