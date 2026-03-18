'use client';

import { useState, useMemo } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { formatGBP, gbpTooltipFormatter } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import type { CategoryName } from '@/types';
import { format, parseISO } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { PeriodSelector } from '@/components/dashboard/period-selector';

export default function TrendsPage() {
  const { transactions, loaded, monthlyBreakdowns, categoryBreakdown } =
    useTransactionContext();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Get all unique categories from monthly data
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const m of monthlyBreakdowns) {
      for (const c of Object.keys(m.byCategory)) cats.add(c);
    }
    return Array.from(cats).sort(
      (a, b) =>
        (categoryBreakdown.find((x) => x.category === b)?.amount || 0) -
        (categoryBreakdown.find((x) => x.category === a)?.amount || 0)
    );
  }, [monthlyBreakdowns, categoryBreakdown]);

  // Default to top 5 categories if none selected
  const activeCats =
    selectedCategories.length > 0
      ? selectedCategories
      : allCategories.slice(0, 5);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Income vs Spending over time (area chart)
  const cashFlowData = monthlyBreakdowns.map((m) => ({
    month: format(parseISO(`${m.month}-01`), 'MMM yy'),
    income: m.income / 100,
    spending: m.spending / 100,
    net: m.net / 100,
  }));

  // Category trends over time (line chart)
  const categoryTrendData = monthlyBreakdowns.map((m) => {
    const point: Record<string, string | number> = {
      month: format(parseISO(`${m.month}-01`), 'MMM yy'),
    };
    for (const cat of activeCats) {
      point[cat] = (m.byCategory[cat] || 0) / 100;
    }
    return point;
  });

  // Month-over-month changes for the latest 2 months
  const changes = useMemo(() => {
    if (monthlyBreakdowns.length < 2) return [];
    const current = monthlyBreakdowns[monthlyBreakdowns.length - 1];
    const prev = monthlyBreakdowns[monthlyBreakdowns.length - 2];
    return allCategories
      .map((cat) => {
        const curr = current.byCategory[cat] || 0;
        const prv = prev.byCategory[cat] || 0;
        const change = prv > 0 ? ((curr - prv) / prv) * 100 : curr > 0 ? 100 : 0;
        return { category: cat, current: curr, previous: prv, change };
      })
      .filter((c) => c.current > 0 || c.previous > 0)
      .sort((a, b) => b.change - a.change);
  }, [monthlyBreakdowns, allCategories]);

  if (!loaded) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted">Loading...</p></div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-foreground">Trends</h1>
        <div className="border border-dashed border-card-border rounded-xl p-16 text-center">
          <p className="text-muted mb-4">Upload a bank statement to see spending trends.</p>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Spending Trends</h1>
          <p className="text-muted mt-1">
            Track how your spending changes over time
          </p>
        </div>
        <PeriodSelector />
      </div>

      {/* Cash Flow Area Chart */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Cash Flow Over Time
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={cashFlowData}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="spendingGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 12 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(v) => `£${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '8px', color: '#e5e7eb' }}
              formatter={gbpTooltipFormatter}
            />
            <Legend />
            <Area type="monotone" dataKey="income" name="Income" stroke="#22c55e" fill="url(#incomeGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="spending" name="Spending" stroke="#ef4444" fill="url(#spendingGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Net Savings Bar Chart */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Monthly Net Savings
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={cashFlowData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 12 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(v) => `£${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '8px', color: '#e5e7eb' }}
              formatter={gbpTooltipFormatter}
            />
            <Bar
              dataKey="net"
              name="Net"
              radius={[4, 4, 0, 0]}
              fill="#6366f1"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Trends Line Chart */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Category Trends
        </h3>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {allCategories.map((cat) => {
            const isActive = activeCats.includes(cat);
            const color = CATEGORY_COLORS[cat as CategoryName] || '#a1a1aa';
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border"
                style={{
                  backgroundColor: isActive ? `${color}20` : 'transparent',
                  borderColor: isActive ? color : '#1e1e2e',
                  color: isActive ? color : '#6b7280',
                }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isActive ? color : '#6b7280' }}
                />
                {cat}
              </button>
            );
          })}
        </div>

        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={categoryTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 12 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(v) => `£${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '8px', color: '#e5e7eb' }}
              formatter={gbpTooltipFormatter}
            />
            <Legend />
            {activeCats.map((cat) => (
              <Line
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={CATEGORY_COLORS[cat as CategoryName] || '#a1a1aa'}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Month-over-Month Changes */}
      {changes.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Month-over-Month Changes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {changes.map(({ category, current, previous, change }) => {
              const color = CATEGORY_COLORS[category as CategoryName] || '#a1a1aa';
              const isUp = change > 0;
              return (
                <div
                  key={category}
                  className="flex items-center justify-between p-3 rounded-lg border border-card-border"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-foreground">{category}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">
                      {formatGBP(current)}
                    </span>
                    <p className={`text-xs ${isUp ? 'text-danger' : 'text-success'}`}>
                      {isUp ? '+' : ''}{change.toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
