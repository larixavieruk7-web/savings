'use client';

import { Calendar } from 'lucide-react';
import { useTransactionContext } from '@/context/transactions';

export function PeriodSelector() {
  const { period, setPeriod, availableCycles } = useTransactionContext();

  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="h-4 w-4 text-muted shrink-0" />
      <div className="flex items-center gap-1 bg-card border border-card-border rounded-lg p-0.5 flex-wrap">
        {availableCycles.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPeriod(id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              period === id
                ? 'bg-accent text-white'
                : 'text-muted hover:text-foreground hover:bg-card-border/50'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setPeriod('all')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            period === 'all'
              ? 'bg-accent text-white'
              : 'text-muted hover:text-foreground hover:bg-card-border/50'
          }`}
        >
          All time
        </button>
      </div>
    </div>
  );
}
