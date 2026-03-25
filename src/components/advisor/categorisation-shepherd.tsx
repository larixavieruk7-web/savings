'use client';

import { useState, useMemo, useCallback } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Transaction } from '@/types';

interface CategorisationShepherdProps {
  transactions: Transaction[];
  onCategorizeComplete?: () => void;
}

type ShepherdState = 'idle' | 'categorizing' | 'partial' | 'done';

const BATCH_SIZE = 150;

export function CategorisationShepherd({
  transactions,
  onCategorizeComplete,
}: CategorisationShepherdProps) {
  const [state, setState] = useState<ShepherdState>('idle');
  const [batchesDone, setBatchesDone] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [categorizedSoFar, setCategorizedSoFar] = useState(0);
  const [remainingCount, setRemainingCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Uncategorized = category 'Other', not manually set, spending only
  const uncategorized = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.amount < 0 &&
          t.category === 'Other' &&
          t.categorySource !== 'manual'
      ),
    [transactions]
  );

  const count = uncategorized.length;

  const handleCategorize = useCallback(async () => {
    if (uncategorized.length === 0) return;

    setState('categorizing');
    setBatchesDone(0);
    setCategorizedSoFar(0);

    // Split into batches
    const batches: Transaction[][] = [];
    for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
      batches.push(uncategorized.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);

    let totalCategorized = 0;

    // Process batches sequentially to avoid overwhelming the API
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      try {
        const payload = batch.map((t) => ({
          id: t.id,
          description: t.merchantName
            ? `${t.merchantName} — ${t.description}`
            : t.description,
          amount: t.amount,
          merchant: t.merchantName || null,
        }));

        const res = await fetch('/api/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: payload }),
        });

        if (res.ok) {
          const { results } = await res.json() as {
            results: { id: string; category: string; isEssential: boolean }[];
          };

          // Build updates for transactions that got a valid category
          const updates: { id: string; category: string; isEssential: boolean; categorySource: 'ai' }[] = [];
          for (const r of results) {
            if (r.category && r.category !== '' && r.category !== 'Other') {
              updates.push({
                id: r.id,
                category: r.category,
                isEssential: r.isEssential,
                categorySource: 'ai' as const,
              });
            }
          }

          // Apply updates via the storage layer
          if (updates.length > 0) {
            const { updateTransactions } = await import('@/lib/storage');
            await updateTransactions(updates);
            totalCategorized += updates.length;
          }
        }
      } catch (err) {
        console.error(`[shepherd] Batch ${batchIdx + 1} failed:`, err);
      }

      setBatchesDone(batchIdx + 1);
      setCategorizedSoFar(totalCategorized);
    }

    // Check how many remain
    const stillUncategorized = uncategorized.length - totalCategorized;
    setRemainingCount(stillUncategorized);

    if (stillUncategorized > 0) {
      setState('partial');
    } else {
      setState('done');
      onCategorizeComplete?.();
    }
  }, [uncategorized, onCategorizeComplete]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onCategorizeComplete?.();
  }, [onCategorizeComplete]);

  // Nothing to show
  if (dismissed || (count === 0 && state === 'idle')) {
    return null;
  }

  // Done state — briefly show success then disappear
  if (state === 'done') {
    return (
      <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            All done! {categorizedSoFar} transactions categorized.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Partial state — some couldn't be categorized
  if (state === 'partial') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              <strong>{remainingCount} still uncategorized</strong> — AI couldn&apos;t figure these out.
              {categorizedSoFar > 0 && (
                <span className="text-muted ml-1">
                  ({categorizedSoFar} were categorized successfully)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <Link
            href="/transactions?filter=uncategorized"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Review Manually
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={handleDismiss}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Categorizing state — show progress
  if (state === 'categorizing') {
    const pct = totalBatches > 0 ? (batchesDone / totalBatches) * 100 : 0;
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <Loader2 className="h-5 w-5 text-amber-400 shrink-0 animate-spin" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Categorizing... {categorizedSoFar}/{count}
            </p>
            <p className="text-xs text-muted mt-0.5">
              Batch {batchesDone}/{totalBatches} — this may take a moment
            </p>
          </div>
        </div>
        <div className="h-2 bg-card-border rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // Idle state — show nag banner
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            <strong>{count} transaction{count !== 1 ? 's' : ''} need categorizing.</strong>{' '}
            I can&apos;t give you a proper analysis until these are sorted.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleCategorize}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Categorize Now
          <ArrowRight className="h-4 w-4" />
        </button>
        <Link
          href="/transactions?filter=uncategorized"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Review manually instead
        </Link>
      </div>
    </div>
  );
}
