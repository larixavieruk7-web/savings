'use client';

import type { HealthScorecard } from '@/types';
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Minus } from 'lucide-react';

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  // Color based on score
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-card-border"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      {/* Score text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground tabular-nums">{score}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted">/ 100</span>
      </div>
    </div>
  );
}

function MetricBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-card-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-muted tabular-nums w-8 text-right">{score}/{max}</span>
    </div>
  );
}

export function HealthScorecardWidget({ scorecard }: { scorecard: HealthScorecard | null }) {
  if (!scorecard) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">Health Score</h3>
        <p className="text-sm text-muted">Select a salary cycle to see your financial health score.</p>
      </div>
    );
  }

  const verdictIcon = scorecard.verdict === 'Strong month'
    ? <CheckCircle2 className="h-4 w-4 text-success" />
    : scorecard.verdict === 'Watch spending'
      ? <Minus className="h-4 w-4 text-yellow-500" />
      : <AlertTriangle className="h-4 w-4 text-danger" />;

  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <div className="flex items-start gap-6">
        {/* Score ring */}
        <div className="shrink-0">
          <ScoreRing score={scorecard.overallScore} />
        </div>

        {/* Right side: verdict + metric bars */}
        <div className="flex-1 min-w-0">
          {/* Verdict */}
          <div className="flex items-center gap-2 mb-4">
            {verdictIcon}
            <span className="text-lg font-semibold text-foreground">{scorecard.verdict}</span>
          </div>

          {/* Sub-scores */}
          <div className="space-y-2.5">
            <MetricBar label="Savings" score={scorecard.metrics.savingsRateScore} max={25} />
            <MetricBar label="Essentials" score={scorecard.metrics.essentialScore} max={25} />
            <MetricBar label="Stability" score={scorecard.metrics.creepScore} max={25} />
            <MetricBar label="Clarity" score={scorecard.metrics.flowScore} max={25} />
          </div>
        </div>
      </div>

      {/* Highlights + Warnings */}
      {(scorecard.highlights.length > 0 || scorecard.warnings.length > 0) && (
        <div className="mt-5 pt-4 border-t border-card-border space-y-2">
          {scorecard.highlights.map((h, i) => (
            <div key={`h-${i}`} className="flex items-start gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
              <span className="text-xs text-muted">{h}</span>
            </div>
          ))}
          {scorecard.warnings.map((w, i) => (
            <div key={`w-${i}`} className="flex items-start gap-2">
              <TrendingDown className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
              <span className="text-xs text-muted">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
