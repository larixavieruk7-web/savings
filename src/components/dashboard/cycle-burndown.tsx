'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { format, parseISO, eachDayOfInterval, differenceInDays } from 'date-fns';
import { formatGBP } from '@/lib/utils';
import type { Transaction } from '@/types';
import { Flame } from 'lucide-react';

const INTERNAL_CATEGORIES = new Set(['Transfers', 'Savings & Investments']);

interface CycleBurndownProps {
  transactions: Transaction[];
  cycleStart: string;
  cycleEnd: string;
  totalSalary: number;
  isOpen: boolean;
}

interface BurndownPoint {
  date: string;
  label: string;
  remaining: number;     // budget remaining (salary - cumulative spend)
  cumulativeSpend: number;
  projected?: number;    // linear projection of remaining
}

export function CycleBurndown({ transactions, cycleStart, cycleEnd, totalSalary, isOpen }: CycleBurndownProps) {
  const data = useMemo((): BurndownPoint[] => {
    if (!isOpen || totalSalary <= 0) return [];
    // Group spending by date
    const spendByDate = new Map<string, number>();
    for (const t of transactions) {
      if (t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)) {
        const existing = spendByDate.get(t.date) ?? 0;
        spendByDate.set(t.date, existing + Math.abs(t.amount));
      }
    }

    const start = parseISO(cycleStart);
    const end = parseISO(cycleEnd);
    const days = eachDayOfInterval({ start, end });

    let cumulative = 0;
    const points: BurndownPoint[] = [];

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      cumulative += spendByDate.get(dateStr) ?? 0;
      points.push({
        date: dateStr,
        label: format(day, 'd MMM'),
        remaining: totalSalary - cumulative,
        cumulativeSpend: cumulative,
      });
    }

    // Linear projection from current spend rate to estimated cycle end (~30 days from start)
    if (points.length >= 2) {
      const daysElapsed = points.length;
      const totalCycleDays = Math.max(30, differenceInDays(end, start) + 1);
      const dailySpendRate = cumulative / daysElapsed;
      const projectedTotalSpend = dailySpendRate * totalCycleDays;
      const projectedRemaining = totalSalary - projectedTotalSpend;

      // Add projection to last point
      points[points.length - 1].projected = points[points.length - 1].remaining;

      // Add projected end point (only if cycle still has days to go)
      if (daysElapsed < totalCycleDays) {
        const projectedEndDate = format(
          new Date(start.getTime() + (totalCycleDays - 1) * 86400000),
          'yyyy-MM-dd'
        );
        points.push({
          date: projectedEndDate,
          label: format(new Date(start.getTime() + (totalCycleDays - 1) * 86400000), 'd MMM'),
          remaining: points[points.length - 1].remaining, // keep actual line flat after today
          cumulativeSpend: cumulative,
          projected: Math.max(0, projectedRemaining),
        });
      }
    }

    return points;
  }, [transactions, cycleStart, cycleEnd, totalSalary, isOpen]);

  if (!isOpen || totalSalary <= 0 || data.length === 0) return null;

  const projectedEnd = data[data.length - 1]?.projected;
  const onTrack = projectedEnd !== undefined && projectedEnd > 0;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-foreground">Salary Burndown</h3>
        </div>
        <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          onTrack
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-red-500/10 text-red-400'
        }`}>
          {onTrack
            ? `~${formatGBP(projectedEnd ?? 0)} left at payday`
            : 'On track to overspend'}
        </div>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--muted)', fontSize: 10 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--muted)', fontSize: 10 }}
              tickFormatter={(v: number) => `£${(v / 100).toFixed(0)}`}
              tickLine={false}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--card-border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: unknown, name: unknown) => [
                formatGBP(Number(value)),
                name === 'remaining' ? 'Remaining' : name === 'projected' ? 'Projected' : String(name),
              ]}
              labelFormatter={(label: unknown) => String(label)}
            />
            <ReferenceLine
              y={0}
              stroke="var(--danger)"
              strokeWidth={1}
              strokeDasharray="4 4"
              label={{ value: '£0', fill: 'var(--danger)', fontSize: 10, position: 'right' }}
            />
            <Area
              type="monotone"
              dataKey="remaining"
              fill="var(--accent)"
              fillOpacity={0.08}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="var(--warning, #f59e0b)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
