'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Loader2, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Target, Sparkles } from 'lucide-react';
import { useTransactionContext } from '@/context/transactions';
import { getAnalysisForCycle, saveMonthlyAnalysis } from '@/lib/storage';
import type { Transaction } from '@/types';

const INTERNAL_CATEGORIES = new Set(['Transfers', 'Savings & Investments']);

interface Analysis {
  summary: string;
  monthGrade: string;
  topInsight: string;
  spendingPatterns: { pattern: string; impact: string; recommendation: string; urgency: string }[];
  pushBack: { area: string; message: string; suggestedAction: string }[];
  savingsOpportunities: { opportunity: string; estimatedSaving: string; difficulty: string; howTo: string }[];
  positives: string[];
  warnings: string[];
  nextMonthTarget: string;
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function AIAnalysis() {
  const {
    transactions,
    totalIncome,
    totalSpending,
    essentialSpending,
    discretionarySpending,
    categoryBreakdown,
    merchantBreakdown,
    salaryFlow,
    categoryCreep,
    conveniencePremium,
    period,
  } = useTransactionContext();

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastAnalysedAt, setLastAnalysedAt] = useState<string | null>(null);

  // Load cached analysis for current cycle
  useEffect(() => {
    if (!period || period === 'all') return;
    const cached = getAnalysisForCycle(period);
    if (cached) {
      setAnalysis(cached.analysis as unknown as Analysis);
      setLastAnalysedAt(cached.analysedAt);
    } else {
      setAnalysis(null);
      setLastAnalysedAt(null);
    }
  }, [period]);

  const runAnalysis = useCallback(async () => {
    if (loading || transactions.length === 0) return;
    setLoading(true);
    setError('');

    try {
      const savingsRate = totalIncome > 0
        ? ((totalIncome - totalSpending) / totalIncome) * 100
        : 0;

      // Build category breakdown with transaction counts
      const catMap = new Map<string, { amount: number; count: number }>();
      for (const t of transactions) {
        if (t.amount >= 0 || INTERNAL_CATEGORIES.has(t.category)) continue;
        const entry = catMap.get(t.category) || { amount: 0, count: 0 };
        entry.amount += Math.abs(t.amount);
        entry.count++;
        catMap.set(t.category, entry);
      }
      const categories = Array.from(catMap.entries())
        .map(([category, { amount, count }]) => ({ category, amount, txnCount: count }))
        .sort((a, b) => b.amount - a.amount);

      // Build merchant breakdown with category
      const merchantCatMap = new Map<string, string>();
      for (const t of transactions) {
        if (t.merchantName && t.amount < 0) {
          merchantCatMap.set(t.merchantName.toUpperCase(), t.category);
        }
      }
      const merchants = merchantBreakdown.slice(0, 25).map((m) => ({
        merchant: m.merchant,
        amount: m.total,
        count: m.count,
        category: merchantCatMap.get(m.merchant) || 'Other',
      }));

      // Card breakdown
      const cardMap = new Map<string, { amount: number; count: number }>();
      for (const t of transactions) {
        if (t.amount >= 0 || INTERNAL_CATEGORIES.has(t.category)) continue;
        const card = t.accountName || 'Unknown';
        const entry = cardMap.get(card) || { amount: 0, count: 0 };
        entry.amount += Math.abs(t.amount);
        entry.count++;
        cardMap.set(card, entry);
      }
      const cardBreakdown = Array.from(cardMap.entries())
        .map(([card, data]) => ({ card, ...data }))
        .sort((a, b) => b.amount - a.amount);

      // Top 50 transactions by amount
      const topTransactions = [...transactions]
        .filter((t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 50)
        .map((t) => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          category: t.category,
          account: t.accountName || 'Unknown',
        }));

      // Get previous analysis summary for trend tracking
      const previousAnalyses = getAnalysisForCycle(period);
      const previousSummary = previousAnalyses?.analysis
        ? (previousAnalyses.analysis as unknown as Analysis).summary
        : undefined;

      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleLabel: period,
          totalIncome,
          totalSpending,
          essentialSpending,
          discretionarySpending,
          savingsRate,
          categories,
          merchants,
          cardBreakdown,
          salaryFlow: salaryFlow ? {
            totalSalary: salaryFlow.totalSalary,
            creditCardPayments: salaryFlow.creditCardPayments,
            savingsContributions: salaryFlow.savingsContributions,
            directDebits: salaryFlow.directDebits,
            directSpending: salaryFlow.directSpending,
          } : undefined,
          categoryCreep: categoryCreep.filter((c) => c.trend !== 'stable').map((c) => ({
            category: c.category,
            current: c.currentCycleSpend,
            average: c.rollingAverage,
            pctChange: c.percentIncrease,
          })),
          convenienceTotal: conveniencePremium.totalPremium,
          convenienceItems: conveniencePremium.items.map((i) => ({
            merchant: i.merchant,
            amount: i.totalSpend,
            count: i.transactionCount,
          })),
          previousSummary,
          topTransactions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');

      setAnalysis(data.analysis);
      setLastAnalysedAt(new Date().toISOString());
      saveMonthlyAnalysis(period, data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [loading, transactions, totalIncome, totalSpending, essentialSpending, discretionarySpending,
      categoryBreakdown, merchantBreakdown, salaryFlow, categoryCreep, conveniencePremium, period]);

  if (period === 'all') return null;

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-semibold text-foreground">AI Financial Analysis</h3>
          {analysis?.monthGrade && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold">
              {analysis.monthGrade}
            </span>
          )}
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || transactions.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing...</>
          ) : analysis ? (
            <><RefreshCw className="h-3.5 w-3.5" /> Re-analyse</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" /> Run Analysis</>
          )}
        </button>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-950/30 border-b border-red-900/30">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Analysis content */}
      {analysis ? (
        <div className="p-6 space-y-5">
          {/* Summary */}
          <div>
            <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
            {lastAnalysedAt && (
              <p className="text-[10px] text-muted mt-1.5">
                Analysed {new Date(lastAnalysedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {/* Top insight */}
          {analysis.topInsight && (
            <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-accent mb-0.5">Key Insight</p>
              <p className="text-sm text-foreground">{analysis.topInsight}</p>
            </div>
          )}

          {/* Push back */}
          {analysis.pushBack && analysis.pushBack.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">Push Back</p>
              </div>
              <div className="space-y-2">
                {analysis.pushBack.map((pb, i) => (
                  <div key={i} className="bg-amber-950/20 border border-amber-900/30 rounded-lg px-4 py-3">
                    <p className="text-xs text-amber-300 font-medium mb-1">{pb.area}</p>
                    <p className="text-sm text-foreground">{pb.message}</p>
                    <p className="text-xs text-muted mt-1.5">Action: {pb.suggestedAction}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Savings opportunities */}
          {analysis.savingsOpportunities && analysis.savingsOpportunities.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className="h-3.5 w-3.5 text-success" />
                <p className="text-xs font-medium text-success uppercase tracking-wider">Savings Opportunities</p>
              </div>
              <div className="space-y-2">
                {analysis.savingsOpportunities.map((opp, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 bg-[#111118] rounded-lg px-4 py-3 border border-card-border">
                    <div>
                      <p className="text-sm text-foreground">{opp.opportunity}</p>
                      <p className="text-xs text-muted mt-0.5">{opp.howTo}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-success">~£{opp.estimatedSaving}/mo</p>
                      <p className="text-[10px] text-muted">{opp.difficulty}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positives + Warnings grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.positives && analysis.positives.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-success" />
                  <p className="text-xs font-medium text-success uppercase tracking-wider">What went well</p>
                </div>
                <ul className="space-y-1">
                  {analysis.positives.map((p, i) => (
                    <li key={i} className="text-xs text-muted flex items-start gap-2">
                      <span className="text-success mt-0.5">+</span> {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.warnings && analysis.warnings.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                  <p className="text-xs font-medium text-danger uppercase tracking-wider">Watch out</p>
                </div>
                <ul className="space-y-1">
                  {analysis.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-muted flex items-start gap-2">
                      <span className="text-danger mt-0.5">!</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Next month target */}
          {analysis.nextMonthTarget && (
            <div className="bg-[#111118] rounded-lg px-4 py-3 border border-card-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="h-3.5 w-3.5 text-accent" />
                <p className="text-xs font-medium text-accent">Next Month Target</p>
              </div>
              <p className="text-sm text-foreground">{analysis.nextMonthTarget}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-6 py-10 text-center">
          <Brain className="h-10 w-10 text-muted mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted mb-1">No analysis yet for this cycle</p>
          <p className="text-xs text-muted">
            Click <span className="text-accent font-medium">Run Analysis</span> to get AI-powered insights on your spending
          </p>
        </div>
      )}
    </div>
  );
}
