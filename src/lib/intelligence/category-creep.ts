import type { Transaction, CategoryCreep } from '@/types';
import type { SalaryCycle } from '@/hooks/useTransactions';

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

/**
 * Detect categories where spending is creeping up compared to the
 * 3-cycle rolling average. Requires at least 4 cycles of data
 * (3 for the average + 1 current).
 *
 * Returns categories sorted by percentIncrease descending.
 */
export function detectCategoryCreep(
  allTransactions: Transaction[],
  cycles: SalaryCycle[]
): CategoryCreep[] {
  // Need at least 4 cycles (3 historical + 1 current)
  if (cycles.length < 4) return [];

  // cycles are ordered most-recent-first
  const currentCycle = cycles[0];
  const previousCycles = cycles.slice(1, 4); // 3 historical cycles

  // Compute spend per category per cycle
  function getSpendByCategory(cycle: SalaryCycle): Map<string, number> {
    const map = new Map<string, number>();
    for (const t of allTransactions) {
      if (t.date < cycle.start || t.date > cycle.end) continue;
      if (t.amount >= 0) continue;
      if (INTERNAL_CATEGORIES.has(t.category)) continue;
      map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount));
    }
    return map;
  }

  const currentSpend = getSpendByCategory(currentCycle);
  const historicalSpends = previousCycles.map(getSpendByCategory);

  // For each category in current cycle, compute rolling average and detect creep
  const results: CategoryCreep[] = [];

  for (const [category, currentAmount] of currentSpend) {
    const historicalAmounts = historicalSpends.map((m) => m.get(category) || 0);
    const nonZeroHistory = historicalAmounts.filter((a) => a > 0);

    // Need at least 2 historical data points to compute a meaningful average
    if (nonZeroHistory.length < 2) continue;

    const rollingAvg = nonZeroHistory.reduce((s, a) => s + a, 0) / nonZeroHistory.length;

    if (rollingAvg === 0) continue;

    const percentIncrease = ((currentAmount - rollingAvg) / rollingAvg) * 100;

    let trend: CategoryCreep['trend'] = 'stable';
    if (percentIncrease > 20) trend = 'rising';
    else if (percentIncrease < -20) trend = 'falling';

    // Only report categories with notable movement (>10% either way)
    if (Math.abs(percentIncrease) > 10) {
      results.push({
        category,
        currentCycleSpend: currentAmount,
        rollingAverage: Math.round(rollingAvg),
        percentIncrease: Math.round(percentIncrease * 10) / 10,
        trend,
      });
    }
  }

  return results.sort((a, b) => b.percentIncrease - a.percentIncrease);
}
