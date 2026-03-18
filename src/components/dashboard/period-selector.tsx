'use client';

import { Calendar } from 'lucide-react';
import { useTransactionContext } from '@/context/transactions';
import type { PeriodOption } from '@/types';

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 3 months' },
  { value: 'last6m', label: 'Last 6 months' },
  { value: 'last12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export function PeriodSelector() {
  const { period, setPeriod } = useTransactionContext();

  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="h-4 w-4 text-muted shrink-0" />
      <div className="flex items-center gap-1 bg-card border border-card-border rounded-lg p-0.5">
        {PERIOD_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              period === value
                ? 'bg-accent text-white'
                : 'text-muted hover:text-foreground hover:bg-card-border/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
