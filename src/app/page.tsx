'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Upload, TrendingUp, Brain, TrendingDown, ArrowUpRight, ArrowDownRight, Target, ShieldCheck, Sparkles, PiggyBank, Banknote, Landmark, X, ChevronDown, FileText } from 'lucide-react';
import Link from 'next/link';
import { useTransactionContext } from '@/context/transactions';
import { formatGBP, formatChange, gbpTooltipFormatter } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import { getSavingsTargets, saveSavingsTargets } from '@/lib/storage';
import type { CategoryName, SavingsTarget, Transaction } from '@/types';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { DuplicateSubscriptionAlert } from '@/components/subscriptions/DuplicateSubscriptionAlert';
import { computeSubscriptionData } from '@/lib/subscriptions';
import { HealthScorecardWidget } from '@/components/dashboard/health-scorecard';
import { RecommendationsPanel } from '@/components/dashboard/recommendations-panel';
import { SalaryFlowChart } from '@/components/dashboard/salary-flow';
import { CycleBurndown } from '@/components/dashboard/cycle-burndown';
import { AccountBalancesPanel } from '@/components/dashboard/AccountBalancesPanel';
import { AIAnalysis, type AIAnalysisHandle } from '@/components/dashboard/ai-analysis';
import { OverspendingAlert, StopTheBleeding } from '@/components/dashboard/overspending-alert';
import { CategorisationShepherd } from '@/components/advisor/categorisation-shepherd';
import { AdvisorBriefingCard } from '@/components/advisor/briefing-card';
import { TargetTracker } from '@/components/advisor/target-tracker';
import { TargetSetupWizard } from '@/components/advisor/target-setup-wizard';
import { CommitmentList } from '@/components/advisor/commitment-list';
import { useSpendingTargets } from '@/hooks/useSpendingTargets';
import { useAdvisorBriefings } from '@/hooks/useAdvisorBriefings';
import { useCommitments } from '@/hooks/useCommitments';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// Categories excluded from spending (must match useTransactions.ts)
const INTERNAL_CATEGORIES = new Set(['Transfers', 'Savings & Investments']);

export default function DashboardHome() {
  const {
    transactions,
    allTransactions,
    loaded,
    totalIncome,
    totalSpending,
    essentialSpending,
    discretionarySpending,
    categoryBreakdown,
    monthlyBreakdowns,
    dateRange,
    updateOne,
    healthScorecard,
    recommendations,
    salaryFlow,
    categoryCreep,
    period,
    setPeriod,
    availableCycles,
    reload,
    reloadEssentialMerchants,
    currentCycleMeta,
  } = useTransactionContext();

  const [showSpendingDrilldown, setShowSpendingDrilldown] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);

  // ─── Advisor hooks ────────────────────────────────────────────────
  // The cycleId for advisor hooks — use the current period if it's a cycle, fallback to current cycle
  const cycleId = period !== 'all' && period.startsWith('cycle-') ? period : (availableCycles[0]?.id ?? 'cycle-2026-01');

  const { targets, saveTargets } = useSpendingTargets(cycleId);
  const { latestBriefing, dismissBriefing, generateBriefing, shouldShowWeeklyCheckin } = useAdvisorBriefings(cycleId);
  const { commitments, activeCommitments, completeCommitment, deferCommitment } = useCommitments(cycleId);

  // ─── Auto-pipeline state ────────────────────────────────────────────
  const analysisRef = useRef<AIAnalysisHandle>(null);
  const [categorizationDone, setCategorizationDone] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);

  const handleCategorizationComplete = useCallback(() => {
    reload();
    setCategorizationDone(true);
  }, [reload]);

  const handleAnalysisComplete = useCallback(() => {
    setAnalysisDone(true);
  }, []);

  // Auto-generate upload briefing after analysis completes
  useEffect(() => {
    if (!analysisDone || !categorizationDone) return;
    // Reset flags so it doesn't re-trigger
    setAnalysisDone(false);
    setCategorizationDone(false);

    // Build context for upload briefing
    const byCategory: Record<string, { spent: number; target: number; txnCount: number }> = {};
    for (const t of transactions) {
      if (t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)) {
        if (!byCategory[t.category]) byCategory[t.category] = { spent: 0, target: 0, txnCount: 0 };
        byCategory[t.category].spent += Math.abs(t.amount);
        byCategory[t.category].txnCount++;
      }
    }
    for (const t of targets) {
      if (byCategory[t.category]) byCategory[t.category].target = t.targetAmount;
    }
    const topMerchants = Object.entries(
      transactions.filter(t => t.amount < 0).reduce((acc, t) => {
        const m = t.merchantName || t.description;
        acc[m] = acc[m] || { merchant: m, amount: 0, count: 0 };
        acc[m].amount += Math.abs(t.amount);
        acc[m].count++;
        return acc;
      }, {} as Record<string, { merchant: string; amount: number; count: number }>)
    ).map(([, v]) => v).sort((a, b) => b.amount - a.amount).slice(0, 10);

    generateBriefing('upload', {
      currentCycleData: { totalIncome, totalSpending, byCategory, topMerchants },
      targets: targets.map(t => ({ category: t.category, targetAmount: t.targetAmount, spent: spendingByCategory[t.category] || 0 })),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisDone, categorizationDone]);

  // ─── Compute spendingByCategory for TargetTracker ─────────────────
  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)) {
        map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
      }
    }
    return map;
  }, [transactions]);

  // ─── Compute historicalSpending for TargetSetupWizard ─────────────
  const historicalSpending = useMemo(() => {
    // Need at least some cycles to build history
    if (!availableCycles || availableCycles.length === 0) return [];

    // Find the current cycle index and get up to 3 previous cycles
    const currentIdx = availableCycles.findIndex((c) => c.id === cycleId);
    // availableCycles is sorted most-recent-first, so previous cycles are at higher indices
    const historyCycles = availableCycles.slice(
      Math.max(0, currentIdx + 1),
      currentIdx + 4
    ).reverse(); // oldest first for display

    if (historyCycles.length === 0) return [];

    // Compute spending per category per cycle
    const cycleSpending: Record<string, number[]> = {};

    for (const cycle of historyCycles) {
      const cycleTxns = allTransactions.filter(
        (t) => t.date >= cycle.start && t.date <= cycle.end && t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)
      );

      const categoryTotals: Record<string, number> = {};
      for (const t of cycleTxns) {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + Math.abs(t.amount);
      }

      // Add each category's spending for this cycle
      const allCats = new Set([...Object.keys(categoryTotals), ...Object.keys(cycleSpending)]);
      for (const cat of allCats) {
        if (!cycleSpending[cat]) cycleSpending[cat] = [];
        cycleSpending[cat].push(categoryTotals[cat] || 0);
      }
    }

    // Build the array of { category, last3Cycles, average }
    return Object.entries(cycleSpending)
      .map(([category, amounts]) => ({
        category,
        last3Cycles: amounts,
        average: amounts.length > 0 ? Math.round(amounts.reduce((s, v) => s + v, 0) / amounts.length) : 0,
      }))
      .filter((h) => h.average > 0)
      .sort((a, b) => b.average - a.average);
  }, [allTransactions, availableCycles, cycleId]);

  // ─── Cycle day calculations for TargetTracker ─────────────────────
  const currentCycle = useMemo(
    () => availableCycles.find((c) => c.id === cycleId) ?? null,
    [availableCycles, cycleId]
  );

  const daysInCycle = useMemo(() => {
    if (!currentCycle) return 30;
    const start = new Date(currentCycle.start);
    const end = new Date(currentCycle.end);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [currentCycle]);

  const daysLeftInCycle = useMemo(() => {
    if (!currentCycle) return 15;
    const now = new Date();
    const end = new Date(currentCycle.end);
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }, [currentCycle]);

  // ─── Auto-trigger weekly check-in if >5 days since last ────────
  const [weeklyTriggered, setWeeklyTriggered] = useState(false);
  useEffect(() => {
    if (!loaded || weeklyTriggered || transactions.length === 0) return;
    if (!shouldShowWeeklyCheckin()) return;
    setWeeklyTriggered(true);

    // Build a lightweight context for the weekly briefing
    const byCategory: Record<string, { spent: number; target: number; txnCount: number }> = {};
    for (const t of transactions) {
      if (t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)) {
        if (!byCategory[t.category]) byCategory[t.category] = { spent: 0, target: 0, txnCount: 0 };
        byCategory[t.category].spent += Math.abs(t.amount);
        byCategory[t.category].txnCount++;
      }
    }
    for (const t of targets) {
      if (byCategory[t.category]) byCategory[t.category].target = t.targetAmount;
    }
    const topMerchants = Object.entries(
      transactions.filter(t => t.amount < 0).reduce((acc, t) => {
        const m = t.merchantName || t.description;
        acc[m] = acc[m] || { merchant: m, amount: 0, count: 0 };
        acc[m].amount += Math.abs(t.amount);
        acc[m].count++;
        return acc;
      }, {} as Record<string, { merchant: string; amount: number; count: number }>)
    ).map(([, v]) => v).sort((a, b) => b.amount - a.amount).slice(0, 10);

    generateBriefing('weekly', {
      currentCycleData: { totalIncome, totalSpending, byCategory, topMerchants },
      targets: targets.map(t => ({ category: t.category, targetAmount: t.targetAmount, spent: spendingByCategory[t.category] || 0 })),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, weeklyTriggered, transactions.length]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  // Only show empty state if there's truly no data at all
  if (allTransactions.length === 0) {
    return <EmptyState />;
  }

  // If the current period has no transactions but data exists, auto-switch to "all"
  if (transactions.length === 0 && period !== 'all') {
    // Show a helpful message with option to switch
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
          </div>
          <PeriodSelector />
        </div>
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <TrendingDown className="h-12 w-12 text-muted mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            No transactions in this cycle
          </h2>
          <p className="text-muted text-sm mb-4">
            You have {allTransactions.length.toLocaleString()} transactions total, but none fall in the selected period.
          </p>
          <button
            onClick={() => setPeriod('all')}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View All Time
          </button>
        </div>
      </div>
    );
  }

  const net = totalIncome - totalSpending;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
  const isOpenCycle = currentCycleMeta?.isOpen ?? false;
  const { potentialDuplicates } = computeSubscriptionData(transactions);

  // Month-over-month comparison
  const currentMonth = monthlyBreakdowns[monthlyBreakdowns.length - 1];
  const prevMonth = monthlyBreakdowns.length > 1
    ? monthlyBreakdowns[monthlyBreakdowns.length - 2]
    : null;

  // Donut chart data
  const donutData = categoryBreakdown.slice(0, 8).map(({ category, amount }) => ({
    name: category,
    value: amount / 100,
    color: CATEGORY_COLORS[category as CategoryName] || '#a1a1aa',
  }));

  // Bar chart data for monthly income vs spending
  const barData = monthlyBreakdowns.map((m) => ({
    month: format(parseISO(`${m.month}-01`), 'MMM yy'),
    income: m.income / 100,
    spending: m.spending / 100,
    net: m.net / 100,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
          <Link
            href="/upload"
            className="hidden md:inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload More
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            {dateRange && (
              <p className="text-xs md:text-sm text-muted">
                {format(parseISO(dateRange.from), 'dd MMM yyyy')} —{' '}
                {format(parseISO(dateRange.to), 'dd MMM yyyy')} ·{' '}
                {transactions.length.toLocaleString()} txns
              </p>
            )}
          </div>
          <PeriodSelector />
        </div>
      </div>

      {/* ── ADVISOR-LED SECTIONS ─────────────────────────────────── */}

      {/* 1. Categorisation nag — blocks proper analysis until sorted */}
      <CategorisationShepherd
        transactions={allTransactions}
        onCategorizeComplete={handleCategorizationComplete}
        autoStart
      />

      {/* 2. Target Setup Wizard — show when no targets for current cycle */}
      {targets.length === 0 && !wizardDismissed && historicalSpending.length > 0 && period !== 'all' && (
        <TargetSetupWizard
          cycleId={cycleId}
          historicalSpending={historicalSpending}
          onComplete={(newTargets) => {
            saveTargets(newTargets);
          }}
          onDismiss={() => setWizardDismissed(true)}
        />
      )}

      {/* 3. Latest Advisor Briefing — hero section */}
      {latestBriefing ? (
        <AdvisorBriefingCard
          briefing={latestBriefing}
          onDismiss={dismissBriefing}
        />
      ) : allTransactions.length > 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-6 text-center">
          <FileText className="h-8 w-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">
            No advisor briefing yet. Upload bank statements to get started.
          </p>
        </div>
      ) : null}

      {/* 4. Target Tracker — compact, if targets exist */}
      {targets.length > 0 && (
        <TargetTracker
          targets={targets}
          spendingByCategory={spendingByCategory}
          daysLeftInCycle={daysLeftInCycle}
          daysInCycle={daysInCycle}
        />
      )}

      {/* 5. Commitment List — active commitments */}
      {(activeCommitments.length > 0 || commitments.some((c) => c.status === 'completed')) && (
        <CommitmentList
          commitments={commitments}
          onComplete={completeCommitment}
          onDefer={deferCommitment}
        />
      )}

      {/* ── EXISTING DATA VIEWS ──────────────────────────────────── */}

      {/* Duplicate subscription warning */}
      <DuplicateSubscriptionAlert duplicates={potentialDuplicates} />

      {/* Overspending alert — big red banner when spending > income */}
      <OverspendingAlert
        totalIncome={totalIncome}
        totalSpending={totalSpending}
        monthlyBreakdowns={monthlyBreakdowns}
      />

      {/* Account Balances */}
      <AccountBalancesPanel />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="Total Income"
          value={formatGBP(totalIncome)}
          change={prevMonth && currentMonth
            ? formatChange(currentMonth.income, prevMonth.income)
            : undefined}
          positive
        />
        <KpiCard
          label="Total Spending"
          value={formatGBP(totalSpending)}
          change={prevMonth && currentMonth
            ? formatChange(currentMonth.spending, prevMonth.spending)
            : undefined}
          positive={false}
          qualifier={isOpenCycle ? 'so far this cycle' : undefined}
          onClick={() => setShowSpendingDrilldown(true)}
        />
        <KpiCard
          label="Net Savings"
          value={formatGBP(net)}
          positive={net >= 0}
          qualifier={isOpenCycle ? 'so far this cycle' : undefined}
        />
        <KpiCard
          label="Savings Rate"
          value={`${savingsRate.toFixed(1)}%`}
          positive={savingsRate > 0}
          qualifier={isOpenCycle ? 'so far this cycle' : undefined}
        />
      </div>

      {/* Health Scorecard + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HealthScorecardWidget scorecard={healthScorecard} />
        <RecommendationsPanel recommendations={recommendations} onMarkEssential={reloadEssentialMerchants} />
      </div>

      {/* AI Monthly Analysis */}
      <AIAnalysis
        ref={analysisRef}
        autoTrigger={categorizationDone}
        onAnalysisComplete={handleAnalysisComplete}
      />

      {/* Household Salary + Mortgage & Loans side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HouseholdSalary transactions={transactions} />
        <MortgageAndLoans transactions={transactions} />
      </div>

      {/* Where salary went + Card spending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isOpenCycle && currentCycleMeta ? (
          <CycleBurndown
            transactions={transactions}
            cycleStart={currentCycleMeta.start}
            cycleEnd={currentCycleMeta.end}
            totalSalary={salaryFlow?.totalSalary ?? 0}
            isOpen={true}
          />
        ) : (
          <SalaryFlowChart salaryFlow={salaryFlow} />
        )}
        <CardSpendingBreakdown transactions={transactions} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Spending Bar Chart */}
        <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4">
            Income vs Spending
          </h3>
          <div className="h-[220px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `£${v.toLocaleString()}`} width={55} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111118',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                    color: '#e5e7eb',
                  }}
                  formatter={gbpTooltipFormatter}
                />
                <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spending" name="Spending" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Donut */}
        <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4">
            Spending by Category
          </h3>
          <div className="h-[220px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  dataKey="value"
                >
                {donutData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111118',
                  border: '1px solid #1e1e2e',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                }}
                formatter={gbpTooltipFormatter}
              />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 md:gap-2 mt-2">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="text-muted truncate">{d.name}</span>
                <span className="text-foreground font-medium ml-auto">
                  £{d.value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Spending Categories (with creep badges) */}
      <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Top Spending Categories
        </h3>
        <div className="space-y-3">
          {categoryBreakdown.slice(0, 10).map(({ category, amount }) => {
            const pct = (amount / totalSpending) * 100;
            const color = CATEGORY_COLORS[category as CategoryName] || '#a1a1aa';
            const creep = categoryCreep.find((c) => c.category === category);
            const showCreep = creep && Math.abs(creep.percentIncrease) > 10;
            const isUrgent = creep && creep.percentIncrease > 50;

            return (
              <div key={category}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-foreground">{category}</span>
                    {showCreep && creep && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          creep.trend === 'rising'
                            ? isUrgent
                              ? 'bg-red-500/20 text-red-400 animate-pulse'
                              : 'bg-red-500/15 text-red-400'
                            : 'bg-green-500/15 text-green-400'
                        }`}
                        title={`${creep.trend === 'rising' ? 'Up' : 'Down'} vs 3-cycle avg (${formatGBP(creep.rollingAverage)})`}
                      >
                        {creep.trend === 'rising' ? '+' : ''}
                        {creep.percentIncrease.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">{pct.toFixed(1)}%</span>
                    <span className="text-sm font-medium text-foreground">{formatGBP(amount)}</span>
                  </div>
                </div>
                <div className="h-2 bg-card-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Where to Cut — ranks discretionary spending by cuttability */}
      <StopTheBleeding
        transactions={transactions}
        totalIncome={totalIncome}
        totalSpending={totalSpending}
        categoryBreakdown={categoryBreakdown}
        categoryCreep={categoryCreep}
      />

      {/* Essential vs Discretionary Split */}
      <EssentialVsDiscretionary
        essentialSpending={essentialSpending}
        discretionarySpending={discretionarySpending}
        totalSpending={totalSpending}
      />

      {/* Monthly Savings Target Progress */}
      <SavingsTargetProgress
        monthlyBreakdowns={monthlyBreakdowns}
      />

      {/* 50/30/20 Budget Rule */}
      <BudgetRuleIndicator
        totalIncome={totalIncome}
        essentialSpending={essentialSpending}
        discretionarySpending={discretionarySpending}
      />

      {showSpendingDrilldown && (
        <SpendingDrilldown
          transactions={transactions}
          total={totalSpending}
          onReclassify={(id, category) => updateOne(id, { category, categorySource: 'manual' })}
          onClose={() => setShowSpendingDrilldown(false)}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  change,
  positive,
  qualifier,
  onClick,
}: {
  label: string;
  value: string;
  change?: string;
  positive: boolean;
  qualifier?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-card border border-card-border rounded-xl p-3.5 md:p-5 ${onClick ? 'cursor-pointer hover:border-accent/50 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs md:text-sm text-muted">{label}</p>
        {onClick && <ChevronDown className="h-3.5 w-3.5 text-muted" />}
      </div>
      <p className={`text-lg md:text-2xl font-bold ${positive ? 'text-success' : 'text-danger'}`}>
        {value}
      </p>
      {qualifier && (
        <p className="text-[10px] md:text-xs text-muted/70 italic mt-0.5">{qualifier}</p>
      )}
      {change && (
        <div className="flex items-center gap-1 mt-1">
          {change.startsWith('+') ? (
            <ArrowUpRight className="h-3 w-3 text-muted" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-muted" />
          )}
          <span className="text-[10px] md:text-xs text-muted">{change} vs prev</span>
        </div>
      )}
    </div>
  );
}

function EssentialVsDiscretionary({
  essentialSpending,
  discretionarySpending,
  totalSpending,
}: {
  essentialSpending: number;
  discretionarySpending: number;
  totalSpending: number;
}) {
  const essentialPct = totalSpending > 0 ? (essentialSpending / totalSpending) * 100 : 0;
  const discretionaryPct = totalSpending > 0 ? (discretionarySpending / totalSpending) * 100 : 0;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-semibold text-foreground">
          Essential vs Discretionary
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-[#111118] rounded-lg p-4 border border-card-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-sm text-muted">Essential (Needs)</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatGBP(essentialSpending)}</p>
          <p className="text-sm text-muted mt-1">{essentialPct.toFixed(1)}% of spending</p>
        </div>
        <div className="bg-[#111118] rounded-lg p-4 border border-card-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            <span className="text-sm text-muted">Discretionary (Wants)</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatGBP(discretionarySpending)}</p>
          <p className="text-sm text-muted mt-1">{discretionaryPct.toFixed(1)}% of spending</p>
        </div>
      </div>
      {/* Stacked horizontal bar */}
      <div className="space-y-2">
        <div className="h-6 rounded-full overflow-hidden flex bg-card-border">
          {essentialPct > 0 && (
            <div
              className="h-full flex items-center justify-center text-xs font-medium text-white transition-all duration-500"
              style={{ width: `${essentialPct}%`, backgroundColor: '#3b82f6' }}
            >
              {essentialPct >= 10 ? `${essentialPct.toFixed(0)}%` : ''}
            </div>
          )}
          {discretionaryPct > 0 && (
            <div
              className="h-full flex items-center justify-center text-xs font-medium text-white transition-all duration-500"
              style={{ width: `${discretionaryPct}%`, backgroundColor: '#f59e0b' }}
            >
              {discretionaryPct >= 10 ? `${discretionaryPct.toFixed(0)}%` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-6 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
            Essential
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            Discretionary
          </span>
        </div>
      </div>
    </div>
  );
}

function SavingsTargetProgress({
  monthlyBreakdowns,
}: {
  monthlyBreakdowns: { month: string; income: number; spending: number; net: number }[];
}) {
  const [targets, setTargets] = useState<SavingsTarget[]>([]);
  const [inputValue, setInputValue] = useState('300');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSavingsTargets().then((t) => {
      setTargets(t);
      setLoaded(true);
    });
  }, []);

  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const currentMonthData = monthlyBreakdowns.find((m) => m.month === currentMonthKey);
  const actualNet = currentMonthData ? currentMonthData.net : 0;

  const currentTarget = targets.find((t) => t.month === currentMonthKey);

  const handleSetTarget = useCallback(async () => {
    const amount = Math.round(parseFloat(inputValue) * 100);
    if (isNaN(amount) || amount <= 0) return;
    const newTarget: SavingsTarget = {
      id: `target-${currentMonthKey}`,
      month: currentMonthKey,
      targetAmount: amount,
    };
    const updated = [...targets.filter((t) => t.month !== currentMonthKey), newTarget];
    await saveSavingsTargets(updated);
    setTargets(updated);
  }, [inputValue, currentMonthKey, targets]);

  if (!loaded) return null;

  const targetAmount = currentTarget ? currentTarget.targetAmount : 0;
  const progressPct = targetAmount > 0 ? Math.min((actualNet / targetAmount) * 100, 100) : 0;
  const onTrack = actualNet >= targetAmount;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-semibold text-foreground">
          Savings Target — {format(new Date(), 'MMMM yyyy')}
        </h3>
      </div>

      {!currentTarget ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            No savings target set for this month. Set one to track your progress.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-foreground font-medium">£</span>
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-28 bg-[#111118] border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                placeholder="300"
                min="0"
                step="50"
              />
            </div>
            <button
              onClick={handleSetTarget}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Set Target
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted mb-1">Target</p>
              <p className="text-xl font-bold text-foreground">{formatGBP(targetAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted mb-1">Actual Net Savings</p>
              <p className={`text-xl font-bold ${actualNet >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatGBP(actualNet)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Progress</span>
              <span className={onTrack ? 'text-success' : 'text-danger'}>
                {actualNet > 0 ? progressPct.toFixed(0) : 0}%
              </span>
            </div>
            <div className="h-4 bg-card-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${actualNet > 0 ? progressPct : 0}%`,
                  backgroundColor: onTrack ? '#22c55e' : '#ef4444',
                }}
              />
            </div>
            <p className="text-xs text-muted">
              {onTrack
                ? `On track! You've met your savings target this month.`
                : `${formatGBP(Math.max(targetAmount - actualNet, 0))} more to reach your target.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetRuleIndicator({
  totalIncome,
  essentialSpending,
  discretionarySpending,
}: {
  totalIncome: number;
  essentialSpending: number;
  discretionarySpending: number;
}) {
  const actualSavings = totalIncome - essentialSpending - discretionarySpending;

  const recommended = {
    needs: totalIncome * 0.5,
    wants: totalIncome * 0.3,
    savings: totalIncome * 0.2,
  };

  const actual = {
    needs: essentialSpending,
    wants: discretionarySpending,
    savings: Math.max(actualSavings, 0),
  };

  const pct = {
    needs: totalIncome > 0 ? (actual.needs / totalIncome) * 100 : 0,
    wants: totalIncome > 0 ? (actual.wants / totalIncome) * 100 : 0,
    savings: totalIncome > 0 ? (actualSavings / totalIncome) * 100 : 0,
  };

  const rows: {
    label: string;
    targetPct: number;
    actualPct: number;
    recommended: number;
    actual: number;
    color: string;
    icon: typeof ShieldCheck;
  }[] = [
    {
      label: 'Needs (Essential)',
      targetPct: 50,
      actualPct: pct.needs,
      recommended: recommended.needs,
      actual: actual.needs,
      color: '#3b82f6',
      icon: ShieldCheck,
    },
    {
      label: 'Wants (Discretionary)',
      targetPct: 30,
      actualPct: pct.wants,
      recommended: recommended.wants,
      actual: actual.wants,
      color: '#f59e0b',
      icon: Sparkles,
    },
    {
      label: 'Savings',
      targetPct: 20,
      actualPct: pct.savings,
      recommended: recommended.savings,
      actual: actual.savings,
      color: '#22c55e',
      icon: PiggyBank,
    },
  ];

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-2 mb-2">
        <PiggyBank className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-semibold text-foreground">50 / 30 / 20 Budget Rule</h3>
      </div>
      <p className="text-sm text-muted mb-5">
        Based on your total income of {formatGBP(totalIncome)}
      </p>
      <div className="space-y-5">
        {rows.map((row) => {
          const overBudget =
            row.label === 'Savings'
              ? row.actualPct < row.targetPct
              : row.actualPct > row.targetPct;
          const Icon = row.icon;
          return (
            <div key={row.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color: row.color }} />
                  <span className="text-sm font-medium text-foreground">{row.label}</span>
                  <span className="text-xs text-muted">({row.targetPct}% target)</span>
                </div>
                <span className={`text-sm font-medium ${overBudget ? 'text-danger' : 'text-success'}`}>
                  {row.actualPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 bg-card-border rounded-full overflow-hidden relative">
                {/* Target marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-white/40 z-10"
                  style={{ left: `${row.targetPct}%` }}
                />
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(row.actualPct, 100)}%`,
                    backgroundColor: row.color,
                    opacity: overBudget ? 0.7 : 1,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  Recommended: {formatGBP(row.recommended)}
                </span>
                <span>
                  Actual: <span className={overBudget ? 'text-danger' : 'text-success'}>{formatGBP(row.actual)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HouseholdSalary({ transactions }: { transactions: Transaction[] }) {
  const salaryTxns = transactions.filter((t) => t.category === 'Salary' && t.amount > 0);

  if (salaryTxns.length === 0) return null;

  // Group by month — within each month, sort amounts descending to identify Gus (larger) vs Larissa (smaller)
  const byMonth = new Map<string, number[]>();

  for (const t of salaryTxns) {
    const month = t.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(t.amount);
  }

  const months = Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Banknote className="h-5 w-5 text-success" />
        <h3 className="text-lg font-semibold text-foreground">
          Household Salary (Net)
        </h3>
      </div>

      <div className="space-y-0">
        {months.map(([month, amounts]) => {
          const sorted = [...amounts].sort((a, b) => b - a);
          const total = sorted.reduce((s, a) => s + a, 0);
          // Gus = largest payment, Larissa = second largest, rest = other
          const gus = sorted[0] || 0;
          const larissa = sorted[1] || 0;

          return (
            <div key={month} className="flex items-center justify-between py-3 border-b border-card-border last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {format(parseISO(`${month}-01`), 'MMMM yyyy')}
                </p>
                <div className="flex gap-4 mt-0.5">
                  <span className="text-xs text-muted">
                    Gus: <span className="text-foreground">{formatGBP(gus)}</span>
                  </span>
                  {larissa > 0 && (
                    <span className="text-xs text-muted">
                      Larissa: <span className="text-foreground">{formatGBP(larissa)}</span>
                    </span>
                  )}
                </div>
              </div>
              <p className="text-lg font-bold text-success">{formatGBP(total)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MortgageAndLoans({ transactions }: { transactions: Transaction[] }) {
  const debtTxns = transactions.filter(
    (t) =>
      t.amount < 0 &&
      (t.category === 'Rent / Mortgage' || t.category === 'Debt Repayments')
  );

  if (debtTxns.length === 0) return null;

  // Identify distinct products by description pattern + consistent amount
  const products = new Map<string, { amounts: number[]; months: Set<string> }>();

  for (const t of debtTxns) {
    // Use rawDescription or clean description as the product key
    const key = (t.rawDescription || t.description).trim().toUpperCase();
    if (!products.has(key)) products.set(key, { amounts: [], months: new Set() });
    const p = products.get(key)!;
    p.amounts.push(Math.abs(t.amount));
    p.months.add(t.date.slice(0, 7));
  }

  // Build product summaries
  const productList = Array.from(products.entries()).map(([key, data]) => {
    const latest = data.amounts[0]; // most recent (transactions are date-sorted desc)
    const total = data.amounts.reduce((s, a) => s + a, 0);
    const avgMonthly = data.months.size > 0 ? total / data.months.size : latest;
    const isMortgage = key.includes('NATIONWIDE') || key.includes('ACC-NWESTMSTR');
    const resolveName = (k: string) => {
      if (k.includes('NATIONWIDE')) return 'Nationwide Mortgage';
      if (k.includes('ACC-NWESTMSTR')) return 'NatWest Mortgage';
      if (k.includes('NATWEST LOAN') || k.includes('ACC-NWEST LOAN')) return 'NatWest Loan';
      if (k.includes('ACC-NWEST')) return 'NatWest Account Payment';
      if (k.includes('NOVUNA')) return 'Novuna Finance';
      // Fallback: take the first meaningful segment before a comma or reference number
      return k.split(',')[0].trim() || k;
    };
    return {
      name: resolveName(key),
      category: isMortgage ? 'Mortgage' : 'Loan',
      latestPayment: latest,
      monthlyAvg: avgMonthly,
      totalPaid: total,
      monthCount: data.months.size,
    };
  });

  // Group Nationwide payments together (they are separate D/Ds but same lender)
  const nationwideProducts = productList.filter((p) => p.name === 'Nationwide Mortgage');
  const otherProducts = productList.filter((p) => p.name !== 'Nationwide Mortgage');

  const nationwideCombined = nationwideProducts.length > 0
    ? {
        name: 'Nationwide Mortgage',
        category: 'Mortgage' as const,
        subProducts: nationwideProducts.length,
        monthlyAvg: nationwideProducts.reduce((s, p) => s + p.monthlyAvg, 0),
        latestPayment: nationwideProducts.reduce((s, p) => s + p.latestPayment, 0),
        totalPaid: nationwideProducts.reduce((s, p) => s + p.totalPaid, 0),
        monthCount: Math.max(...nationwideProducts.map((p) => p.monthCount)),
      }
    : null;

  const allProducts = [
    ...(nationwideCombined ? [nationwideCombined] : []),
    ...otherProducts,
  ];

  const totalMonthly = allProducts.reduce((s, p) => s + p.latestPayment, 0);

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="h-5 w-5 text-danger" />
        <h3 className="text-lg font-semibold text-foreground">
          Mortgage & Loans
        </h3>
      </div>

      {/* Total monthly */}
      <div className="bg-[#111118] rounded-lg p-4 border border-card-border mb-4">
        <p className="text-xs text-muted mb-1">Total Monthly Payments</p>
        <p className="text-2xl font-bold text-danger">{formatGBP(totalMonthly)}</p>
      </div>

      {/* Individual products */}
      <div className="space-y-0">
        {allProducts.map((product, idx) => (
          <div key={`${product.name}-${idx}`} className="flex items-center justify-between py-3 border-b border-card-border last:border-0">
            <div>
              <p className="text-sm font-medium text-foreground">{product.name}</p>
              <div className="flex gap-3 mt-0.5">
                <span className="text-xs text-muted">
                  {product.category}
                  {'subProducts' in product && (product as { subProducts: number }).subProducts > 1
                    ? ` (${(product as { subProducts: number }).subProducts} products)`
                    : ''}
                </span>
                <span className="text-xs text-muted">
                  {product.monthCount} months paid
                </span>
                <span className="text-xs text-muted">
                  Total: <span className="text-foreground">{formatGBP(product.totalPaid)}</span>
                </span>
              </div>
            </div>
            <p className="text-base font-semibold text-danger">{formatGBP(product.latestPayment)}<span className="text-xs text-muted font-normal">/mo</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card type colours ──────────────────────────────────────────────────────
const CARD_COLORS: Record<string, string> = {
  amex: '#2563eb',   // blue
  natwest: '#16a34a', // green
};

function resolveCardLabel(accountName: string | undefined, source: string | undefined): {
  label: string;
  sublabel: string;
  colorKey: string;
} {
  if (source === 'amex' && accountName) {
    // "Amex LARISSA (****21013)" or "Amex G (****21005)"
    const upper = accountName.toUpperCase();
    const accountMatch = accountName.match(/\(([^)]+)\)/);
    const accountSuffix = accountMatch ? accountMatch[1] : '';
    if (upper.includes('LARISSA')) {
      return { label: 'Larissa', sublabel: `Amex · ${accountSuffix}`, colorKey: 'amex' };
    }
    // Gus — "G XAVIER" gives first token "G", or check for GUS/XAVIER
    return { label: 'Gus', sublabel: `Amex · ${accountSuffix}`, colorKey: 'amex' };
  }
  if (source === 'natwest' || !source) {
    const name = accountName || 'NatWest';
    return { label: name, sublabel: 'NatWest Debit', colorKey: 'natwest' };
  }
  return { label: accountName || 'Unknown', sublabel: source || '', colorKey: 'natwest' };
}

function CardSpendingBreakdown({ transactions }: { transactions: Transaction[] }) {
  const cards = useMemo(() => {
    const map = new Map<string, {
      label: string;
      sublabel: string;
      colorKey: string;
      total: number;
      count: number;
    }>();

    for (const t of transactions) {
      if (t.amount >= 0 || INTERNAL_CATEGORIES.has(t.category)) continue;

      const resolved = resolveCardLabel(t.accountName, t.source);
      // Group Amex cards by label (Gus/Larissa), NatWest by accountName
      const key = resolved.label + '|' + resolved.sublabel;

      if (!map.has(key)) {
        map.set(key, { ...resolved, total: 0, count: 0 });
      }
      const entry = map.get(key)!;
      entry.total += Math.abs(t.amount);
      entry.count++;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [transactions]);

  const grandTotal = cards.reduce((s, c) => s + c.total, 0);

  if (cards.length === 0) return null;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Spending by Card</h3>
          <p className="text-xs text-muted mt-0.5">This cycle · all spend sources</p>
        </div>
        <span className="text-sm font-semibold text-danger">{formatGBP(grandTotal)}</span>
      </div>

      {/* Card rows */}
      <div className="space-y-4">
        {cards.map((card) => {
          const pct = grandTotal > 0 ? (card.total / grandTotal) * 100 : 0;
          const color = CARD_COLORS[card.colorKey] ?? '#6b7280';
          return (
            <div key={card.label + card.sublabel}>
              {/* Label row */}
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">{card.label}</span>
                  <span className="text-xs text-muted">{card.sublabel}</span>
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-xs text-muted">{card.count} txns</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatGBP(card.total)}
                  </span>
                  <span className="text-xs text-muted w-9 text-right tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              {/* Bar */}
              <div className="h-1.5 bg-card-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpendingDrilldown({
  transactions,
  total,
  onReclassify,
  onClose,
}: {
  transactions: Transaction[];
  total: number;
  onReclassify: (id: string, category: string) => void;
  onClose: () => void;
}) {
  const [sortBy, setSortBy] = useState<'amount' | 'date'>('amount');
  const [categoryFilter, setCategoryFilter] = useState('');
  // Track which rows have been reclassified this session so they fade out
  const [reclassified, setReclassified] = useState<Set<string>>(new Set());

  const spendingTxns = useMemo(() => {
    return transactions
      .filter((t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category) && !reclassified.has(t.id))
      .sort((a, b) =>
        sortBy === 'amount'
          ? Math.abs(b.amount) - Math.abs(a.amount)
          : b.date.localeCompare(a.date)
      );
  }, [transactions, sortBy, reclassified]);

  const filtered = categoryFilter
    ? spendingTxns.filter((t) => t.category === categoryFilter)
    : spendingTxns;

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const t of spendingTxns) {
      cats.set(t.category, (cats.get(t.category) || 0) + Math.abs(t.amount));
    }
    return Array.from(cats.entries()).sort(([, a], [, b]) => b - a);
  }, [spendingTxns]);

  const liveTotal = useMemo(
    () => spendingTxns.reduce((s, t) => s + Math.abs(t.amount), 0),
    [spendingTxns]
  );

  function handleReclassify(id: string, category: string) {
    onReclassify(id, category);
    setReclassified((prev) => new Set(prev).add(id));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-card-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border shrink-0">
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-0.5">Spending breakdown</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold text-danger">{formatGBP(liveTotal)}</p>
              {reclassified.size > 0 && (
                <p className="text-xs text-muted">
                  ({reclassified.size} removed · was {formatGBP(total)})
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-[#111118] border border-card-border rounded-lg p-0.5">
              <button
                onClick={() => setSortBy('amount')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === 'amount' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
              >
                Largest first
              </button>
              <button
                onClick={() => setSortBy('date')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === 'date' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
              >
                Latest first
              </button>
            </div>
            <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Category filter pills */}
        <div className="px-5 py-2.5 border-b border-card-border flex gap-1.5 overflow-x-auto shrink-0 scrollbar-hide">
          <button
            onClick={() => setCategoryFilter('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${!categoryFilter ? 'bg-accent text-white' : 'bg-[#111118] text-muted hover:text-foreground border border-card-border'}`}
          >
            All ({spendingTxns.length})
          </button>
          {categories.map(([cat, amt]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${categoryFilter === cat ? 'bg-accent text-white' : 'bg-[#111118] text-muted hover:text-foreground border border-card-border'}`}
            >
              {cat} · {formatGBP(amt)}
            </button>
          ))}
        </div>

        {/* Hint */}
        <div className="px-5 py-2 bg-[#111118] border-b border-card-border shrink-0">
          <p className="text-xs text-muted">
            Hover a row to reclassify — <span className="text-foreground">Transfer</span> removes it from spending,{' '}
            <span className="text-foreground">Savings</span> moves it to investments.
          </p>
        </div>

        {/* Transaction list */}
        <div className="overflow-y-auto flex-1 divide-y divide-card-border">
          {filtered.map((t) => (
            <div key={t.id} className="group flex items-center justify-between px-5 py-2.5 hover:bg-[#111118] transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xs text-muted shrink-0 w-[72px]">
                  {format(parseISO(t.date), 'dd MMM yy')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{t.description}</p>
                  <p className="text-xs text-muted">{t.category}</p>
                </div>
              </div>
              {/* Action buttons — visible on hover */}
              <div className="hidden group-hover:flex items-center gap-1 shrink-0 mx-3">
                <button
                  onClick={() => handleReclassify(t.id, 'Transfers')}
                  title="Mark as Transfer (removes from spending)"
                  className="px-2 py-0.5 rounded text-xs font-medium bg-blue-900/40 text-blue-400 hover:bg-blue-900/70 border border-blue-800/50 transition-colors whitespace-nowrap"
                >
                  Transfer
                </button>
                <button
                  onClick={() => handleReclassify(t.id, 'Savings & Investments')}
                  title="Mark as Savings (removes from spending)"
                  className="px-2 py-0.5 rounded text-xs font-medium bg-green-900/40 text-green-400 hover:bg-green-900/70 border border-green-800/50 transition-colors whitespace-nowrap"
                >
                  Savings
                </button>
              </div>
              <span className="text-sm font-medium text-danger shrink-0 group-hover:hidden">
                {formatGBP(Math.abs(t.amount))}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted text-sm py-8">No transactions</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-card-border shrink-0">
          <p className="text-xs text-muted text-center">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
            {categoryFilter && ` in ${categoryFilter}`}
            {' · '}filtered total:{' '}
            <span className="text-foreground font-medium">
              {formatGBP(filtered.reduce((s, t) => s + Math.abs(t.amount), 0))}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-xs md:text-sm text-muted mt-0.5 md:mt-1">Household spending overview</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/upload"
          className="group border border-card-border bg-card rounded-xl p-6 hover:border-accent/50 transition-all"
        >
          <Upload className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">
            Upload Bank Statement
          </h3>
          <p className="text-sm text-muted mt-1">
            Import your NatWest CSV to get started
          </p>
        </Link>
        <div className="border border-card-border bg-card rounded-xl p-6 opacity-50">
          <TrendingUp className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold text-foreground">Spending Trends</h3>
          <p className="text-sm text-muted mt-1">Upload data first to see trends</p>
        </div>
        <div className="border border-card-border bg-card rounded-xl p-6 opacity-50">
          <Brain className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold text-foreground">AI Insights</h3>
          <p className="text-sm text-muted mt-1">Upload data first for AI analysis</p>
        </div>
      </div>
      <div className="border border-dashed border-card-border rounded-xl p-16 text-center">
        <TrendingDown className="h-16 w-16 text-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">No transactions yet</h2>
        <p className="text-muted max-w-md mx-auto mb-6">
          Upload your NatWest bank statement CSV to start tracking your household
          spending and get AI-powered insights.
        </p>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload Your First Statement
        </Link>
      </div>
    </div>
  );
}
