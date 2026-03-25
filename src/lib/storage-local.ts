// Pure localStorage cache layer — no Supabase imports.
// This file is ONLY imported by storage.ts (and migration scripts).
// Never import this directly from hooks or pages.

import type { Transaction, CategoryRule, SavingsTarget, KnowledgeEntry, AccountConfig, AdvisorBriefing, SpendingTarget, AdvisorCommitment } from '@/types';

// ─── Key Registry ────────────────────────────────────────────────

export const KEYS = {
  transactions: 'savings_transactions',
  customRules: 'savings_custom_rules',
  savingsTargets: 'savings_targets',
  insightsCache: 'savings_insights_cache',
  customCategories: 'savings_custom_colors',
  accountNicknames: 'savings_account_nicknames',
  knowledgeBank: 'savings_knowledge_bank',
  accountTypes: 'savings_account_types',
  dismissedRecommendations: 'savings_dismissed_recommendations',
  monthlyAnalyses: 'savings_monthly_analyses',
  advisorBriefings: 'savings_advisor_briefings',
  spendingTargets: 'savings_spending_targets',
  advisorCommitments: 'savings_advisor_commitments',
  lastWeeklyCheckin: 'savings_last_weekly_checkin',
  categorisationState: 'savings_categorisation_state',
} as const;

const MIGRATION_KEY = 'savings_migration_progress';

// ─── Exported Interfaces ─────────────────────────────────────────

export interface StoredAnalysis {
  cycleId: string;
  analysedAt: string; // ISO date
  analysis: Record<string, unknown>;
}

// ─── Generic Helpers ─────────────────────────────────────────────

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Transactions ─────────────────────────────────────────────────

export function getLocalTransactions(): Transaction[] {
  return readJson<Transaction[]>(KEYS.transactions, []);
}

export function setLocalTransactions(transactions: Transaction[]): void {
  writeJson(KEYS.transactions, transactions);
}

export function clearLocalTransactions(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEYS.transactions);
}

// ─── Custom Rules ─────────────────────────────────────────────────

export function getLocalCustomRules(): CategoryRule[] {
  return readJson<CategoryRule[]>(KEYS.customRules, []);
}

export function setLocalCustomRules(rules: CategoryRule[]): void {
  writeJson(KEYS.customRules, rules);
}

// ─── Savings Targets ──────────────────────────────────────────────

export function getLocalSavingsTargets(): SavingsTarget[] {
  return readJson<SavingsTarget[]>(KEYS.savingsTargets, []);
}

export function setLocalSavingsTargets(targets: SavingsTarget[]): void {
  writeJson(KEYS.savingsTargets, targets);
}

// ─── Knowledge Entries ────────────────────────────────────────────

export function getLocalKnowledgeEntries(): KnowledgeEntry[] {
  return readJson<KnowledgeEntry[]>(KEYS.knowledgeBank, []);
}

export function setLocalKnowledgeEntries(entries: KnowledgeEntry[]): void {
  writeJson(KEYS.knowledgeBank, entries);
}

// ─── Monthly Analyses ─────────────────────────────────────────────

export function getLocalMonthlyAnalyses(): StoredAnalysis[] {
  return readJson<StoredAnalysis[]>(KEYS.monthlyAnalyses, []);
}

export function setLocalMonthlyAnalyses(analyses: StoredAnalysis[]): void {
  writeJson(KEYS.monthlyAnalyses, analyses);
}

// ─── Custom Colors (category colours) ────────────────────────────

export function getLocalCustomColors(): Record<string, string> {
  return readJson<Record<string, string>>(KEYS.customCategories, {});
}

export function setLocalCustomColors(colors: Record<string, string>): void {
  writeJson(KEYS.customCategories, colors);
}

// ─── Account Nicknames ────────────────────────────────────────────

export function getLocalAccountNicknames(): Record<string, string> {
  return readJson<Record<string, string>>(KEYS.accountNicknames, {});
}

export function setLocalAccountNicknames(nicknames: Record<string, string>): void {
  writeJson(KEYS.accountNicknames, nicknames);
}

// ─── Account Types ────────────────────────────────────────────────

export function getLocalAccountTypes(): AccountConfig[] {
  return readJson<AccountConfig[]>(KEYS.accountTypes, []);
}

export function setLocalAccountTypes(configs: AccountConfig[]): void {
  writeJson(KEYS.accountTypes, configs);
}

// ─── Dismissed Recommendations ────────────────────────────────────

export function getLocalDismissedRecommendations(): string[] {
  return readJson<string[]>(KEYS.dismissedRecommendations, []);
}

export function setLocalDismissedRecommendations(ids: string[]): void {
  writeJson(KEYS.dismissedRecommendations, ids);
}

// ─── Insights Cache ───────────────────────────────────────────────

export function getLocalInsightsCache(): Record<string, unknown> | null {
  return readJson<Record<string, unknown> | null>(KEYS.insightsCache, null);
}

export function setLocalInsightsCache(data: Record<string, unknown>): void {
  writeJson(KEYS.insightsCache, {
    ...data,
    cachedAt: Date.now(),
  });
}

// ─── Advisor Briefings ───────────────────────────────────────────

export function getLocalAdvisorBriefings(): AdvisorBriefing[] {
  return readJson<AdvisorBriefing[]>(KEYS.advisorBriefings, []);
}

export function setLocalAdvisorBriefings(briefings: AdvisorBriefing[]): void {
  writeJson(KEYS.advisorBriefings, briefings);
}

// ─── Spending Targets (per-category) ─────────────────────────────

export function getLocalSpendingTargets(): SpendingTarget[] {
  return readJson<SpendingTarget[]>(KEYS.spendingTargets, []);
}

export function setLocalSpendingTargets(targets: SpendingTarget[]): void {
  writeJson(KEYS.spendingTargets, targets);
}

// ─── Advisor Commitments ─────────────────────────────────────────

export function getLocalAdvisorCommitments(): AdvisorCommitment[] {
  return readJson<AdvisorCommitment[]>(KEYS.advisorCommitments, []);
}

export function setLocalAdvisorCommitments(commitments: AdvisorCommitment[]): void {
  writeJson(KEYS.advisorCommitments, commitments);
}

// ─── Last Weekly Check-in ────────────────────────────────────────

export function getLocalLastWeeklyCheckin(): string | null {
  return readJson<string | null>(KEYS.lastWeeklyCheckin, null);
}

export function setLocalLastWeeklyCheckin(date: string | null): void {
  writeJson(KEYS.lastWeeklyCheckin, date);
}

// ─── Categorisation State ────────────────────────────────────────

export interface CategorisationState {
  total: number;
  categorized: number;
  uncategorized: number;
}

export function getLocalCategorisationState(): CategorisationState | null {
  return readJson<CategorisationState | null>(KEYS.categorisationState, null);
}

export function setLocalCategorisationState(state: CategorisationState): void {
  writeJson(KEYS.categorisationState, state);
}

// ─── Backup Helpers ───────────────────────────────────────────────

const BACKUP_META_KEY = 'savings_backup_index';

interface BackupMeta {
  suffix: string;
  createdAt: number; // epoch ms
}

export function backupLocalStorage(): string {
  // No-op: localStorage data is never deleted during migration, so a backup
  // is unnecessary and can exceed the ~5 MB localStorage quota.
  return '';
}

export function cleanupBackups(maxAgeDays = 30): void {
  if (typeof window === 'undefined') return;

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const meta = readJson<BackupMeta[]>(BACKUP_META_KEY, []);
  const allKeys = Object.values(KEYS) as string[];

  const remaining: BackupMeta[] = [];

  for (const entry of meta) {
    if (entry.createdAt < cutoff) {
      // Remove all keys for this backup
      for (const key of allKeys) {
        localStorage.removeItem(`${key}${entry.suffix}`);
      }
    } else {
      remaining.push(entry);
    }
  }

  writeJson(BACKUP_META_KEY, remaining);
}

// ─── Migration Progress ───────────────────────────────────────────

interface MigrationProgress {
  batchIndex: number;
  startedAt: string; // ISO date
  updatedAt: string; // ISO date
}

export function getMigrationProgress(): MigrationProgress | null {
  return readJson<MigrationProgress | null>(MIGRATION_KEY, null);
}

export function setMigrationProgress(batchIndex: number): void {
  const existing = getMigrationProgress();
  writeJson<MigrationProgress>(MIGRATION_KEY, {
    batchIndex,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function clearMigrationProgress(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(MIGRATION_KEY);
}
