'use client';

import { useState, useEffect } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { formatGBP } from '@/lib/utils';
import {
  Brain,
  Upload,
  Loader2,
  AlertTriangle,
  TrendingDown,
  Search,
  Target,
  Sparkles,
  RefreshCw,
  Scissors,
  ArrowRightLeft,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { getCachedInsights, cacheInsights, getSavingsTargets, saveSavingsTargets } from '@/lib/storage';
import type { SavingsTarget } from '@/types';
import { SubscriptionsPanel } from '@/components/subscriptions/SubscriptionsPanel';
import { computeSubscriptionData } from '@/lib/subscriptions';

interface Anomaly {
  transactionId: string;
  description: string;
  amount: number;
  category: string;
  reason: string;
  severity: 'info' | 'warning' | 'alert';
}

interface SavingsOpp {
  category: string;
  merchant: string | null;
  currentMonthlySpend: number;
  suggestion: string;
  estimatedSaving: number | null;
  type: 'subscription' | 'renegotiate' | 'switch' | 'reduce' | 'cancel';
}

interface InsightsSummary {
  totalIn: number;
  totalOut: number;
  netFlow: number;
  essentialSpend: number;
  discretionarySpend: number;
  essentialPercent: number;
  topCategories: { category: string; total: number; count: number }[];
  topMerchants: { merchant: string; total: number; count: number }[];
}

const TYPE_ICONS: Record<string, typeof Scissors> = {
  subscription: Scissors,
  renegotiate: ArrowRightLeft,
  switch: RefreshCw,
  reduce: TrendingDown,
  cancel: XCircle,
};

const TYPE_COLORS: Record<string, string> = {
  subscription: '#8b5cf6',
  renegotiate: '#f59e0b',
  switch: '#3b82f6',
  reduce: '#22c55e',
  cancel: '#ef4444',
};

export default function InsightsPage() {
  const { transactions, loaded } = useTransactionContext();
  const [isLoading, setIsLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [suggestions, setSuggestions] = useState<SavingsOpp[]>([]);
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [error, setError] = useState('');
  const [savingsTarget, setSavingsTarget] = useState<SavingsTarget | null>(null);
  const [targetInput, setTargetInput] = useState('300');
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);

  // Load cached insights and savings target
  useEffect(() => {
    (async () => {
      const cached = await getCachedInsights();
      if (cached && cached.anomalies) {
        setAnomalies(cached.anomalies as Anomaly[]);
        setSuggestions(cached.suggestions as SavingsOpp[]);
        setSummary(cached.summary as InsightsSummary);
      }
      const targets = await getSavingsTargets();
      if (targets.length > 0) setSavingsTarget(targets[0]);
    })();
  }, []);

  const generateInsights = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Build categorised transactions for the insights API
      const apiTransactions = transactions.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount / 100, // API expects pounds
        merchant: t.merchantName || null,
        category: t.category,
        isEssential: t.isEssential ?? false,
      }));

      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: apiTransactions }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate insights');
      }

      const data = await response.json();
      setAnomalies(data.anomalies || []);
      setSuggestions(data.suggestions || []);
      setSummary(data.summary || null);

      // Cache results
      await cacheInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setIsLoading(false);
  };

  const saveTarget = async () => {
    const amount = parseFloat(targetInput) * 100;
    if (isNaN(amount) || amount <= 0) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const target: SavingsTarget = {
      id: `target-${month}`,
      month,
      targetAmount: amount,
      description: `Save £${targetInput} this month`,
    };
    await saveSavingsTargets([target]);
    setSavingsTarget(target);
  };

  const totalEstimatedSavings = suggestions.reduce(
    (s, sug) => s + (sug.estimatedSaving || 0),
    0
  );

  const { potentialDuplicates, recurringMerchants } = computeSubscriptionData(transactions);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-foreground">AI Insights</h1>
        <div className="border border-dashed border-card-border rounded-xl p-16 text-center">
          <p className="text-muted mb-4">
            Upload a bank statement first to generate AI insights.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Upload className="h-4 w-4" /> Upload CSV
          </Link>
        </div>
      </div>
    );
  }

  const displayedAnomalies = showAllAnomalies
    ? anomalies
    : anomalies.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Insights</h1>
          <p className="text-muted mt-1">
            Anomalies, savings opportunities, and actionable advice
          </p>
        </div>
        <button
          onClick={generateInsights}
          disabled={isLoading}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {isLoading ? 'Analyzing...' : suggestions.length > 0 ? 'Refresh Insights' : 'Generate Insights'}
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger">
          {error}
        </div>
      )}

      {/* Subscriptions & Duplicates — always shown, no AI needed */}
      <SubscriptionsPanel
        potentialDuplicates={potentialDuplicates}
        recurringMerchants={recurringMerchants}
      />

      {/* Savings Target */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-accent" />
            <h3 className="text-base font-semibold text-foreground">
              Monthly Savings Target
            </h3>
          </div>
          {!savingsTarget && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">£</span>
              <input
                type="number"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-20 px-2 py-1 bg-background border border-card-border rounded text-sm text-foreground"
              />
              <button
                onClick={saveTarget}
                className="px-3 py-1 bg-accent text-white rounded text-sm"
              >
                Set
              </button>
            </div>
          )}
        </div>
        {savingsTarget && summary && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted">
                Target: {formatGBP(savingsTarget.targetAmount)}
              </span>
              <span className="text-sm font-medium text-foreground">
                Potential: £{totalEstimatedSavings.toFixed(0)}/mo from suggestions
              </span>
            </div>
            <div className="h-3 bg-card-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (totalEstimatedSavings * 100 / (savingsTarget.targetAmount / 100)))}%`,
                  backgroundColor:
                    totalEstimatedSavings >= savingsTarget.targetAmount / 100
                      ? '#22c55e'
                      : '#f59e0b',
                }}
              />
            </div>
            <p className="text-xs text-muted mt-1">
              {totalEstimatedSavings >= savingsTarget.targetAmount / 100
                ? 'Target achievable with suggested savings!'
                : `£${((savingsTarget.targetAmount / 100) - totalEstimatedSavings).toFixed(0)} more to find`}
            </p>
          </div>
        )}
        {!savingsTarget && (
          <p className="text-sm text-muted">
            Set a savings target to track progress against AI suggestions
          </p>
        )}
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-card-border rounded-xl p-4">
            <p className="text-xs text-muted">Essential Spending</p>
            <p className="text-xl font-bold text-foreground">
              £{summary.essentialSpend.toFixed(0)}
            </p>
            <p className="text-xs text-muted">{summary.essentialPercent}% of total</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-4">
            <p className="text-xs text-muted">Discretionary</p>
            <p className="text-xl font-bold text-warning">
              £{summary.discretionarySpend.toFixed(0)}
            </p>
            <p className="text-xs text-muted">
              {100 - summary.essentialPercent}% of total
            </p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-4">
            <p className="text-xs text-muted">Anomalies Found</p>
            <p className="text-xl font-bold text-danger">{anomalies.length}</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-4">
            <p className="text-xs text-muted">Potential Monthly Savings</p>
            <p className="text-xl font-bold text-success">
              £{totalEstimatedSavings.toFixed(0)}
            </p>
          </div>
        </div>
      )}

      {/* Savings Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold text-foreground">
              Savings Opportunities
            </h3>
            <span className="text-sm text-success ml-auto font-medium">
              Total: £{totalEstimatedSavings.toFixed(0)}/mo
            </span>
          </div>
          <div className="space-y-3">
            {suggestions.map((sug, i) => {
              const Icon = TYPE_ICONS[sug.type] || TrendingDown;
              const color = TYPE_COLORS[sug.type] || '#6b7280';
              return (
                <div
                  key={i}
                  className="border border-card-border rounded-lg p-4 hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="p-2 rounded-lg shrink-0"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {sug.category}
                          </span>
                          {sug.merchant && (
                            <span className="text-xs text-muted">
                              · {sug.merchant}
                            </span>
                          )}
                        </div>
                        {sug.estimatedSaving != null && (
                          <span className="text-sm font-bold text-success shrink-0">
                            Save £{sug.estimatedSaving.toFixed(0)}/mo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted">{sug.suggestion}</p>
                      {sug.currentMonthlySpend > 0 && (
                        <p className="text-xs text-muted mt-1">
                          Current spend: £{sug.currentMonthlySpend.toFixed(2)}/mo
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h3 className="text-lg font-semibold text-foreground">
              Anomalies Detected ({anomalies.length})
            </h3>
          </div>
          <div className="space-y-2">
            {displayedAnomalies.map((a, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  a.severity === 'alert'
                    ? 'border-danger/30 bg-danger/5'
                    : 'border-warning/30 bg-warning/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {a.description}
                  </p>
                  <p className="text-xs text-muted">{a.reason}</p>
                </div>
                <span className="text-sm font-mono text-danger ml-3 shrink-0">
                  £{Math.abs(a.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {anomalies.length > 5 && (
            <button
              onClick={() => setShowAllAnomalies(!showAllAnomalies)}
              className="flex items-center gap-1 text-sm text-accent mt-3 hover:underline"
            >
              {showAllAnomalies ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Show all{' '}
                  {anomalies.length}
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Top Merchants */}
      {summary && summary.topMerchants.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-5 w-5 text-muted" />
            <h3 className="text-lg font-semibold text-foreground">
              Where Your Money Goes — Top Merchants
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {summary.topMerchants.slice(0, 20).map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg border border-card-border"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted w-5">#{i + 1}</span>
                  <span className="text-sm text-foreground truncate">
                    {m.merchant}
                  </span>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className="text-sm font-medium text-foreground">
                    £{m.total.toFixed(0)}
                  </span>
                  <span className="text-xs text-muted ml-2">
                    {m.count} txns
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No insights yet prompt */}
      {suggestions.length === 0 && anomalies.length === 0 && !isLoading && (
        <div className="border border-dashed border-accent/30 rounded-xl p-12 text-center bg-accent/5">
          <Brain className="h-16 w-16 text-accent mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Ready to Analyze
          </h2>
          <p className="text-muted max-w-md mx-auto mb-4">
            Click &quot;Generate Insights&quot; to analyze your{' '}
            {transactions.length.toLocaleString()} transactions with AI.
            We&apos;ll find anomalies, savings opportunities, and specific
            advice to help you save £{targetInput}/month.
          </p>
        </div>
      )}
    </div>
  );
}
