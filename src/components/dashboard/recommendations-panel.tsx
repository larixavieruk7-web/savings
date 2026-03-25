'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Recommendation } from '@/types';
import { getDismissedRecommendations, dismissRecommendation, addEssentialMerchant } from '@/lib/storage';
import {
  X, AlertTriangle, AlertCircle, Info, PartyPopper,
  ChevronDown, ChevronUp, ChevronRight,
  Search, ShieldCheck, Target, MessageCircle, Loader2, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

const SEVERITY_CONFIG = {
  urgent: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-900/50', badge: 'bg-red-900/60 text-red-300', expandBg: 'bg-red-950/20' },
  warning: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-900/40', badge: 'bg-amber-900/50 text-amber-300', expandBg: 'bg-amber-950/15' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-950/30', border: 'border-blue-900/40', badge: 'bg-blue-900/50 text-blue-300', expandBg: 'bg-blue-950/15' },
  celebrate: { icon: PartyPopper, color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-900/40', badge: 'bg-emerald-900/50 text-emerald-300', expandBg: 'bg-emerald-950/15' },
} as const;

function severityForAction(severity: Recommendation['severity']): keyof typeof SEVERITY_CONFIG {
  return severity === 'urgent' ? 'urgent' : severity === 'warning' ? 'warning' : 'info';
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

interface ResearchResult {
  summary: string;
  alternatives: { provider: string; estimatedCost: string; saving: string }[];
  negotiationTips: string[];
  actionSteps: string[];
  researchLinks?: string[];
}

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
  onMarkEssential?: (merchant: string) => void;
}

export function RecommendationsPanel({ recommendations, onMarkEssential }: RecommendationsPanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [researchCache, setResearchCache] = useState<Record<string, ResearchResult>>({});
  const [researchLoading, setResearchLoading] = useState<string | null>(null);

  useEffect(() => {
    getDismissedRecommendations().then((ids) => setDismissed(new Set(ids)));
  }, []);

  const visible = recommendations.filter((r) => !dismissed.has(r.id));

  const handleDismiss = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await dismissRecommendation(id);
    setDismissed((prev) => new Set(prev).add(id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const handleMarkEssential = useCallback(async (rec: Recommendation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rec.merchant) return;
    await addEssentialMerchant(rec.merchant);
    onMarkEssential?.(rec.merchant);
    // Dismiss this recommendation since it's now marked essential
    await dismissRecommendation(rec.id);
    setDismissed((prev) => new Set(prev).add(rec.id));
  }, [onMarkEssential]);

  const handleResearch = useCallback(async (rec: Recommendation, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = rec.merchant || rec.id;
    if (researchCache[key]) return; // already cached

    setResearchLoading(rec.id);
    try {
      const res = await fetch('/api/advisor/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant: rec.merchant || rec.title,
          category: rec.category,
          monthlyAmount: rec.potentialSaving > 0 ? rec.potentialSaving * 5 : 0, // rough estimate
          context: rec.isEssential ? 'essential commitment' : rec.actionType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Research failed');
      setResearchCache((prev) => ({ ...prev, [key]: data }));
    } catch (err) {
      console.error('Research failed:', err);
    } finally {
      setResearchLoading(null);
    }
  }, [researchCache]);

  if (visible.length === 0) return null;

  const totalSavings = visible.reduce((s, r) => s + r.potentialSaving, 0);

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setPanelExpanded(!panelExpanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#111118] transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Advisor Recommendations</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
            {visible.length}
          </span>
          {totalSavings > 0 && (
            <span className="text-xs text-emerald-400 font-medium">
              up to {formatGBP(totalSavings)}/cycle saveable
            </span>
          )}
        </div>
        {panelExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted" />
        )}
      </button>

      {/* Recommendations list */}
      {panelExpanded && (
        <div className="border-t border-card-border divide-y divide-card-border">
          {visible.map((rec) => {
            const sev = rec.actionType === 'celebrate' ? 'celebrate' : severityForAction(rec.severity);
            const config = SEVERITY_CONFIG[sev];
            const Icon = config.icon;
            const isExpanded = expandedId === rec.id;
            const hasEvidence = rec.evidence && (
              (rec.evidence.transactions && rec.evidence.transactions.length > 0) ||
              (rec.evidence.relatedMerchants && rec.evidence.relatedMerchants.length > 0)
            );
            const researchKey = rec.merchant || rec.id;
            const research = researchCache[researchKey];

            return (
              <div key={rec.id} className="overflow-hidden">
                {/* Collapsed row — always visible */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  className={`w-full flex items-start gap-3 px-6 py-3.5 ${config.bg} hover:brightness-110 transition-all text-left`}
                >
                  <Icon className={`h-4 w-4 ${config.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground">{rec.title}</span>
                      {rec.isEssential && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-900/40 text-blue-300">
                          essential
                        </span>
                      )}
                      {rec.potentialSaving > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.badge}`}>
                          save {formatGBP(rec.potentialSaving)}/cycle
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{rec.detail}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {hasEvidence && (
                      <ChevronRight className={`h-3.5 w-3.5 text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    )}
                    <span
                      role="button"
                      onClick={(e) => handleDismiss(rec.id, e)}
                      className="text-muted hover:text-foreground transition-colors p-0.5"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>

                {/* Expanded detail view */}
                {isExpanded && (
                  <div className={`px-6 py-4 ${config.expandBg} border-t border-card-border/50 space-y-4`}>
                    {/* Transaction evidence table */}
                    {rec.evidence?.transactions && rec.evidence.transactions.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                          {rec.evidence.serviceType ? 'Services' : 'Recent Transactions'}
                        </h4>
                        <div className="bg-black/20 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted border-b border-card-border/30">
                                {!rec.evidence.serviceType && <th className="text-left px-3 py-1.5">Date</th>}
                                <th className="text-left px-3 py-1.5">Description</th>
                                <th className="text-right px-3 py-1.5">Amount</th>
                                <th className="text-left px-3 py-1.5">Account</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-card-border/20">
                              {rec.evidence.transactions.map((tx, i) => (
                                <tr key={i} className="text-foreground/80">
                                  {!rec.evidence?.serviceType && (
                                    <td className="px-3 py-1.5 text-muted">{formatDate(tx.date)}</td>
                                  )}
                                  <td className="px-3 py-1.5">{tx.description}</td>
                                  <td className="px-3 py-1.5 text-right font-mono">{formatGBP(tx.amount)}</td>
                                  <td className="px-3 py-1.5 text-muted truncate max-w-[120px]">{tx.account}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Related merchants */}
                    {rec.evidence?.relatedMerchants && rec.evidence.relatedMerchants.length > 0 && !rec.evidence.serviceType && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                          Top Merchants
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {rec.evidence.relatedMerchants.map((m, i) => (
                            <span key={i} className="text-xs px-2 py-1 rounded bg-card-border/30 text-foreground/70">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Accounts involved (for duplicates) */}
                    {rec.evidence?.accounts && rec.evidence.accounts.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                          Accounts Charged
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {rec.evidence.accounts.map((a, i) => (
                            <span key={i} className="text-xs px-2 py-1 rounded bg-card-border/30 text-foreground/70">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Research results */}
                    {research && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                          Research Results
                        </h4>
                        <p className="text-xs text-foreground/80">{research.summary}</p>

                        {research.alternatives && research.alternatives.length > 0 && (
                          <div>
                            <h5 className="text-xs font-medium text-muted mb-1">Alternatives</h5>
                            <div className="space-y-1">
                              {research.alternatives.map((alt, i) => (
                                <div key={i} className="flex items-center justify-between text-xs bg-black/20 rounded px-3 py-1.5">
                                  <span className="text-foreground/80">{alt.provider}</span>
                                  <span className="text-muted">{alt.estimatedCost}</span>
                                  <span className="text-emerald-400 font-medium">{alt.saving}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {research.actionSteps && research.actionSteps.length > 0 && (
                          <div>
                            <h5 className="text-xs font-medium text-muted mb-1">Action Steps</h5>
                            <ol className="text-xs text-foreground/70 space-y-0.5 list-decimal list-inside">
                              {research.actionSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {research.negotiationTips && research.negotiationTips.length > 0 && (
                          <div>
                            <h5 className="text-xs font-medium text-muted mb-1">Negotiation Tips</h5>
                            <ul className="text-xs text-foreground/70 space-y-0.5 list-disc list-inside">
                              {research.negotiationTips.map((tip, i) => (
                                <li key={i}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Research button — for contracts, subscriptions, overlapping services */}
                      {(rec.actionType === 'switch' || rec.actionType === 'cancel' || rec.isEssential) && rec.merchant && (
                        <button
                          onClick={(e) => handleResearch(rec, e)}
                          disabled={researchLoading === rec.id || !!research}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        >
                          {researchLoading === rec.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Search className="h-3 w-3" />
                          )}
                          {research ? 'Researched' : 'Research Savings'}
                        </button>
                      )}

                      {/* Mark as Essential — for non-essential contracts */}
                      {rec.actionType === 'switch' && !rec.isEssential && rec.merchant && (
                        <button
                          onClick={(e) => handleMarkEssential(rec, e)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 transition-colors"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Mark as Essential
                        </button>
                      )}

                      {/* Set Target — for category creep */}
                      {rec.category && rec.actionType === 'reduce' && (
                        <Link
                          href="/targets"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                        >
                          <Target className="h-3 w-3" />
                          Set Target
                        </Link>
                      )}

                      {/* Ask Advisor — always available */}
                      <Link
                        href={`/ask?context=${encodeURIComponent(rec.title + ': ' + rec.detail)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-card-border/30 text-foreground/60 hover:text-foreground hover:bg-card-border/50 transition-colors"
                      >
                        <MessageCircle className="h-3 w-3" />
                        Ask Advisor
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
