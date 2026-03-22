import type { SalaryFlow, CategoryCreep, HealthScorecard } from '@/types';
import { formatGBP } from './utils';

/**
 * Compute a monthly health scorecard (0-100) based on:
 * - Savings rate (0-25)
 * - Essential spending ratio (0-25)
 * - Category creep count (0-25)
 * - Money flow clarity (0-25)
 */
export function computeHealthScorecard(
  salaryFlow: SalaryFlow,
  categoryCreep: CategoryCreep[],
  conveniencePremiumTotal: number,
  totalIncome: number,
  totalSpending: number,
  essentialSpending: number
): HealthScorecard {
  // ── Savings rate score (0-25) ──
  const savingsRate = totalIncome > 0
    ? ((totalIncome - totalSpending) / totalIncome) * 100
    : 0;

  let savingsRateScore: number;
  if (savingsRate >= 20) savingsRateScore = 25;
  else if (savingsRate >= 10) savingsRateScore = 20;
  else if (savingsRate >= 0) savingsRateScore = 10;
  else savingsRateScore = 0;

  // ── Essential spending ratio (0-25) ──
  const essentialRatio = totalSpending > 0
    ? (essentialSpending / totalSpending) * 100
    : 0;

  let essentialScore: number;
  if (essentialRatio <= 50) essentialScore = 25;
  else if (essentialRatio <= 65) essentialScore = 20;
  else if (essentialRatio <= 80) essentialScore = 10;
  else essentialScore = 5;

  // ── Creep score (0-25) ──
  const risingCategories = categoryCreep.filter((c) => c.trend === 'rising');
  const creepCount = risingCategories.length;

  let creepScore: number;
  if (creepCount === 0) creepScore = 25;
  else if (creepCount === 1) creepScore = 20;
  else if (creepCount <= 3) creepScore = 10;
  else creepScore = 5;

  // ── Flow score (0-25) — how much of salary is accounted for ──
  const unaccountedPct = salaryFlow.totalSalary > 0
    ? (Math.abs(salaryFlow.unaccounted) / salaryFlow.totalSalary) * 100
    : 0;

  let flowScore: number;
  if (unaccountedPct <= 5) flowScore = 25;
  else if (unaccountedPct <= 10) flowScore = 20;
  else flowScore = 10;

  // ── Overall ──
  const overallScore = savingsRateScore + essentialScore + creepScore + flowScore;

  let verdict: HealthScorecard['verdict'];
  if (overallScore >= 75) verdict = 'Strong month';
  else if (overallScore >= 50) verdict = 'Watch spending';
  else verdict = 'Danger zone';

  // ── Highlights (good things) ──
  const highlights: string[] = [];
  if (savingsRate >= 20) {
    highlights.push(`Saving ${savingsRate.toFixed(0)}% of income — above the 20% target`);
  } else if (savingsRate >= 10) {
    highlights.push(`Saving ${savingsRate.toFixed(0)}% of income — on track`);
  }
  if (creepCount === 0) {
    highlights.push('No spending categories creeping up — steady habits');
  }
  const fallingCategories = categoryCreep.filter((c) => c.trend === 'falling');
  if (fallingCategories.length > 0) {
    highlights.push(
      `${fallingCategories[0].category} spending is down ${Math.abs(fallingCategories[0].percentIncrease).toFixed(0)}%`
    );
  }

  // ── Warnings (problems) ──
  const warnings: string[] = [];
  if (savingsRate < 0) {
    warnings.push(`Spending ${formatGBP(Math.abs(totalIncome - totalSpending))} more than earning this cycle`);
  } else if (savingsRate < 10) {
    warnings.push(`Savings rate is only ${savingsRate.toFixed(0)}% — target is 20%`);
  }
  for (const creep of risingCategories.slice(0, 2)) {
    warnings.push(
      `${creep.category} is up ${creep.percentIncrease.toFixed(0)}% vs 3-cycle average (${formatGBP(creep.currentCycleSpend)} vs avg ${formatGBP(creep.rollingAverage)})`
    );
  }
  if (conveniencePremiumTotal > 0) {
    const pctOfSpending = totalSpending > 0
      ? (conveniencePremiumTotal / totalSpending) * 100
      : 0;
    if (pctOfSpending > 5) {
      warnings.push(
        `Convenience spending (delivery, coffee, etc.) is ${formatGBP(conveniencePremiumTotal)} — ${pctOfSpending.toFixed(0)}% of total`
      );
    }
  }

  return {
    cycleId: salaryFlow.cycleId,
    overallScore,
    verdict,
    metrics: {
      savingsRate,
      savingsRateScore,
      essentialRatio,
      essentialScore,
      creepCount,
      creepScore,
      unaccountedPct,
      flowScore,
    },
    highlights: highlights.slice(0, 3),
    warnings: warnings.slice(0, 3),
  };
}
