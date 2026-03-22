'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, TrendingDown, ChevronDown, ChevronUp, Scissors, X } from 'lucide-react';
import { formatGBP } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import type { CategoryName, Transaction, MonthlyBreakdown, CategoryCreep } from '@/types';

// ─── Overspending Alert Banner ─────────────────────────────────────

interface OverspendingAlertProps {
  totalIncome: number;
  totalSpending: number;
  monthlyBreakdowns: MonthlyBreakdown[];
}

export function OverspendingAlert({
  totalIncome,
  totalSpending,
  monthlyBreakdowns,
}: OverspendingAlertProps) {
  const deficit = totalSpending - totalIncome;
  const isOverspending = deficit > 0;

  // Count how many months out of the visible data are overspent
  const overspentMonths = monthlyBreakdowns.filter((m) => m.spending > m.income);
  const streak = overspentMonths.length;
  const totalMonths = monthlyBreakdowns.length;

  // Cumulative deficit across all visible months
  const cumulativeDeficit = monthlyBreakdowns.reduce(
    (sum, m) => sum + Math.max(m.spending - m.income, 0),
    0
  );

  if (!isOverspending || totalIncome === 0) return null;

  const deficitPct = ((deficit / totalIncome) * 100).toFixed(0);
  const isChronicOverspend = streak >= 3;
  const isCritical = streak >= 6;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-5 ${
        isCritical
          ? 'bg-red-950/40 border-red-500/50'
          : isChronicOverspend
            ? 'bg-red-950/25 border-red-500/30'
            : 'bg-amber-950/20 border-amber-500/30'
      }`}
    >
      {/* Pulse glow for critical */}
      {isCritical && (
        <div className="absolute inset-0 rounded-xl animate-pulse bg-red-500/5 pointer-events-none" />
      )}

      <div className="relative flex items-start gap-4">
        <div
          className={`shrink-0 p-2.5 rounded-lg ${
            isCritical
              ? 'bg-red-500/20'
              : isChronicOverspend
                ? 'bg-red-500/15'
                : 'bg-amber-500/15'
          }`}
        >
          <AlertTriangle
            className={`h-6 w-6 ${
              isCritical ? 'text-red-400' : isChronicOverspend ? 'text-red-400' : 'text-amber-400'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className={`text-base font-bold ${
              isCritical ? 'text-red-300' : isChronicOverspend ? 'text-red-300' : 'text-amber-300'
            }`}
          >
            {isCritical
              ? 'Critical: Persistent Overspending'
              : isChronicOverspend
                ? 'Warning: Repeated Overspending'
                : 'Spending Exceeds Income'}
          </h3>

          <p className="text-sm text-muted mt-1">
            You&rsquo;re spending{' '}
            <span className="text-foreground font-semibold">{formatGBP(deficit)}</span>{' '}
            more than your salary this cycle ({deficitPct}% over).
            {streak > 1 && (
              <>
                {' '}This has happened in{' '}
                <span className="text-foreground font-semibold">
                  {streak} of {totalMonths}
                </span>{' '}
                months visible.
              </>
            )}
          </p>

          {/* Key numbers */}
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="bg-black/20 rounded-lg px-3.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-0.5">This Cycle Deficit</p>
              <p className="text-lg font-bold text-red-400">{formatGBP(deficit)}</p>
            </div>
            {cumulativeDeficit > deficit && (
              <div className="bg-black/20 rounded-lg px-3.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted mb-0.5">
                  Cumulative Deficit
                </p>
                <p className="text-lg font-bold text-red-400">{formatGBP(cumulativeDeficit)}</p>
              </div>
            )}
            <div className="bg-black/20 rounded-lg px-3.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Monthly Avg Excess</p>
              <p className="text-lg font-bold text-red-400">
                {formatGBP(streak > 0 ? Math.round(cumulativeDeficit / streak) : deficit)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── "Stop the Bleeding" Panel ─────────────────────────────────────

interface StopTheBleedingProps {
  transactions: Transaction[];
  totalIncome: number;
  totalSpending: number;
  categoryBreakdown: { category: string; amount: number }[];
  categoryCreep: CategoryCreep[];
}

interface CuttableCategory {
  category: string;
  amount: number;
  pctOfSpending: number;
  isEssential: boolean;
  cuttability: 'high' | 'medium' | 'low';
  suggestion: string;
  topMerchants: { name: string; total: number; count: number }[];
  creepData?: CategoryCreep;
}

// Categories that are typically essential / non-negotiable
const ESSENTIAL_CATEGORIES = new Set([
  'Rent / Mortgage',
  'Utilities',
  'Council Tax',
  'Insurance',
  'Debt Repayments',
  'Childcare',
]);

const HIGH_CUT_CATEGORIES = new Set([
  'Dining Out',
  'Entertainment',
  'Shopping',
  'Subscriptions',
  'Personal Care',
  'Gifts',
]);

function getCuttability(category: string): 'high' | 'medium' | 'low' {
  if (ESSENTIAL_CATEGORIES.has(category)) return 'low';
  if (HIGH_CUT_CATEGORIES.has(category)) return 'high';
  return 'medium';
}

function getSuggestion(category: string, amount: number, topMerchant: string): string {
  const monthly = formatGBP(amount);
  switch (category) {
    case 'Dining Out':
      return `${monthly} on eating out/takeaways. Cook more meals at home — even halving this saves ${formatGBP(Math.round(amount / 2))}/month.`;
    case 'Subscriptions':
      return `${monthly} on subscriptions. Review each one — cancel what you don't use weekly. ${topMerchant ? `Biggest: ${topMerchant}.` : ''}`;
    case 'Shopping':
      return `${monthly} on shopping. Implement a 48-hour rule — wait before non-essential purchases.`;
    case 'Entertainment':
      return `${monthly} on entertainment. Look for free alternatives and set a monthly entertainment budget.`;
    case 'Transport':
      return `${monthly} on transport. Consider batch errands, car-sharing, or public transport where possible.`;
    case 'Groceries':
      return `${monthly} on groceries. Switch to budget supermarkets, meal plan, and avoid convenience stores.`;
    case 'Personal Care':
      return `${monthly} on personal care. Space out appointments and look for loyalty deals.`;
    case 'Gifts':
      return `${monthly} on gifts. Set a gift budget and consider homemade or experience-based gifts.`;
    default:
      return `${monthly} on ${category}. Review if all transactions here are necessary.`;
  }
}

export function StopTheBleeding({
  transactions,
  totalIncome,
  totalSpending,
  categoryBreakdown,
  categoryCreep,
}: StopTheBleedingProps) {
  const [expanded, setExpanded] = useState(false);
  const deficit = totalSpending - totalIncome;
  const isOverspending = deficit > 0 && totalIncome > 0;

  const cuttableCategories = useMemo((): CuttableCategory[] => {
    // Build merchant breakdown per category
    const merchantsByCategory = new Map<string, Map<string, { total: number; count: number }>>();

    for (const t of transactions) {
      if (t.amount >= 0 || !t.merchantName) continue;
      const cat = t.category;
      if (!merchantsByCategory.has(cat)) merchantsByCategory.set(cat, new Map());
      const merchants = merchantsByCategory.get(cat)!;
      const key = t.merchantName.toUpperCase();
      if (!merchants.has(key)) merchants.set(key, { total: 0, count: 0 });
      const m = merchants.get(key)!;
      m.total += Math.abs(t.amount);
      m.count++;
    }

    const creepMap = new Map(categoryCreep.map((c) => [c.category, c]));

    return categoryBreakdown
      .filter(({ category }) => !new Set(['Transfers', 'Savings & Investments']).has(category))
      .map(({ category, amount }) => {
        const merchants = merchantsByCategory.get(category);
        const topMerchants = merchants
          ? Array.from(merchants.entries())
              .sort(([, a], [, b]) => b.total - a.total)
              .slice(0, 3)
              .map(([name, data]) => ({ name, ...data }))
          : [];

        const cuttability = getCuttability(category);
        const topMerchantName = topMerchants[0]?.name || '';

        return {
          category,
          amount,
          pctOfSpending: totalSpending > 0 ? (amount / totalSpending) * 100 : 0,
          isEssential: ESSENTIAL_CATEGORIES.has(category),
          cuttability,
          suggestion: getSuggestion(category, amount, topMerchantName),
          topMerchants,
          creepData: creepMap.get(category),
        };
      })
      // Sort: high cuttability first, then by amount
      .sort((a, b) => {
        const cutOrder = { high: 0, medium: 1, low: 2 };
        if (cutOrder[a.cuttability] !== cutOrder[b.cuttability]) {
          return cutOrder[a.cuttability] - cutOrder[b.cuttability];
        }
        return b.amount - a.amount;
      });
  }, [transactions, categoryBreakdown, categoryCreep, totalSpending]);

  // Calculate how much "high cuttability" spending there is
  const highCutTotal = cuttableCategories
    .filter((c) => c.cuttability === 'high')
    .reduce((s, c) => s + c.amount, 0);

  const mediumCutTotal = cuttableCategories
    .filter((c) => c.cuttability === 'medium')
    .reduce((s, c) => s + c.amount, 0);

  if (cuttableCategories.length === 0) return null;

  const displayItems = expanded ? cuttableCategories : cuttableCategories.slice(0, 5);

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-card-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Scissors className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">
              Where to Cut
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Discretionary spending ranked by cuttability
              {isOverspending && (
                <> — you need to find <span className="text-red-400 font-medium">{formatGBP(deficit)}</span> in savings</>
              )}
            </p>
          </div>
        </div>

        {/* Quick summary chips */}
        <div className="flex gap-3 mt-3">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-red-400/70 mb-0.5">Easy Cuts</p>
            <p className="text-sm font-bold text-red-400">{formatGBP(highCutTotal)}</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-0.5">Reducible</p>
            <p className="text-sm font-bold text-amber-400">{formatGBP(mediumCutTotal)}</p>
          </div>
          {isOverspending && highCutTotal >= deficit && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5 flex items-center">
              <p className="text-xs text-green-400 font-medium">
                Easy cuts alone can close the gap
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Category list */}
      <div className="divide-y divide-card-border">
        {displayItems.map((item) => {
          const color = CATEGORY_COLORS[item.category as CategoryName] || '#a1a1aa';
          const cutBadgeColor =
            item.cuttability === 'high'
              ? 'bg-red-500/15 text-red-400 border-red-500/25'
              : item.cuttability === 'medium'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25';

          return (
            <div key={item.category} className="px-5 py-3.5 hover:bg-[#111118]/50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{item.category}</span>
                      <span
                        className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${cutBadgeColor}`}
                      >
                        {item.cuttability === 'high'
                          ? 'Cut'
                          : item.cuttability === 'medium'
                            ? 'Reduce'
                            : 'Fixed'}
                      </span>
                      {item.creepData && item.creepData.trend === 'rising' && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                          +{item.creepData.percentIncrease.toFixed(0)}% vs avg
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{item.suggestion}</p>
                    {/* Top merchants */}
                    {item.topMerchants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {item.topMerchants.map((m) => (
                          <span
                            key={m.name}
                            className="text-[10px] bg-[#111118] border border-card-border rounded px-1.5 py-0.5 text-muted"
                          >
                            {m.name} · {formatGBP(m.total)} ({m.count}x)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">{formatGBP(item.amount)}</p>
                  <p className="text-xs text-muted">{item.pctOfSpending.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand/collapse */}
      {cuttableCategories.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-3 text-center text-xs text-muted hover:text-foreground transition-colors border-t border-card-border flex items-center justify-center gap-1.5"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show all {cuttableCategories.length} categories <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
