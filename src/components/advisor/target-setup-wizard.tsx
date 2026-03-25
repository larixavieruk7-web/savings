'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Target,
  Loader2,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react';
import type { SpendingTarget } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────

/** Format pence as GBP using Math.abs (targets are always positive) */
const formatGBP = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    Math.abs(pence) / 100,
  );

/** Parse a GBP-style string (e.g. "320.50") into pence (integer) */
function parsePounds(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

// ─── Types ──────────────────────────────────────────────────────

interface HistoricalCategory {
  category: string;
  last3Cycles: number[]; // pence per cycle
  average: number; // pence
}

interface TargetSetupWizardProps {
  cycleId: string;
  historicalSpending: HistoricalCategory[];
  onComplete: (targets: SpendingTarget[]) => void;
  onDismiss: () => void;
}

interface AISuggestion {
  category: string;
  suggestedTarget: number; // pence
  rationale: string;
  difficulty: 'easy' | 'moderate' | 'stretch';
}

interface AIResponse {
  suggestions: AISuggestion[];
  overallSavingsTarget: number; // pence
  message: string;
}

/** One row in the review table — tracks AI suggestion + user override */
interface TargetRow {
  category: string;
  average: number; // pence — 3-cycle rolling average
  previousActual: number; // pence — most recent cycle
  aiTarget: number; // pence — what AI suggested
  userTarget: number; // pence — what user has set (starts = aiTarget)
  modified: boolean; // true if user changed from AI suggestion
  rationale: string;
  difficulty: 'easy' | 'moderate' | 'stretch';
}

type Step = 'intro' | 'review' | 'confirm';

// ─── Component ──────────────────────────────────────────────────

export function TargetSetupWizard({
  cycleId,
  historicalSpending,
  onComplete,
  onDismiss,
}: TargetSetupWizardProps) {
  const [step, setStep] = useState<Step>('intro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string>('');
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Readable cycle label (e.g. "Mar 2026")
  const cycleLabel = useMemo(() => {
    // cycleId format: "cycle-YYYY-MM" — the month the cycle starts
    const match = cycleId.match(/cycle-(\d{4})-(\d{2})/);
    if (!match) return cycleId;
    const date = new Date(Number(match[1]), Number(match[2]) - 1);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [cycleId]);

  // ── Step 1: Fetch AI suggestions ──────────────────────────────

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/advisor/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest',
          cycleId,
          historicalSpending,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `API error ${res.status}`);
      }

      const data = await res.json();
      const aiResponse: AIResponse = data.targets ?? data;

      if (!aiResponse.suggestions || aiResponse.suggestions.length === 0) {
        throw new Error('No suggestions returned. Try again.');
      }

      // Build rows merging AI suggestions with historical data
      const newRows: TargetRow[] = aiResponse.suggestions.map((s) => {
        const hist = historicalSpending.find((h) => h.category === s.category);
        return {
          category: s.category,
          average: hist?.average ?? 0,
          previousActual: hist?.last3Cycles?.[hist.last3Cycles.length - 1] ?? 0,
          aiTarget: s.suggestedTarget,
          userTarget: s.suggestedTarget,
          modified: false,
          rationale: s.rationale,
          difficulty: s.difficulty,
        };
      });

      setRows(newRows);
      setAiMessage(aiResponse.message || '');
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  }, [cycleId, historicalSpending]);

  // ── Step 2: Row editing ───────────────────────────────────────

  const updateRowTarget = useCallback(
    (category: string, newValue: string) => {
      const pence = parsePounds(newValue);
      setRows((prev) =>
        prev.map((r) =>
          r.category === category
            ? { ...r, userTarget: pence, modified: pence !== r.aiTarget }
            : r,
        ),
      );
    },
    [],
  );

  const resetRow = useCallback((category: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.category === category
          ? { ...r, userTarget: r.aiTarget, modified: false }
          : r,
      ),
    );
  }, []);

  // Computed totals
  const totalTarget = useMemo(() => rows.reduce((s, r) => s + r.userTarget, 0), [rows]);
  const totalAverage = useMemo(() => rows.reduce((s, r) => s + r.average, 0), [rows]);
  const totalSaved = totalAverage - totalTarget;

  // ── Step 3: Confirm & save ────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    setSaving(true);

    const targets: SpendingTarget[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      userId: '', // set by storage layer
      cycleId,
      category: r.category,
      targetAmount: r.userTarget,
      aiSuggested: !r.modified,
      previousActual: r.previousActual,
      rollingAverage: r.average,
      createdAt: new Date().toISOString(),
    }));

    try {
      // Import saveSpendingTargets and call it directly for auto-save
      const { saveSpendingTargets } = await import('@/lib/storage');
      await saveSpendingTargets(targets);
      onComplete(targets);
    } catch (err) {
      console.error('Failed to save targets:', err);
      setError('Failed to save targets. Please try again.');
      setSaving(false);
    }
  }, [rows, cycleId, onComplete]);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-card-border">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-accent" />
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Spending Targets
          </h2>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 text-muted hover:text-foreground transition-colors rounded-lg hover:bg-card-border/50"
          aria-label="Dismiss wizard"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step indicator */}
      <div className="px-4 md:px-6 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted mb-4">
          <StepDot active={step === 'intro'} done={step === 'review' || step === 'confirm'} label="1" />
          <div className="flex-1 h-px bg-card-border" />
          <StepDot active={step === 'review'} done={step === 'confirm'} label="2" />
          <div className="flex-1 h-px bg-card-border" />
          <StepDot active={step === 'confirm'} done={false} label="3" />
        </div>
      </div>

      {/* Step content */}
      <div className="px-4 pb-5 md:px-6 md:pb-6">
        {step === 'intro' && (
          <IntroStep
            cycleLabel={cycleLabel}
            categoryCount={historicalSpending.length}
            loading={loading}
            error={error}
            onFetch={fetchSuggestions}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            rows={rows}
            aiMessage={aiMessage}
            totalTarget={totalTarget}
            totalAverage={totalAverage}
            totalSaved={totalSaved}
            onUpdateTarget={updateRowTarget}
            onResetRow={resetRow}
            onBack={() => setStep('intro')}
            onNext={() => setStep('confirm')}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            rows={rows}
            totalTarget={totalTarget}
            totalSaved={totalSaved}
            saving={saving}
            error={error}
            onBack={() => setStep('review')}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
        done
          ? 'bg-success/20 text-success'
          : active
            ? 'bg-accent text-white'
            : 'bg-card-border text-muted'
      }`}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : label}
    </div>
  );
}

// ── Step 1: Intro ───────────────────────────────────────────────

function IntroStep({
  cycleLabel,
  categoryCount,
  loading,
  error,
  onFetch,
}: {
  cycleLabel: string;
  categoryCount: number;
  loading: boolean;
  error: string | null;
  onFetch: () => void;
}) {
  return (
    <div className="text-center py-4 md:py-8">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
        <Sparkles className="h-6 w-6 text-accent" />
      </div>
      <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">
        Let&apos;s set your spending targets for {cycleLabel}
      </h3>
      <p className="text-sm text-muted max-w-md mx-auto mb-6">
        I&apos;ll suggest targets based on your last 3 months across{' '}
        <strong className="text-foreground">{categoryCount} categories</strong>.
        You can adjust any of them.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-danger max-w-md mx-auto">
          {error}
        </div>
      )}

      <button
        onClick={onFetch}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysing your spending...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Get AI Suggestions
          </>
        )}
      </button>
    </div>
  );
}

// ── Step 2: Review & Adjust ─────────────────────────────────────

function ReviewStep({
  rows,
  aiMessage,
  totalTarget,
  totalAverage,
  totalSaved,
  onUpdateTarget,
  onResetRow,
  onBack,
  onNext,
}: {
  rows: TargetRow[];
  aiMessage: string;
  totalTarget: number;
  totalAverage: number;
  totalSaved: number;
  onUpdateTarget: (category: string, value: string) => void;
  onResetRow: (category: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* AI message */}
      {aiMessage && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 text-sm text-foreground">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
            <p>{aiMessage}</p>
          </div>
        </div>
      )}

      {/* Category rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <TargetRowCard
            key={row.category}
            row={row}
            onUpdateTarget={onUpdateTarget}
            onReset={onResetRow}
          />
        ))}
      </div>

      {/* Summary footer */}
      <div className="bg-card-border/30 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted mb-1">3-Month Average</p>
            <p className="text-sm font-semibold text-foreground">{formatGBP(totalAverage)}</p>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Target Total</p>
            <p className="text-sm font-semibold text-accent">{formatGBP(totalTarget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Estimated Saving</p>
            <p
              className={`text-sm font-semibold ${
                totalSaved > 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {totalSaved > 0 ? '+' : '-'}{formatGBP(totalSaved)}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Review & Confirm
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Individual category row ─────────────────────────────────────

function TargetRowCard({
  row,
  onUpdateTarget,
  onReset,
}: {
  row: TargetRow;
  onUpdateTarget: (category: string, value: string) => void;
  onReset: (category: string) => void;
}) {
  const pctChange = row.average > 0
    ? ((row.userTarget - row.average) / row.average) * 100
    : 0;

  return (
    <div className="bg-card-border/20 border border-card-border rounded-lg p-3 md:p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-medium text-foreground">{row.category}</h4>
            <DifficultyBadge difficulty={row.difficulty} />
            {row.modified && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                Modified
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{row.rationale}</p>
        </div>

        {/* Average display */}
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted uppercase tracking-wide">Avg</p>
          <p className="text-sm text-muted font-medium">{formatGBP(row.average)}</p>
        </div>
      </div>

      {/* Target input row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
            £
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={(row.userTarget / 100).toFixed(2)}
            onChange={(e) => onUpdateTarget(row.category, e.target.value)}
            className="w-full bg-card border border-card-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Percent change indicator */}
        <span
          className={`text-xs font-medium w-14 text-right ${
            pctChange < -1
              ? 'text-success'
              : pctChange > 1
                ? 'text-danger'
                : 'text-muted'
          }`}
        >
          {pctChange > 0 ? '+' : ''}
          {pctChange.toFixed(0)}%
        </span>

        {/* Reset link */}
        {row.modified && (
          <button
            onClick={() => onReset(row.category)}
            className="p-1.5 text-muted hover:text-accent transition-colors"
            title="Reset to AI suggestion"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'moderate' | 'stretch' }) {
  const styles = {
    easy: 'bg-green-500/15 text-green-400',
    moderate: 'bg-amber-500/15 text-amber-400',
    stretch: 'bg-red-500/15 text-red-400',
  };

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${styles[difficulty]}`}>
      {difficulty}
    </span>
  );
}

// ── Step 3: Confirm ─────────────────────────────────────────────

function ConfirmStep({
  rows,
  totalTarget,
  totalSaved,
  saving,
  error,
  onBack,
  onConfirm,
}: {
  rows: TargetRow[];
  totalTarget: number;
  totalSaved: number;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-foreground mb-1">Confirm Your Targets</h3>
        <p className="text-sm text-muted">
          {rows.length} categories with a total target of{' '}
          <strong className="text-accent">{formatGBP(totalTarget)}</strong>
        </p>
      </div>

      {/* Summary table */}
      <div className="border border-card-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0 text-xs">
          {/* Header */}
          <div className="px-3 py-2 bg-card-border/30 font-medium text-muted">Category</div>
          <div className="px-3 py-2 bg-card-border/30 font-medium text-muted text-right">Target</div>
          <div className="px-3 py-2 bg-card-border/30 font-medium text-muted text-right">vs Avg</div>

          {/* Rows */}
          {rows.map((row, i) => {
            const diff = row.average > 0
              ? ((row.userTarget - row.average) / row.average) * 100
              : 0;

            return (
              <div key={row.category} className="contents">
                <div
                  className={`px-3 py-2 text-foreground flex items-center gap-2 ${
                    i < rows.length - 1 ? 'border-b border-card-border' : ''
                  }`}
                >
                  {row.category}
                  {row.modified && (
                    <span className="text-[9px] text-amber-400 font-medium">(edited)</span>
                  )}
                </div>
                <div
                  className={`px-3 py-2 text-foreground text-right font-medium ${
                    i < rows.length - 1 ? 'border-b border-card-border' : ''
                  }`}
                >
                  {formatGBP(row.userTarget)}
                </div>
                <div
                  className={`px-3 py-2 text-right font-medium ${
                    diff < -1 ? 'text-success' : diff > 1 ? 'text-danger' : 'text-muted'
                  } ${i < rows.length - 1 ? 'border-b border-card-border' : ''}`}
                >
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 text-center">
          <p className="text-xs text-muted mb-1">Total Monthly Target</p>
          <p className="text-xl font-bold text-accent">{formatGBP(totalTarget)}</p>
        </div>
        <div
          className={`${
            totalSaved > 0
              ? 'bg-success/10 border-success/20'
              : 'bg-danger/10 border-danger/20'
          } border rounded-lg p-4 text-center`}
        >
          <p className="text-xs text-muted mb-1">Estimated Saving</p>
          <p
            className={`text-xl font-bold ${
              totalSaved > 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {totalSaved > 0 ? '+' : '-'}{formatGBP(totalSaved)}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          disabled={saving}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Adjust Targets
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-success hover:bg-success/80 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
