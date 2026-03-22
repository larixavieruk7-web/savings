import type { SalaryFlow, CategoryCreep, HealthScorecard, Recommendation } from '@/types';
import type { ConveniencePremium } from './convenience-premium';
import type { PotentialDuplicate } from '../subscriptions';
import { formatGBP } from './utils';

/**
 * Generate prescriptive recommendations based on all intelligence signals.
 * Pure computation — no AI calls.
 */
export function generateRecommendations(
  scorecard: HealthScorecard,
  categoryCreep: CategoryCreep[],
  conveniencePremium: { items: ConveniencePremium[]; totalPremium: number },
  salaryFlow: SalaryFlow,
  duplicateSubscriptions: PotentialDuplicate[]
): Recommendation[] {
  const recs: Recommendation[] = [];

  // ── Savings rate ──
  if (scorecard.metrics.savingsRate < 0) {
    recs.push({
      id: 'savings-negative',
      severity: 'urgent',
      title: 'Spending more than you earn',
      detail: `You're £${(Math.abs(scorecard.metrics.savingsRate) * salaryFlow.totalSalary / 10000).toFixed(0)} in the red this cycle. Review categories below to find cuts.`,
      potentialSaving: 0,
      actionType: 'review',
    });
  } else if (scorecard.metrics.savingsRate < 10) {
    recs.push({
      id: 'savings-low',
      severity: 'warning',
      title: `Savings rate is ${scorecard.metrics.savingsRate.toFixed(0)}% — target 20%`,
      detail: `You need to save an extra ${formatGBP(salaryFlow.totalSalary * 0.10 / 100)} per cycle to hit 20%.`,
      potentialSaving: Math.round(salaryFlow.totalSalary * 0.10),
      actionType: 'reduce',
    });
  } else if (scorecard.metrics.savingsRate >= 25) {
    recs.push({
      id: 'savings-great',
      severity: 'info',
      title: `Saving ${scorecard.metrics.savingsRate.toFixed(0)}% — excellent`,
      detail: 'You\'re above the 20% target. Consider channelling the extra into investments or an emergency fund.',
      potentialSaving: 0,
      actionType: 'celebrate',
    });
  }

  // ── Category creep ──
  const risingCategories = categoryCreep.filter((c) => c.trend === 'rising');
  for (const creep of risingCategories.slice(0, 3)) {
    const excess = creep.currentCycleSpend - creep.rollingAverage;
    recs.push({
      id: `creep-${creep.category.toLowerCase().replace(/\s+/g, '-')}`,
      severity: creep.percentIncrease > 50 ? 'urgent' : 'warning',
      title: `${creep.category} up ${creep.percentIncrease.toFixed(0)}%`,
      detail: `Spending ${formatGBP(creep.currentCycleSpend)} this cycle vs ${formatGBP(creep.rollingAverage)} average. That's ${formatGBP(excess)} over.`,
      category: creep.category,
      potentialSaving: excess,
      actionType: 'reduce',
    });
  }

  // ── Convenience premium ──
  if (conveniencePremium.totalPremium > 5000) { // > £50
    recs.push({
      id: 'convenience-premium',
      severity: conveniencePremium.totalPremium > 20000 ? 'warning' : 'info',
      title: `${formatGBP(conveniencePremium.totalPremium)} on convenience`,
      detail: `Delivery, coffee shops, and convenience stores add up. Top: ${conveniencePremium.items.slice(0, 3).map((i) => `${i.merchant} (${formatGBP(i.totalSpend)})`).join(', ')}.`,
      potentialSaving: Math.round(conveniencePremium.totalPremium * 0.5), // estimate 50% saveable
      actionType: 'reduce',
    });
  }

  // ── Duplicate subscriptions ──
  for (const dup of duplicateSubscriptions.slice(0, 2)) {
    recs.push({
      id: `dup-${dup.merchant.toLowerCase().replace(/\s+/g, '-')}`,
      severity: 'urgent',
      title: `Duplicate: ${dup.merchant} on ${dup.accounts.length} accounts`,
      detail: `Cancel on all but one account to save ~${formatGBP(dup.wastedMonthlyPence)}/month.`,
      merchant: dup.merchant,
      potentialSaving: dup.wastedMonthlyPence,
      actionType: 'cancel',
    });
  }

  // ── Unaccounted money ──
  if (scorecard.metrics.unaccountedPct > 10 && salaryFlow.unaccounted > 10000) { // > £100
    recs.push({
      id: 'unaccounted-money',
      severity: 'info',
      title: `${formatGBP(Math.abs(salaryFlow.unaccounted))} unaccounted`,
      detail: `${scorecard.metrics.unaccountedPct.toFixed(0)}% of salary can't be traced. Upload all bank statements to close the gap.`,
      potentialSaving: 0,
      actionType: 'review',
    });
  }

  return recs.sort((a, b) => {
    const severity = { urgent: 0, warning: 1, info: 2 };
    return severity[a.severity] - severity[b.severity];
  });
}
