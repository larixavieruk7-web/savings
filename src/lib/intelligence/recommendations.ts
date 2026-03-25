import type { SalaryFlow, CategoryCreep, HealthScorecard, Recommendation, Transaction } from '@/types';
import type { ConveniencePremium } from './convenience-premium';
import type { ContractAlert } from './contract-alerts';
import type { OverlappingService } from './overlapping-services';
import type { PotentialDuplicate } from '../subscriptions';
import { formatGBP } from './utils';

/**
 * Generate prescriptive recommendations based on all intelligence signals.
 * Pure computation — no AI calls.
 *
 * Now attaches transaction evidence to each recommendation so users can
 * click through and see what's behind the advice.
 */
export function generateRecommendations(
  scorecard: HealthScorecard,
  categoryCreep: CategoryCreep[],
  conveniencePremium: { items: ConveniencePremium[]; totalPremium: number },
  salaryFlow: SalaryFlow,
  duplicateSubscriptions: PotentialDuplicate[],
  contractAlerts?: ContractAlert[],
  overlappingServices?: OverlappingService[],
  allTransactions?: Transaction[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  const txns = allTransactions ?? [];

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

    // Find top merchants driving the creep
    const categoryTxns = txns.filter(
      (t) => t.amount < 0 && t.category === creep.category
    );
    const merchantTotals = new Map<string, number>();
    for (const t of categoryTxns) {
      const m = t.merchantName || t.description;
      merchantTotals.set(m, (merchantTotals.get(m) || 0) + Math.abs(t.amount));
    }
    const topMerchants = Array.from(merchantTotals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([m]) => m);

    recs.push({
      id: `creep-${creep.category.toLowerCase().replace(/\s+/g, '-')}`,
      severity: creep.percentIncrease > 50 ? 'urgent' : 'warning',
      title: `${creep.category} up ${creep.percentIncrease.toFixed(0)}%`,
      detail: `Spending ${formatGBP(creep.currentCycleSpend)} this cycle vs ${formatGBP(creep.rollingAverage)} average. That's ${formatGBP(excess)} over.`,
      category: creep.category,
      potentialSaving: excess,
      actionType: 'reduce',
      evidence: {
        relatedMerchants: topMerchants,
        transactions: categoryTxns
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8)
          .map((t) => ({
            date: t.date,
            description: t.merchantName || t.description,
            amount: Math.abs(t.amount),
            account: t.accountName || t.source || 'Unknown',
          })),
      },
    });
  }

  // ── Convenience premium ──
  if (conveniencePremium.totalPremium > 5000) { // > £50
    recs.push({
      id: 'convenience-premium',
      severity: conveniencePremium.totalPremium > 20000 ? 'warning' : 'info',
      title: `${formatGBP(conveniencePremium.totalPremium)} on convenience`,
      detail: `Delivery, coffee shops, and convenience stores add up. Top: ${conveniencePremium.items.slice(0, 3).map((i) => `${i.merchant} (${formatGBP(i.totalSpend)})`).join(', ')}.`,
      potentialSaving: Math.round(conveniencePremium.totalPremium * 0.5),
      actionType: 'reduce',
      evidence: {
        relatedMerchants: conveniencePremium.items.slice(0, 8).map((i) => i.merchant),
        transactions: conveniencePremium.items
          .slice(0, 8)
          .map((i) => ({
            date: '',
            description: i.merchant,
            amount: i.totalSpend,
            account: '',
          })),
      },
    });
  }

  // ── Duplicate subscriptions ──
  for (const dup of duplicateSubscriptions.slice(0, 3)) {
    // Find the actual transactions for this merchant across accounts
    const dupTxns = txns.filter((t) => {
      const m = (t.merchantName || t.description).toUpperCase();
      return t.amount < 0 && m.includes(dup.merchant.toUpperCase().slice(0, 15));
    });

    recs.push({
      id: `dup-${dup.merchant.toLowerCase().replace(/\s+/g, '-')}`,
      severity: 'urgent',
      title: `Duplicate: ${dup.merchant} on ${dup.accounts.length} accounts`,
      detail: `Cancel on all but one account to save ~${formatGBP(dup.wastedMonthlyPence)}/month.`,
      merchant: dup.merchant,
      potentialSaving: dup.wastedMonthlyPence,
      actionType: 'cancel',
      evidence: {
        accounts: dup.accounts.map((a) => a.account),
        transactions: dupTxns
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 10)
          .map((t) => ({
            date: t.date,
            description: t.merchantName || t.description,
            amount: Math.abs(t.amount),
            account: t.accountName || t.source || 'Unknown',
          })),
      },
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

  // ── Contract alerts (12+ month recurring charges) ──
  if (contractAlerts && contractAlerts.length > 0) {
    for (const alert of contractAlerts.slice(0, 5)) {
      const isEssential = alert.isEssential;

      recs.push({
        id: `contract-${alert.merchant.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}`,
        severity: isEssential
          ? 'info'  // essential items are informational, not warnings
          : (alert.monthlyAmount > 3000 ? 'warning' : 'info'),
        title: isEssential
          ? `${alert.merchant}: ${formatGBP(alert.monthlyAmount)}/month`
          : `${alert.merchant}: ${formatGBP(alert.monthlyAmount)}/month for ${alert.months} months`,
        detail: isEssential
          ? (alert.essentialAdvice || alert.suggestion)
          : `${alert.suggestion} Total paid: ${formatGBP(alert.totalPaid)}. ${alert.estimatedSaving}.`,
        merchant: alert.merchant,
        potentialSaving: isEssential
          ? 0  // don't suggest savings for mortgage/loans
          : Math.round(alert.monthlyAmount * 0.2),
        actionType: isEssential ? 'review' : 'switch',
        isEssential,
        essentialAdvice: alert.essentialAdvice,
        evidence: {
          transactions: alert.recentTransactions,
          monthlyBreakdown: Array.from({ length: Math.min(alert.months, 6) }).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return { month: d.toISOString().slice(0, 7), amount: alert.monthlyAmount };
          }).reverse(),
        },
      });
    }
  }

  // ── Overlapping services ──
  if (overlappingServices && overlappingServices.length > 0) {
    for (const overlap of overlappingServices) {
      const cheapest = Math.min(...overlap.services.map((s) => s.monthlyAmount));
      const potentialSaving = overlap.totalMonthly - cheapest;

      // Build consolidation suggestion
      const sorted = [...overlap.services].sort((a, b) => a.monthlyAmount - b.monthlyAmount);
      const keepList = sorted.slice(0, Math.min(2, sorted.length)).map((s) => s.merchant).join(' + ');
      const dropList = sorted.slice(2).map((s) => `${s.merchant} (${formatGBP(s.monthlyAmount)}/mo)`).join(', ');

      const consolidationDetail = sorted.length > 2
        ? `Keep ${keepList}, consider dropping ${dropList}. Save ~${formatGBP(potentialSaving)}/month.`
        : overlap.suggestion;

      recs.push({
        id: `overlap-${overlap.serviceType.toLowerCase().replace(/\s+/g, '-')}`,
        severity: overlap.services.length >= 3 ? 'warning' : 'info',
        title: `${overlap.services.length} ${overlap.serviceType} services`,
        detail: consolidationDetail,
        potentialSaving,
        actionType: 'cancel',
        evidence: {
          serviceType: overlap.serviceType,
          relatedMerchants: overlap.services.map((s) => s.merchant),
          transactions: overlap.services.map((s) => ({
            date: '',
            description: s.merchant,
            amount: s.monthlyAmount,
            account: s.account,
          })),
        },
      });
    }
  }

  return recs.sort((a, b) => {
    const severity = { urgent: 0, warning: 1, info: 2 };
    return severity[a.severity] - severity[b.severity];
  });
}
