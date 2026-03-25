'use client';

import { useState, useMemo } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
  CircleDot,
} from 'lucide-react';
import type { AdvisorCommitment } from '@/types';

/* ── Props ──────────────────────────────────────────────────── */

interface CommitmentListProps {
  commitments: AdvisorCommitment[];
  onComplete: (id: string, outcome?: string) => void;
  onDefer: (id: string) => void;
  onAdd?: () => void;
}

/* ── Type badge config ──────────────────────────────────────── */

const TYPE_BADGES: Record<
  AdvisorCommitment['type'],
  { label: string; className: string }
> = {
  reduce_spending: { label: 'Reduce', className: 'bg-blue-500/20 text-blue-400' },
  renegotiate:     { label: 'Renegotiate', className: 'bg-warning/20 text-warning' },
  cancel:          { label: 'Cancel', className: 'bg-danger/20 text-danger' },
  investigate:     { label: 'Investigate', className: 'bg-purple-500/20 text-purple-400' },
  save:            { label: 'Save', className: 'bg-success/20 text-success' },
  other:           { label: 'Other', className: 'bg-zinc-500/20 text-zinc-400' },
};

/* ── Component ──────────────────────────────────────────────── */

export function CommitmentList({
  commitments,
  onComplete,
  onDefer,
  onAdd,
}: CommitmentListProps) {
  const [outcomeInputId, setOutcomeInputId] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  // Split into groups
  const { overdue, current, recentlyCompleted } = useMemo(() => {
    const now = new Date().toISOString();
    const overdueItems: AdvisorCommitment[] = [];
    const currentItems: AdvisorCommitment[] = [];
    const completedItems: AdvisorCommitment[] = [];

    for (const c of commitments) {
      if (c.status === 'completed') {
        completedItems.push(c);
      } else if (
        c.status === 'active' &&
        c.dueCycleId !== undefined &&
        c.cycleId !== c.dueCycleId &&
        c.dueCycleId < c.cycleId
      ) {
        // Overdue: dueCycleId is before the commitment's current cycle
        overdueItems.push(c);
      } else if (c.status === 'active') {
        currentItems.push(c);
      }
    }

    return {
      overdue: overdueItems,
      current: currentItems,
      recentlyCompleted: completedItems.slice(0, 5), // last 5
    };
  }, [commitments]);

  const activeCount = overdue.length + current.length;

  // Handle "Done" click — if outcome input is already open, submit; otherwise open it
  function handleDone(id: string) {
    if (outcomeInputId === id) {
      onComplete(id, outcomeText.trim() || undefined);
      setOutcomeInputId(null);
      setOutcomeText('');
    } else {
      // Complete immediately (user can choose to add outcome via long-press pattern later)
      onComplete(id);
    }
  }

  function handleDoneWithOutcome(id: string) {
    if (outcomeInputId === id) {
      // Already open — submit
      onComplete(id, outcomeText.trim() || undefined);
      setOutcomeInputId(null);
      setOutcomeText('');
    } else {
      setOutcomeInputId(id);
      setOutcomeText('');
    }
  }

  function handleDefer(id: string) {
    onDefer(id);
  }

  /* ── Empty state ────────────────────────────────────────── */

  if (activeCount === 0 && recentlyCompleted.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-accent" />
          <h3 className="text-base md:text-lg font-semibold text-foreground">
            Active Commitments
          </h3>
          {onAdd && (
            <button
              onClick={onAdd}
              className="ml-auto flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
        <p className="text-sm text-muted text-center py-4">
          No active commitments. They&apos;ll appear after your next monthly review.
        </p>
      </div>
    );
  }

  /* ── Main render ────────────────────────────────────────── */

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="h-5 w-5 text-accent" />
        <h3 className="text-base md:text-lg font-semibold text-foreground">
          Active Commitments
          {activeCount > 0 && (
            <span className="text-muted font-normal ml-1.5">({activeCount})</span>
          )}
        </h3>
        {onAdd && (
          <button
            onClick={onAdd}
            className="ml-auto flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Overdue section */}
        {overdue.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-semibold text-warning uppercase tracking-wide">
                Overdue
              </span>
            </div>
            <div className="space-y-2">
              {overdue.map((c) => (
                <CommitmentRow
                  key={c.id}
                  commitment={c}
                  isOverdue
                  outcomeInputId={outcomeInputId}
                  outcomeText={outcomeText}
                  onOutcomeTextChange={setOutcomeText}
                  onDone={handleDone}
                  onDoneWithOutcome={handleDoneWithOutcome}
                  onDefer={handleDefer}
                />
              ))}
            </div>
          </div>
        )}

        {/* Current section */}
        {current.length > 0 && (
          <div>
            {overdue.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2">
                <CircleDot className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Current
                </span>
              </div>
            )}
            <div className="space-y-2">
              {current.map((c) => (
                <CommitmentRow
                  key={c.id}
                  commitment={c}
                  isOverdue={false}
                  outcomeInputId={outcomeInputId}
                  outcomeText={outcomeText}
                  onOutcomeTextChange={setOutcomeText}
                  onDone={handleDone}
                  onDoneWithOutcome={handleDoneWithOutcome}
                  onDefer={handleDefer}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recently completed (collapsed) */}
        {recentlyCompleted.length > 0 && (
          <div className="pt-2 border-t border-card-border">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
            >
              {showCompleted ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Recently completed ({recentlyCompleted.length})
            </button>
            {showCompleted && (
              <div className="mt-2 space-y-1.5">
                {recentlyCompleted.map((c) => (
                  <CompletedRow key={c.id} commitment={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Commitment Row ────────────────────────────────────────── */

function CommitmentRow({
  commitment,
  isOverdue,
  outcomeInputId,
  outcomeText,
  onOutcomeTextChange,
  onDone,
  onDoneWithOutcome,
  onDefer,
}: {
  commitment: AdvisorCommitment;
  isOverdue: boolean;
  outcomeInputId: string | null;
  outcomeText: string;
  onOutcomeTextChange: (text: string) => void;
  onDone: (id: string) => void;
  onDoneWithOutcome: (id: string) => void;
  onDefer: (id: string) => void;
}) {
  const badge = TYPE_BADGES[commitment.type];
  const showOutcomeInput = outcomeInputId === commitment.id;

  return (
    <div
      className={`rounded-lg p-3 transition-colors ${
        isOverdue
          ? 'bg-warning/5 border border-warning/30'
          : 'bg-background border border-card-border'
      }`}
    >
      {/* Main content */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0">
          <div
            className={`h-4 w-4 rounded border-2 ${
              isOverdue ? 'border-warning' : 'border-muted'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug">
            {commitment.commitment}
            {isOverdue && (
              <span className="text-warning text-xs ml-1.5">
                — due last cycle
              </span>
            )}
          </p>

          {/* Metadata line */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            {commitment.relatedCategory && (
              <span className="text-[11px] text-muted">
                {commitment.relatedCategory}
              </span>
            )}
            {commitment.relatedMerchant && (
              <span className="text-[11px] text-muted">
                · {commitment.relatedMerchant}
              </span>
            )}
          </div>

          {/* Outcome input */}
          {showOutcomeInput && (
            <div className="mt-2">
              <input
                type="text"
                value={outcomeText}
                onChange={(e) => onOutcomeTextChange(e.target.value)}
                placeholder="What was the outcome? (optional)"
                className="w-full text-xs bg-background border border-card-border rounded px-2 py-1.5 text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onDone(commitment.id);
                  if (e.key === 'Escape') onOutcomeTextChange('');
                }}
                autoFocus
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => onDone(commitment.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-success hover:text-success/80 transition-colors"
              title="Mark as done"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done
            </button>
            <button
              onClick={() => onDoneWithOutcome(commitment.id)}
              className="text-[11px] text-muted hover:text-foreground transition-colors"
              title="Done with outcome note"
            >
              + note
            </button>
            <span className="text-card-border">|</span>
            <button
              onClick={() => onDefer(commitment.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground transition-colors"
              title="Defer to next cycle"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Defer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Completed Row ─────────────────────────────────────────── */

function CompletedRow({ commitment }: { commitment: AdvisorCommitment }) {
  const badge = TYPE_BADGES[commitment.type];

  return (
    <div className="flex items-start gap-2 opacity-60">
      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-foreground line-through leading-snug">
          {commitment.commitment}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {commitment.outcome && (
            <span className="text-[11px] text-muted italic">
              {commitment.outcome}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
