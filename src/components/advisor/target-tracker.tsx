'use client';

import { useState, useMemo } from 'react';
import { Target, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import type { SpendingTarget } from '@/types';

interface TargetTrackerProps {
  targets: SpendingTarget[];
  spendingByCategory: Record<string, number>; // pence, from transaction totals
  daysLeftInCycle?: number;
  daysInCycle?: number;
}

type Status = 'on_track' | 'approaching' | 'exceeded';

interface CategoryProgress {
  category: string;
  spent: number;     // pence (absolute)
  target: number;    // pence
  remaining: number; // pence (positive = under, negative = over)
  pct: number;       // 0-100+
  status: Status;
  projection?: number; // pence, projected spend by end of cycle
}

const COMPACT_LIMIT = 6;

const formatGBP = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
    .format(Math.abs(pence) / 100);

function projectSpend(spent: number, daysElapsed: number, totalDays: number): number {
  if (daysElapsed <= 0) return spent;
  return Math.round((spent / daysElapsed) * totalDays);
}

const STATUS_ORDER: Record<Status, number> = {
  exceeded: 0,
  approaching: 1,
  on_track: 2,
};

const STATUS_COLORS: Record<Status, { bar: string; text: string; bg: string }> = {
  on_track:    { bar: 'bg-success',  text: 'text-success',  bg: 'bg-success/20' },
  approaching: { bar: 'bg-warning',  text: 'text-warning',  bg: 'bg-warning/20' },
  exceeded:    { bar: 'bg-danger',   text: 'text-danger',   bg: 'bg-danger/20' },
};

export function TargetTracker({
  targets,
  spendingByCategory,
  daysLeftInCycle,
  daysInCycle,
}: TargetTrackerProps) {
  const [expanded, setExpanded] = useState(false);

  const daysElapsed = useMemo(() => {
    if (daysInCycle == null || daysLeftInCycle == null) return undefined;
    return daysInCycle - daysLeftInCycle;
  }, [daysInCycle, daysLeftInCycle]);

  // Build progress entries for each target
  const progressRows = useMemo(() => {
    const rows: CategoryProgress[] = targets.map((t) => {
      const rawSpend = spendingByCategory[t.category] ?? 0;
      const spent = Math.abs(rawSpend); // ensure positive
      const remaining = t.targetAmount - spent;
      const pct = t.targetAmount > 0 ? Math.round((spent / t.targetAmount) * 100) : 0;

      let status: Status = 'on_track';
      if (pct > 100) {
        status = 'exceeded';
      } else if (pct > 80) {
        status = 'approaching';
      }

      let projection: number | undefined;
      if (daysElapsed != null && daysInCycle != null && daysElapsed > 0) {
        projection = projectSpend(spent, daysElapsed, daysInCycle);
      }

      return { category: t.category, spent, target: t.targetAmount, remaining, pct, status, projection };
    });

    // Sort: exceeded first, then approaching, then on_track
    rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.pct - a.pct);
    return rows;
  }, [targets, spendingByCategory, daysElapsed, daysInCycle]);

  // Totals row
  const totals = useMemo(() => {
    const totalSpent = progressRows.reduce((sum, r) => sum + r.spent, 0);
    const totalTarget = progressRows.reduce((sum, r) => sum + r.target, 0);
    const pct = totalTarget > 0 ? Math.round((totalSpent / totalTarget) * 100) : 0;
    let status: Status = 'on_track';
    if (pct > 100) status = 'exceeded';
    else if (pct > 80) status = 'approaching';
    return { spent: totalSpent, target: totalTarget, pct, status };
  }, [progressRows]);

  if (targets.length === 0) return null;

  const visibleRows = expanded ? progressRows : progressRows.slice(0, COMPACT_LIMIT);
  const hasMore = progressRows.length > COMPACT_LIMIT;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-accent" />
        <h3 className="text-base md:text-lg font-semibold text-foreground">
          Spending Targets
        </h3>
        {daysLeftInCycle != null && (
          <span className="ml-auto text-xs text-muted">
            {daysLeftInCycle} day{daysLeftInCycle !== 1 ? 's' : ''} left in cycle
          </span>
        )}
      </div>

      {/* Category rows */}
      <div className="space-y-3">
        {visibleRows.map((row) => (
          <CategoryRow key={row.category} row={row} />
        ))}
      </div>

      {/* Show all toggle */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover mt-3 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show all ({progressRows.length} categories)
            </>
          )}
        </button>
      )}

      {/* Totals row */}
      <div className="mt-4 pt-3 border-t border-card-border">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="font-semibold text-foreground">Total Budget</span>
          <span className="text-muted">
            <span className={STATUS_COLORS[totals.status].text}>
              {formatGBP(totals.spent)}
            </span>
            {' / '}
            {formatGBP(totals.target)}
            <span className={`ml-2 text-xs ${STATUS_COLORS[totals.status].text}`}>
              ({totals.pct}%)
            </span>
          </span>
        </div>
        <ProgressBar pct={totals.pct} status={totals.status} />
      </div>
    </div>
  );
}

/* ── Category Row ─────────────────────────────────────────── */

function CategoryRow({ row }: { row: CategoryProgress }) {
  const colors = STATUS_COLORS[row.status];

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-foreground truncate mr-2">{row.category}</span>
        <span className="text-muted whitespace-nowrap text-xs">
          <span className={colors.text}>{formatGBP(row.spent)}</span>
          {' / '}
          {formatGBP(row.target)}
          <span className={`ml-1.5 ${colors.text}`}>({row.pct}%)</span>
        </span>
      </div>
      <ProgressBar pct={row.pct} status={row.status} />
      {/* Projection line */}
      {row.projection != null && row.projection > row.target && (
        <div className="flex items-center gap-1 mt-0.5">
          <TrendingUp className="h-3 w-3 text-danger" />
          <span className="text-[11px] text-danger">
            At this pace: {formatGBP(row.projection)} by end of cycle
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Progress Bar ─────────────────────────────────────────── */

function ProgressBar({ pct, status }: { pct: number; status: Status }) {
  const colors = STATUS_COLORS[status];
  const clampedPct = Math.min(pct, 100);

  return (
    <div className={`h-2 rounded-full ${colors.bg} overflow-hidden`}>
      <div
        className={`h-full rounded-full ${colors.bar} transition-all duration-500 ease-out`}
        style={{ width: `${clampedPct}%` }}
      />
    </div>
  );
}
