'use client';

import { useMemo } from 'react';
import type { Transaction } from '@/types';

export interface CategorisationProgress {
  total: number;
  categorized: number;
  uncategorized: number;
}

/**
 * Unified advisor state — computes categorisation metrics from transactions.
 *
 * This hook does NOT call the other advisor hooks internally (that would cause
 * duplicate fetches). Instead it takes the transactions array as a parameter
 * and computes derived values. Components that need spending targets, briefings,
 * or commitments should use those hooks independently alongside this one.
 */
export function useAdvisorState(cycleId: string, transactions: Transaction[]) {
  // Count transactions that still need categorisation:
  // - category is 'Other' (the default/fallback)
  // - categorySource is NOT 'manual' (user hasn't explicitly chosen 'Other')
  // - only spending transactions (amount < 0) — income doesn't need categorisation
  const uncategorizedCount = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.amount < 0 &&
          t.category === 'Other' &&
          t.categorySource !== 'manual'
      ).length,
    [transactions]
  );

  const needsCategorization = useMemo(
    () => uncategorizedCount > 0,
    [uncategorizedCount]
  );

  const categorisationProgress = useMemo((): CategorisationProgress => {
    const spending = transactions.filter((t) => t.amount < 0);
    const total = spending.length;
    const uncategorized = spending.filter(
      (t) => t.category === 'Other' && t.categorySource !== 'manual'
    ).length;
    const categorized = total - uncategorized;
    return { total, categorized, uncategorized };
  }, [transactions]);

  return {
    uncategorizedCount,
    needsCategorization,
    categorisationProgress,
  };
}
