import type { Transaction } from '@/types';
import { formatGBP } from './utils';

export interface CategoryTrajectory {
  category: string;
  spent: number;              // pence, current cycle to date
  target: number;             // pence (0 if no target set)
  projected: number;          // pence, projected end-of-cycle total
  daysElapsed: number;
  daysRemaining: number;
  paceStatus: 'on_track' | 'watch' | 'over';
  message: string;            // "At this pace, Dining will hit £520 (target: £300)"
}

export interface SavingsTrajectory {
  savedThisCycle: number;     // pence (income - spending)
  savedYTD: number;           // pence
  projectedAnnualSavings: number; // pence
  targetAnnualSavings: number;    // pence (from user targets or default 20% of income)
  message: string;
}

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

const INCOME_CATEGORIES = new Set(['Salary']);

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Project end-of-cycle spending per category based on current pace.
 *
 * Formula: projectedSpend = (currentSpend / daysElapsed) * totalDays
 */
export function projectCategorySpending(
  transactions: Transaction[],
  cycleStart: string,
  cycleEnd: string,
  targets: Record<string, number>  // category → target amount in pence
): CategoryTrajectory[] {
  const today = todayISO();

  // Clamp today within cycle bounds
  const effectiveToday = today < cycleStart ? cycleStart : today > cycleEnd ? cycleEnd : today;

  const totalDays = daysBetween(cycleStart, cycleEnd);
  const daysElapsed = Math.max(daysBetween(cycleStart, effectiveToday), 1); // avoid division by 0
  const daysRemaining = Math.max(totalDays - daysElapsed, 0);

  // Filter to current cycle outflows
  const cycleOutflows = transactions.filter(
    (t) =>
      t.amount < 0 &&
      t.date >= cycleStart &&
      t.date <= effectiveToday &&
      !INTERNAL_CATEGORIES.has(t.category)
  );

  // Group by category
  const spendByCategory = new Map<string, number>();
  for (const t of cycleOutflows) {
    spendByCategory.set(
      t.category,
      (spendByCategory.get(t.category) || 0) + Math.abs(t.amount)
    );
  }

  const results: CategoryTrajectory[] = [];

  for (const [category, spent] of spendByCategory) {
    const target = targets[category] || 0;
    const projected = Math.round((spent / daysElapsed) * totalDays);

    let paceStatus: CategoryTrajectory['paceStatus'];
    if (target > 0) {
      if (projected <= target) paceStatus = 'on_track';
      else if (projected <= target * 1.2) paceStatus = 'watch';
      else paceStatus = 'over';
    } else {
      // No target set — can't be over, but still show projection
      paceStatus = 'on_track';
    }

    let message: string;
    if (target > 0 && paceStatus === 'over') {
      message = `At this pace, ${category} will hit ${formatGBP(projected)} (target: ${formatGBP(target)})`;
    } else if (target > 0 && paceStatus === 'watch') {
      message = `${category} is approaching the ${formatGBP(target)} target — projected ${formatGBP(projected)}`;
    } else if (target > 0) {
      message = `${category} on track: projected ${formatGBP(projected)} vs ${formatGBP(target)} target`;
    } else {
      message = `${category} projected to reach ${formatGBP(projected)} this cycle`;
    }

    results.push({
      category,
      spent,
      target,
      projected,
      daysElapsed,
      daysRemaining,
      paceStatus,
      message,
    });
  }

  // Sort: over-budget first, then by projected spend descending
  return results.sort((a, b) => {
    const statusOrder = { over: 0, watch: 1, on_track: 2 };
    const statusDiff = statusOrder[a.paceStatus] - statusOrder[b.paceStatus];
    if (statusDiff !== 0) return statusDiff;
    return b.projected - a.projected;
  });
}

/**
 * Project annual savings trajectory based on year-to-date performance.
 *
 * Uses all completed cycles in the current calendar year plus the
 * current in-progress cycle to estimate the annual savings rate.
 */
export function projectSavingsTrajectory(
  allTransactions: Transaction[],
  currentCycleStart: string,
  currentCycleEnd: string,
  targetAnnualSavings?: number  // pence
): SavingsTrajectory {
  const today = todayISO();
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;

  // Current cycle income and spending
  const cycleTransactions = allTransactions.filter(
    (t) => t.date >= currentCycleStart && t.date <= (today < currentCycleEnd ? today : currentCycleEnd)
  );

  const cycleIncome = cycleTransactions
    .filter((t) => t.amount > 0 && INCOME_CATEGORIES.has(t.category))
    .reduce((s, t) => s + t.amount, 0);

  const cycleSpending = cycleTransactions
    .filter((t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const savedThisCycle = cycleIncome - cycleSpending;

  // Year-to-date savings
  const ytdTransactions = allTransactions.filter(
    (t) => t.date >= yearStart && t.date <= today
  );

  const ytdIncome = ytdTransactions
    .filter((t) => t.amount > 0 && INCOME_CATEGORIES.has(t.category))
    .reduce((s, t) => s + t.amount, 0);

  const ytdSpending = ytdTransactions
    .filter((t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const savedYTD = ytdIncome - ytdSpending;

  // Project annual savings: scale YTD to full year
  const dayOfYear = daysBetween(yearStart, today);
  const projectedAnnualSavings = dayOfYear > 0
    ? Math.round((savedYTD / dayOfYear) * 365)
    : 0;

  // Default target: 20% of projected annual income
  const projectedAnnualIncome = dayOfYear > 0
    ? Math.round((ytdIncome / dayOfYear) * 365)
    : 0;
  const effectiveTarget = targetAnnualSavings ?? Math.round(projectedAnnualIncome * 0.20);

  let message: string;
  if (projectedAnnualSavings >= effectiveTarget && effectiveTarget > 0) {
    message = `On track to save ${formatGBP(projectedAnnualSavings)} this year (target: ${formatGBP(effectiveTarget)}). Keep it up!`;
  } else if (effectiveTarget > 0) {
    const shortfall = effectiveTarget - projectedAnnualSavings;
    const monthlyCatchUp = Math.round(shortfall / Math.max(12 - Math.floor(dayOfYear / 30.44), 1));
    message = `Projected annual savings: ${formatGBP(projectedAnnualSavings)} — ${formatGBP(shortfall)} short of ${formatGBP(effectiveTarget)} target. Save ${formatGBP(monthlyCatchUp)} more per month to catch up.`;
  } else {
    message = `Year-to-date savings: ${formatGBP(savedYTD)}. Set a target to track progress.`;
  }

  return {
    savedThisCycle,
    savedYTD,
    projectedAnnualSavings,
    targetAnnualSavings: effectiveTarget,
    message,
  };
}
