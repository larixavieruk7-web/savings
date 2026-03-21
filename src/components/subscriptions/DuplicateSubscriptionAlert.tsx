'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { formatGBP } from '@/lib/utils';
import type { PotentialDuplicate } from '@/lib/subscriptions';

interface Props {
  duplicates: PotentialDuplicate[];
}

export function DuplicateSubscriptionAlert({ duplicates }: Props) {
  if (duplicates.length === 0) return null;

  const totalWasted = duplicates.reduce((s, d) => s + d.wastedMonthlyPence, 0);

  return (
    <Link href="/insights#subscriptions">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/8 transition-colors cursor-pointer">
        <div className="relative shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-amber-300">
            {duplicates.length} potential duplicate subscription{duplicates.length !== 1 ? 's' : ''} detected
          </span>
          <span className="text-sm text-amber-400/60 ml-2">
            — wasting ~{formatGBP(totalWasted)}/month
          </span>
        </div>
        <span className="text-xs text-amber-400/50 shrink-0 font-medium">Review →</span>
      </div>
    </Link>
  );
}
