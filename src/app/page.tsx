'use client';

import { Upload, TrendingUp, Brain, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Link from 'next/link';
import { useTransactionContext } from '@/context/transactions';
import { formatGBP, formatChange, gbpTooltipFormatter } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import type { CategoryName } from '@/types';
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

export default function DashboardHome() {
  const {
    transactions,
    loaded,
    totalIncome,
    totalSpending,
    categoryBreakdown,
    monthlyBreakdowns,
    dateRange,
  } = useTransactionContext();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return <EmptyState />;
  }

  const net = totalIncome - totalSpending;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          {dateRange && (
            <p className="text-muted mt-1">
              {format(parseISO(dateRange.from), 'dd MMM yyyy')} —{' '}
              {format(parseISO(dateRange.to), 'dd MMM yyyy')} ·{' '}
              {transactions.length.toLocaleString()} transactions
            </p>
          )}
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload More
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        />
        <KpiCard
          label="Net Savings"
          value={formatGBP(net)}
          positive={net >= 0}
        />
        <KpiCard
          label="Savings Rate"
          value={`${savingsRate.toFixed(1)}%`}
          positive={savingsRate > 0}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Spending Bar Chart */}
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Income vs Spending
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(v) => `£${v.toLocaleString()}`} />
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

        {/* Category Donut */}
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Spending by Category
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
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
          <div className="grid grid-cols-2 gap-2 mt-2">
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

      {/* Top Spending Categories */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Top Spending Categories
        </h3>
        <div className="space-y-3">
          {categoryBreakdown.slice(0, 10).map(({ category, amount }) => {
            const pct = (amount / totalSpending) * 100;
            const color = CATEGORY_COLORS[category as CategoryName] || '#a1a1aa';
            return (
              <div key={category}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-foreground">{category}</span>
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
    </div>
  );
}

function KpiCard({
  label,
  value,
  change,
  positive,
}: {
  label: string;
  value: string;
  change?: string;
  positive: boolean;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <p className="text-sm text-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${positive ? 'text-success' : 'text-danger'}`}>
        {value}
      </p>
      {change && (
        <div className="flex items-center gap-1 mt-1">
          {change.startsWith('+') ? (
            <ArrowUpRight className="h-3 w-3 text-muted" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-muted" />
          )}
          <span className="text-xs text-muted">{change} vs prev month</span>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted mt-1">Household spending overview</p>
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
