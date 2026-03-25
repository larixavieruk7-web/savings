'use client';

import { useState, useEffect } from 'react';
import type { Recommendation } from '@/types';
import { getDismissedRecommendations, dismissRecommendation } from '@/lib/storage';
import { X, AlertTriangle, AlertCircle, Info, PartyPopper, ChevronDown, ChevronUp } from 'lucide-react';

const SEVERITY_CONFIG = {
  urgent: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-900/50', badge: 'bg-red-900/60 text-red-300' },
  warning: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-900/40', badge: 'bg-amber-900/50 text-amber-300' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-950/30', border: 'border-blue-900/40', badge: 'bg-blue-900/50 text-blue-300' },
  celebrate: { icon: PartyPopper, color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-900/40', badge: 'bg-emerald-900/50 text-emerald-300' },
} as const;

function severityForAction(severity: Recommendation['severity']): keyof typeof SEVERITY_CONFIG {
  return severity === 'urgent' ? 'urgent' : severity === 'warning' ? 'warning' : 'info';
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    getDismissedRecommendations().then((ids) => setDismissed(new Set(ids)));
  }, []);

  const visible = recommendations.filter((r) => !dismissed.has(r.id));

  if (visible.length === 0) return null;

  async function handleDismiss(id: string) {
    await dismissRecommendation(id);
    setDismissed((prev) => new Set(prev).add(id));
  }

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#111118] transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Advisor Recommendations</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
            {visible.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted" />
        )}
      </button>

      {/* Recommendations list */}
      {expanded && (
        <div className="border-t border-card-border divide-y divide-card-border">
          {visible.map((rec) => {
            const sev = rec.actionType === 'celebrate' ? 'celebrate' : severityForAction(rec.severity);
            const config = SEVERITY_CONFIG[sev];
            const Icon = config.icon;

            return (
              <div key={rec.id} className={`flex items-start gap-3 px-6 py-3.5 ${config.bg}`}>
                <Icon className={`h-4 w-4 ${config.color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground">{rec.title}</span>
                    {rec.potentialSaving > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.badge}`}>
                        save {formatGBP(rec.potentialSaving)}/cycle
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{rec.detail}</p>
                </div>
                <button
                  onClick={() => handleDismiss(rec.id)}
                  className="text-muted hover:text-foreground transition-colors shrink-0 mt-0.5"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
