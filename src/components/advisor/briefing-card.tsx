'use client';

import { useState } from 'react';
import {
  Upload,
  Calendar,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  X,
  MessageCircle,
  Award,
  Eye,
  Lightbulb,
  ShieldAlert,
  Target,
  Repeat,
} from 'lucide-react';
import type { AdvisorBriefing } from '@/types';
import { formatGBP } from '@/lib/utils';

// ─── Typed briefing shapes ──────────────────────────────────────

interface TargetAlert {
  category: string;
  spent: number;
  target: number;
  status: 'on_track' | 'approaching' | 'exceeded';
  message: string;
}

interface SuspiciousItem {
  description: string;
  amount: number;
  reason: string;
}

interface UploadBriefingData {
  headline: string;
  newSpendTotal: number;
  targetAlerts: TargetAlert[];
  suspiciousItems: SuspiciousItem[];
  quickWins: string[];
  moodEmoji: string;
}

interface PaceStatus {
  category: string;
  spent: number;
  target: number;
  projection: number;
  status: 'on_track' | 'approaching' | 'exceeded';
}

interface WeeklyBriefingData {
  headline: string;
  weekSpend: number;
  paceStatus: PaceStatus[];
  notable: string[];
  encouragement: string;
  watchItem: string;
}

interface TargetReportRow {
  category: string;
  target: number;
  actual: number;
  variance: number;
  verdict: string;
  trend: string;
}

interface CommitmentReview {
  commitment: string;
  status: 'completed' | 'missed' | 'active' | 'deferred';
  followUp: string;
}

interface SavingsTrajectory {
  savedThisCycle: number;
  savedYTD: number;
  projectedAnnual: number;
  targetAnnual: number;
  message: string;
}

interface ContractAlert {
  merchant: string;
  monthlyAmount: number;
  months: number;
  suggestion: string;
  estimatedSaving: number;
}

interface SuggestedTarget {
  category: string;
  suggestedAmount: number;
  rationale: string;
}

interface MonthlyBriefingData {
  headline: string;
  monthGrade: string;
  targetReport: TargetReportRow[];
  commitmentReview: CommitmentReview[];
  savingsTrajectory: SavingsTrajectory;
  contractAlerts: ContractAlert[];
  suggestedTargets: SuggestedTarget[];
  quickWins: string[];
  warnings: string[];
}

// ─── Props ──────────────────────────────────────────────────────

interface AdvisorBriefingCardProps {
  briefing: AdvisorBriefing;
  onDismiss?: (id: string) => void;
  onAskAbout?: (briefingContext: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  on_track:    { text: 'text-success',  bg: 'bg-success/15', border: 'border-success/30' },
  approaching: { text: 'text-warning',  bg: 'bg-warning/15', border: 'border-warning/30' },
  exceeded:    { text: 'text-danger',   bg: 'bg-danger/15',  border: 'border-danger/30' },
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-success bg-success/15 border-success/30',
  'A':  'text-success bg-success/15 border-success/30',
  'B+': 'text-emerald-400 bg-emerald-400/15 border-emerald-400/30',
  'B':  'text-emerald-400 bg-emerald-400/15 border-emerald-400/30',
  'C+': 'text-warning bg-warning/15 border-warning/30',
  'C':  'text-warning bg-warning/15 border-warning/30',
  'D':  'text-orange-400 bg-orange-400/15 border-orange-400/30',
  'F':  'text-danger bg-danger/15 border-danger/30',
};

function statusLabel(status: string): string {
  switch (status) {
    case 'on_track':    return 'On Track';
    case 'approaching': return 'Approaching';
    case 'exceeded':    return 'Exceeded';
    default:            return status;
  }
}

function commitmentStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle className="h-4 w-4 text-success" />;
    case 'missed':    return <X className="h-4 w-4 text-danger" />;
    case 'active':    return <Target className="h-4 w-4 text-accent" />;
    case 'deferred':  return <Repeat className="h-4 w-4 text-warning" />;
    default:          return <Target className="h-4 w-4 text-muted" />;
  }
}

// ─── Collapsible section ────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  count,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-card-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-card-border/30 transition-colors"
      >
        {icon}
        <span className="text-sm font-medium text-foreground flex-1">{title}</span>
        {count != null && count > 0 && (
          <span className="text-xs text-muted bg-card-border/50 rounded-full px-2 py-0.5">
            {count}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted" />
        )}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ─── Type headers ───────────────────────────────────────────────

const TYPE_CONFIG = {
  upload: {
    icon: Upload,
    label: 'Upload Briefing',
    headerBg: 'bg-blue-500/10',
    headerBorder: 'border-blue-500/30',
    iconColor: 'text-blue-400',
    accentColor: 'text-blue-400',
  },
  weekly: {
    icon: Calendar,
    label: 'Weekly Check-in',
    headerBg: 'bg-slate-500/10',
    headerBorder: 'border-slate-500/30',
    iconColor: 'text-slate-400',
    accentColor: 'text-slate-400',
  },
  monthly: {
    icon: BarChart3,
    label: 'Monthly Review',
    headerBg: 'bg-accent/10',
    headerBorder: 'border-accent/30',
    iconColor: 'text-accent',
    accentColor: 'text-accent',
  },
};

// ─── Main Component ─────────────────────────────────────────────

export function AdvisorBriefingCard({
  briefing,
  onDismiss,
  onAskAbout,
}: AdvisorBriefingCardProps) {
  const config = TYPE_CONFIG[briefing.type];
  const Icon = config.icon;

  const handleAskAbout = () => {
    if (!onAskAbout) return;

    const data = briefing.briefing as Record<string, unknown>;
    const headline = (data.headline as string) || '';
    const summary = `${config.label}: ${headline}`;
    onAskAbout(summary);
  };

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className={`${config.headerBg} border-b ${config.headerBorder} px-4 py-3 flex items-center gap-3`}>
        <Icon className={`h-5 w-5 ${config.iconColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${config.accentColor} uppercase tracking-wide`}>
            {config.label}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {new Date(briefing.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onAskAbout && (
            <button
              onClick={handleAskAbout}
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors bg-card-border/50 hover:bg-card-border rounded-lg px-2.5 py-1.5"
              title="Ask about this briefing"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ask me about this</span>
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(briefing.id)}
              className="text-muted hover:text-foreground transition-colors p-1 rounded-lg hover:bg-card-border/50"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 md:p-6">
        {briefing.type === 'upload' && (
          <UploadBriefingBody data={briefing.briefing as unknown as UploadBriefingData} />
        )}
        {briefing.type === 'weekly' && (
          <WeeklyBriefingBody data={briefing.briefing as unknown as WeeklyBriefingData} />
        )}
        {briefing.type === 'monthly' && (
          <MonthlyBriefingBody data={briefing.briefing as unknown as MonthlyBriefingData} />
        )}
      </div>
    </div>
  );
}

// ─── Upload Briefing Body ───────────────────────────────────────

function UploadBriefingBody({ data }: { data: UploadBriefingData }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="flex items-start gap-3">
        {data.moodEmoji && (
          <span className="text-2xl shrink-0" role="img" aria-label="mood">
            {data.moodEmoji}
          </span>
        )}
        <div>
          <p className="text-base md:text-lg font-semibold text-foreground">
            {data.headline}
          </p>
          {data.newSpendTotal != null && (
            <p className="text-sm text-muted mt-1">
              New spend uploaded: {formatGBP(Math.abs(data.newSpendTotal))}
            </p>
          )}
        </div>
      </div>

      {/* Target Alerts */}
      {data.targetAlerts && data.targetAlerts.length > 0 && (
        <CollapsibleSection
          title="Target Alerts"
          icon={<Target className="h-4 w-4 text-warning" />}
          defaultOpen={true}
          count={data.targetAlerts.length}
        >
          <div className="space-y-2">
            {data.targetAlerts.map((alert, i) => {
              const colors = STATUS_COLORS[alert.status] || STATUS_COLORS.on_track;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 ${colors.bg} border ${colors.border} rounded-lg px-3 py-2`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{alert.category}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                        {statusLabel(alert.status)}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">{alert.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-medium ${colors.text}`}>
                      {formatGBP(Math.abs(alert.spent))}
                    </p>
                    <p className="text-xs text-muted">
                      of {formatGBP(Math.abs(alert.target))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Suspicious Items */}
      {data.suspiciousItems && data.suspiciousItems.length > 0 && (
        <CollapsibleSection
          title="Suspicious Items"
          icon={<ShieldAlert className="h-4 w-4 text-danger" />}
          defaultOpen={true}
          count={data.suspiciousItems.length}
        >
          <div className="space-y-2">
            {data.suspiciousItems.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
              >
                <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {item.description}
                    </span>
                    <span className="text-sm font-medium text-danger shrink-0">
                      {formatGBP(Math.abs(item.amount))}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Quick Wins */}
      {data.quickWins && data.quickWins.length > 0 && (
        <CollapsibleSection
          title="Quick Wins"
          icon={<Lightbulb className="h-4 w-4 text-success" />}
          defaultOpen={false}
          count={data.quickWins.length}
        >
          <ul className="space-y-1.5">
            {data.quickWins.map((win, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>{win}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ─── Weekly Briefing Body ───────────────────────────────────────

function WeeklyBriefingBody({ data }: { data: WeeklyBriefingData }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Headline + Week Spend */}
      <div>
        <p className="text-base md:text-lg font-semibold text-foreground">
          {data.headline}
        </p>
        {data.weekSpend != null && (
          <p className="text-sm text-muted mt-1">
            This week: {formatGBP(Math.abs(data.weekSpend))}
          </p>
        )}
      </div>

      {/* Pace Status — mini progress bars */}
      {data.paceStatus && data.paceStatus.length > 0 && (
        <div className="space-y-2">
          {data.paceStatus.map((item, i) => {
            const pct = item.target > 0 ? Math.min((Math.abs(item.spent) / item.target) * 100, 100) : 0;
            const colors = STATUS_COLORS[item.status] || STATUS_COLORS.on_track;
            const barColor = item.status === 'exceeded'
              ? 'bg-danger'
              : item.status === 'approaching'
              ? 'bg-warning'
              : 'bg-success';

            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{item.category}</span>
                  <span className={`text-xs ${colors.text}`}>
                    {formatGBP(Math.abs(item.spent))} / {formatGBP(item.target)}
                  </span>
                </div>
                <div className="h-1.5 bg-card-border rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {item.projection > 0 && (
                  <p className="text-xs text-muted mt-0.5">
                    Projected: {formatGBP(Math.abs(item.projection))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notable items */}
      {data.notable && data.notable.length > 0 && (
        <div className="bg-card-border/30 rounded-lg px-3 py-2.5">
          <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Notable</p>
          <ul className="space-y-1">
            {data.notable.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Eye className="h-3.5 w-3.5 text-muted shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Watch Item */}
      {data.watchItem && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-warning uppercase tracking-wide">Watch</p>
            <p className="text-sm text-foreground mt-0.5">{data.watchItem}</p>
          </div>
        </div>
      )}

      {/* Encouragement */}
      {data.encouragement && (
        <div className="flex items-start gap-2 bg-success/10 border border-success/20 rounded-lg px-3 py-2">
          <TrendingUp className="h-4 w-4 text-success shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{data.encouragement}</p>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Briefing Body ──────────────────────────────────────

function MonthlyBriefingBody({ data }: { data: MonthlyBriefingData }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Headline + Grade */}
      <div className="flex items-start gap-4">
        {data.monthGrade && (
          <div
            className={`flex items-center justify-center w-14 h-14 rounded-xl border-2 text-2xl font-bold shrink-0 ${
              GRADE_COLORS[data.monthGrade] || 'text-muted bg-card-border/30 border-card-border'
            }`}
          >
            {data.monthGrade}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-base md:text-lg font-semibold text-foreground">
            {data.headline}
          </p>
        </div>
      </div>

      {/* Savings Trajectory */}
      {data.savingsTrajectory && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <p className="text-xs font-medium text-accent uppercase tracking-wide">
              Savings Trajectory
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TrajectoryMetric
              label="This Cycle"
              value={formatGBP(Math.abs(data.savingsTrajectory.savedThisCycle))}
              positive={data.savingsTrajectory.savedThisCycle > 0}
            />
            <TrajectoryMetric
              label="Year to Date"
              value={formatGBP(Math.abs(data.savingsTrajectory.savedYTD))}
              positive={data.savingsTrajectory.savedYTD > 0}
            />
            <TrajectoryMetric
              label="Projected Annual"
              value={formatGBP(Math.abs(data.savingsTrajectory.projectedAnnual))}
              positive={data.savingsTrajectory.projectedAnnual >= data.savingsTrajectory.targetAnnual}
            />
            <TrajectoryMetric
              label="Target Annual"
              value={formatGBP(Math.abs(data.savingsTrajectory.targetAnnual))}
            />
          </div>
          {data.savingsTrajectory.message && (
            <p className="text-sm text-foreground mt-2">{data.savingsTrajectory.message}</p>
          )}
        </div>
      )}

      {/* Target Report Table */}
      {data.targetReport && data.targetReport.length > 0 && (
        <CollapsibleSection
          title="Category Targets"
          icon={<Target className="h-4 w-4 text-accent" />}
          defaultOpen={true}
          count={data.targetReport.length}
        >
          <div className="overflow-x-auto -mx-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-card-border">
                  <th className="text-left py-1.5 px-3 font-medium">Category</th>
                  <th className="text-right py-1.5 px-2 font-medium">Target</th>
                  <th className="text-right py-1.5 px-2 font-medium">Actual</th>
                  <th className="text-right py-1.5 px-2 font-medium">Var</th>
                  <th className="text-left py-1.5 px-2 font-medium hidden sm:table-cell">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data.targetReport.map((row, i) => {
                  const variancePositive = row.variance <= 0; // under target = good
                  return (
                    <tr key={i} className="border-b border-card-border/50 last:border-0">
                      <td className="py-1.5 px-3 text-foreground font-medium">
                        <div className="flex items-center gap-1.5">
                          {row.category}
                          {row.trend === 'rising' && <TrendingUp className="h-3 w-3 text-danger" />}
                          {row.trend === 'falling' && <TrendingDown className="h-3 w-3 text-success" />}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right text-muted">
                        {formatGBP(Math.abs(row.target))}
                      </td>
                      <td className="py-1.5 px-2 text-right text-foreground">
                        {formatGBP(Math.abs(row.actual))}
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right font-medium ${
                          variancePositive ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {row.variance > 0 ? '+' : ''}
                        {formatGBP(row.variance)}
                      </td>
                      <td className="py-1.5 px-2 text-muted hidden sm:table-cell">
                        {row.verdict}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* Commitment Review */}
      {data.commitmentReview && data.commitmentReview.length > 0 && (
        <CollapsibleSection
          title="Commitment Review"
          icon={<Award className="h-4 w-4 text-accent" />}
          defaultOpen={false}
          count={data.commitmentReview.length}
        >
          <div className="space-y-2">
            {data.commitmentReview.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {commitmentStatusIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{item.commitment}</p>
                  {item.followUp && (
                    <p className="text-xs text-muted mt-0.5">{item.followUp}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Contract Alerts */}
      {data.contractAlerts && data.contractAlerts.length > 0 && (
        <CollapsibleSection
          title="Contract Alerts"
          icon={<ShieldAlert className="h-4 w-4 text-warning" />}
          defaultOpen={false}
          count={data.contractAlerts.length}
        >
          <div className="space-y-2">
            {data.contractAlerts.map((alert, i) => (
              <div
                key={i}
                className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{alert.merchant}</span>
                  <span className="text-sm font-medium text-warning shrink-0">
                    {formatGBP(Math.abs(alert.monthlyAmount))}/mo
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  Paid for {alert.months} months. {alert.suggestion}
                </p>
                {alert.estimatedSaving > 0 && (
                  <p className="text-xs text-success mt-0.5">
                    Potential saving: {formatGBP(Math.abs(alert.estimatedSaving))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Suggested Targets */}
      {data.suggestedTargets && data.suggestedTargets.length > 0 && (
        <CollapsibleSection
          title="Suggested Targets"
          icon={<Target className="h-4 w-4 text-accent" />}
          defaultOpen={false}
          count={data.suggestedTargets.length}
        >
          <div className="space-y-2">
            {data.suggestedTargets.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Target className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{t.category}</span>
                    <span className="text-sm font-medium text-accent shrink-0">
                      {formatGBP(Math.abs(t.suggestedAmount))}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">{t.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Quick Wins */}
      {data.quickWins && data.quickWins.length > 0 && (
        <CollapsibleSection
          title="Quick Wins"
          icon={<Lightbulb className="h-4 w-4 text-success" />}
          defaultOpen={false}
          count={data.quickWins.length}
        >
          <ul className="space-y-1.5">
            {data.quickWins.map((win, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>{win}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <CollapsibleSection
          title="Warnings"
          icon={<AlertTriangle className="h-4 w-4 text-danger" />}
          defaultOpen={true}
          count={data.warnings.length}
        >
          <ul className="space-y-1.5">
            {data.warnings.map((warn, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                <span>{warn}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────

function TrajectoryMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`text-sm font-semibold ${
          positive == null ? 'text-foreground' : positive ? 'text-success' : 'text-danger'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
