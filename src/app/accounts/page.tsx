'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTransactionContext } from '@/context/transactions';
import {
  getAccountNicknames,
  saveAccountNickname,
  getDisplayName,
  setAccountType,
} from '@/lib/storage';
import { formatGBP } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import type { Transaction, AccountType, AccountConfig } from '@/types';
import {
  Wallet,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Copy,
  Landmark,
  CreditCard,
  PiggyBank,
  HelpCircle,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────

interface AccountSummary {
  rawName: string;
  displayName: string;
  transactionCount: number;
  totalIncome: number;
  totalSpending: number;
  minBalance: number;
  maxBalance: number;
  topCategories: { category: string; amount: number }[];
  recentTransactions: Transaction[];
}

interface DuplicateGroup {
  severity: 'alert' | 'warning';
  transactions: Transaction[];
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function buildAccountSummaries(transactions: Transaction[]): AccountSummary[] {
  const byAccount = new Map<string, Transaction[]>();

  for (const t of transactions) {
    const acct = t.accountName || 'Unknown Account';
    if (!byAccount.has(acct)) byAccount.set(acct, []);
    byAccount.get(acct)!.push(t);
  }

  const summaries: AccountSummary[] = [];

  for (const [rawName, txns] of byAccount) {
    const income = txns
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const spending = txns
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    const balances = txns.map((t) => t.balance).filter((b) => b !== undefined && b !== null);
    const minBalance = balances.length > 0 ? Math.min(...balances) : 0;
    const maxBalance = balances.length > 0 ? Math.max(...balances) : 0;

    // Top categories by spending
    const catMap: Record<string, number> = {};
    for (const t of txns) {
      if (t.amount < 0) {
        catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount);
      }
    }
    const topCategories = Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }));

    // Recent transactions (latest 10)
    const sorted = [...txns].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    summaries.push({
      rawName,
      displayName: getDisplayName(rawName),
      transactionCount: txns.length,
      totalIncome: income,
      totalSpending: spending,
      minBalance,
      maxBalance,
      topCategories,
      recentTransactions: sorted.slice(0, 10),
    });
  }

  return summaries.sort((a, b) => b.transactionCount - a.transactionCount);
}

function findCrossAccountDuplicates(transactions: Transaction[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  // Only consider transactions with an account name
  const withAccount = transactions.filter((t) => t.accountName);

  for (let i = 0; i < withAccount.length; i++) {
    for (let j = i + 1; j < withAccount.length; j++) {
      const a = withAccount[i];
      const b = withAccount[j];

      // Must be different accounts
      if (a.accountName === b.accountName) continue;

      // Must be same sign (both debits or both credits)
      if ((a.amount > 0) !== (b.amount > 0)) continue;

      // Must be same amount
      if (Math.abs(a.amount) !== Math.abs(b.amount)) continue;

      // Must be within 3 days
      const dayDiff = Math.abs(differenceInDays(parseISO(a.date), parseISO(b.date)));
      if (dayDiff > 3) continue;

      // Skip very small amounts (under £1)
      if (Math.abs(a.amount) < 100) continue;

      // Skip transfers (these are expected cross-account)
      if (a.category === 'Transfers' || b.category === 'Transfers') continue;

      // Dedup by pair of IDs
      const pairKey = [a.id, b.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      // Determine severity
      const descA = a.description.toUpperCase().replace(/\s+/g, ' ').trim();
      const descB = b.description.toUpperCase().replace(/\s+/g, ' ').trim();
      const isExact = descA === descB;
      const isSimilar =
        !isExact &&
        (descA.includes(descB.slice(0, 10)) ||
          descB.includes(descA.slice(0, 10)) ||
          (a.merchantName &&
            b.merchantName &&
            a.merchantName.toUpperCase() === b.merchantName.toUpperCase()));

      if (isExact) {
        groups.push({
          severity: 'alert',
          transactions: [a, b],
          reason: 'Exact match: same amount, same description, different accounts',
        });
      } else if (isSimilar) {
        groups.push({
          severity: 'warning',
          transactions: [a, b],
          reason: 'Similar: same amount, similar description, different accounts',
        });
      }
    }
  }

  // Sort alerts first, then by amount descending
  return groups.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'alert' ? -1 : 1;
    return Math.abs(b.transactions[0].amount) - Math.abs(a.transactions[0].amount);
  });
}

// ─── Sub-components ───────────────────────────────────────────────

function CategoryBar({
  categories,
  maxAmount,
}: {
  categories: { category: string; amount: number }[];
  maxAmount: number;
}) {
  return (
    <div className="space-y-1.5">
      {categories.map(({ category, amount }) => (
        <div key={category} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-muted" title={category}>
            {category}
          </span>
          <div className="flex-1 h-2 bg-card-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max((amount / maxAmount) * 100, 2)}%`,
                backgroundColor: CATEGORY_COLORS[category] || '#a1a1aa',
              }}
            />
          </div>
          <span className="w-20 text-right text-muted">{formatGBP(amount)}</span>
        </div>
      ))}
    </div>
  );
}

function InlineNicknameEditor({
  rawName,
  initialDisplayName,
  onSave,
}: {
  rawName: string;
  initialDisplayName: string;
  onSave: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDisplayName);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== rawName) {
      saveAccountNickname(rawName, trimmed);
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setValue(initialDisplayName);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors group cursor-pointer"
        title="Click to edit nickname"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(true); }}
      >
        <span>{initialDisplayName !== rawName ? initialDisplayName : 'Add nickname'}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        autoFocus
        className="px-2 py-0.5 text-sm bg-background border border-card-border rounded focus:outline-none focus:border-accent text-foreground w-48"
      />
      <button
        onClick={handleSave}
        className="p-1 text-green-400 hover:text-green-300 transition-colors"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleCancel}
        className="p-1 text-red-400 hover:text-red-300 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Account Type Badge ──────────────────────────────────────────

const ACCOUNT_TYPE_CONFIG: Record<
  AccountType,
  { label: string; color: string; bgColor: string; borderColor: string; icon: typeof Landmark }
> = {
  hub: {
    label: 'Hub',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/15',
    borderColor: 'border-indigo-500/25',
    icon: Landmark,
  },
  'credit-card': {
    label: 'Credit Card',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/25',
    icon: CreditCard,
  },
  savings: {
    label: 'Savings',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    borderColor: 'border-emerald-500/25',
    icon: PiggyBank,
  },
  unknown: {
    label: 'Unknown',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/15',
    borderColor: 'border-zinc-500/25',
    icon: HelpCircle,
  },
};

const ACCOUNT_TYPE_OPTIONS: AccountType[] = ['hub', 'credit-card', 'savings', 'unknown'];

function AccountTypeBadge({
  rawName,
  accountTypes,
  onTypeChange,
}: {
  rawName: string;
  accountTypes: AccountConfig[];
  onTypeChange: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const config = accountTypes.find((c) => c.rawName === rawName);
  const currentType: AccountType = config?.type ?? 'unknown';
  const isAutoDetected = config?.autoDetected !== false;
  const typeConfig = ACCOUNT_TYPE_CONFIG[currentType];
  const Icon = typeConfig.icon;

  const handleChange = (newType: AccountType) => {
    setAccountType(rawName, newType);
    onTypeChange();
    setShowDropdown(false);
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors hover:brightness-125 ${typeConfig.bgColor} ${typeConfig.borderColor} ${typeConfig.color}`}
      >
        <Icon className="h-3 w-3" />
        <span>{typeConfig.label}</span>
        {isAutoDetected && (
          <span className="opacity-60 text-[10px]">(auto)</span>
        )}
        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-50 bg-[#111118] border border-card-border rounded-lg shadow-xl py-1 min-w-[160px]">
            {ACCOUNT_TYPE_OPTIONS.map((type) => {
              const opt = ACCOUNT_TYPE_CONFIG[type];
              const OptIcon = opt.icon;
              const isSelected = type === currentType;
              return (
                <button
                  key={type}
                  onClick={() => handleChange(type)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                    isSelected
                      ? `${opt.bgColor} ${opt.color} font-medium`
                      : 'text-muted hover:text-foreground hover:bg-card-border/30'
                  }`}
                >
                  <OptIcon className={`h-3.5 w-3.5 ${isSelected ? opt.color : ''}`} />
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-3 w-3 ml-auto" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function AccountsPage() {
  const { transactions, loaded, accountTypes, reload } = useTransactionContext();
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [, setNicknameVersion] = useState(0); // force re-render on nickname change
  const [, setTypeVersion] = useState(0); // force re-render on type change

  const summaries = useMemo(
    () => buildAccountSummaries(transactions),
    [transactions]
  );

  const duplicates = useMemo(
    () => findCrossAccountDuplicates(transactions),
    [transactions]
  );

  const handleNicknameSave = useCallback(() => {
    setNicknameVersion((v) => v + 1);
  }, []);

  const handleTypeChange = useCallback(() => {
    setTypeVersion((v) => v + 1);
    reload(); // reload transactions to re-run transfer reclassification
  }, [reload]);

  const toggleExpand = (rawName: string) => {
    setExpandedAccount((prev) => (prev === rawName ? null : rawName));
  };

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-muted">Loading accounts...</div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Wallet className="h-12 w-12 text-muted mx-auto" />
          <p className="text-muted">No transactions yet. Upload a CSV to get started.</p>
        </div>
      </div>
    );
  }

  const maxCategoryAmount = Math.max(
    ...summaries.flatMap((s) => s.topCategories.map((c) => c.amount)),
    1
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-sm text-muted">
            {summaries.length} account{summaries.length !== 1 ? 's' : ''} found across{' '}
            {transactions.length.toLocaleString()} transactions
          </p>
        </div>
      </div>

      {/* Account Cards */}
      <div className="space-y-3">
        {summaries.map((account) => {
          const isExpanded = expandedAccount === account.rawName;
          const currentDisplayName = getDisplayName(account.rawName);

          return (
            <div
              key={account.rawName}
              className="bg-card border border-card-border rounded-xl overflow-hidden"
            >
              {/* Account Header */}
              <button
                onClick={() => toggleExpand(account.rawName)}
                className="w-full px-5 py-4 flex items-start justify-between hover:bg-card-border/20 transition-colors text-left"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="mt-0.5">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground truncate">
                      {currentDisplayName !== account.rawName
                        ? currentDisplayName
                        : account.rawName}
                    </h3>
                    {currentDisplayName !== account.rawName && (
                      <p className="text-xs text-muted truncate">{account.rawName}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <AccountTypeBadge
                        rawName={account.rawName}
                        accountTypes={accountTypes}
                        onTypeChange={handleTypeChange}
                      />
                      <InlineNicknameEditor
                        rawName={account.rawName}
                        initialDisplayName={currentDisplayName}
                        onSave={handleNicknameSave}
                      />
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-6 text-right shrink-0">
                  <div>
                    <p className="text-xs text-muted">Transactions</p>
                    <p className="text-sm font-medium text-foreground">
                      {account.transactionCount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Income</p>
                    <p className="text-sm font-medium text-green-400">
                      {formatGBP(account.totalIncome)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Spending</p>
                    <p className="text-sm font-medium text-red-400">
                      {formatGBP(account.totalSpending)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Balance Range</p>
                    <p className="text-sm font-medium text-foreground">
                      {formatGBP(account.minBalance)} &ndash; {formatGBP(account.maxBalance)}
                    </p>
                  </div>
                </div>
              </button>

              {/* Expanded Section */}
              {isExpanded && (
                <div className="border-t border-card-border px-5 py-4 space-y-4">
                  {/* Category Breakdown */}
                  {account.topCategories.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">
                        Top Spending Categories
                      </h4>
                      <CategoryBar
                        categories={account.topCategories}
                        maxAmount={maxCategoryAmount}
                      />
                    </div>
                  )}

                  {/* Recent Transactions */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      Recent Transactions
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted border-b border-card-border">
                            <th className="pb-2 pr-4">Date</th>
                            <th className="pb-2 pr-4">Description</th>
                            <th className="pb-2 pr-4">Category</th>
                            <th className="pb-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {account.recentTransactions.map((t) => (
                            <tr
                              key={t.id}
                              className="border-b border-card-border/50 last:border-0"
                            >
                              <td className="py-2 pr-4 text-muted whitespace-nowrap">
                                {format(parseISO(t.date), 'dd MMM yyyy')}
                              </td>
                              <td className="py-2 pr-4 text-foreground truncate max-w-xs">
                                {t.merchantName || t.description}
                              </td>
                              <td className="py-2 pr-4">
                                <span
                                  className="inline-block px-2 py-0.5 rounded-full text-xs"
                                  style={{
                                    backgroundColor:
                                      (CATEGORY_COLORS[t.category] || '#a1a1aa') + '20',
                                    color: CATEGORY_COLORS[t.category] || '#a1a1aa',
                                  }}
                                >
                                  {t.category}
                                </span>
                              </td>
                              <td
                                className={`py-2 text-right whitespace-nowrap font-medium ${
                                  t.amount >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                {t.amount >= 0 ? '+' : ''}
                                {formatGBP(t.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cross-Account Duplicate Detection */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-card-border flex items-center gap-3">
          <Copy className="h-5 w-5 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Cross-Account Duplicate Detection
            </h2>
            <p className="text-xs text-muted">
              Transactions with the same amount across different accounts within 3 days
            </p>
          </div>
          {duplicates.length > 0 && (
            <span className="ml-auto bg-red-500/20 text-red-400 text-xs font-medium px-2.5 py-1 rounded-full">
              {duplicates.length} potential duplicate{duplicates.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          {duplicates.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <Check className="h-8 w-8 mx-auto mb-2 text-green-400" />
              <p>No cross-account duplicates detected.</p>
              <p className="text-xs mt-1">
                All clear — no suspicious matching transactions found across accounts.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {duplicates.map((dup, idx) => {
                const [a, b] = dup.transactions;
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-4 ${
                      dup.severity === 'alert'
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-yellow-500/30 bg-yellow-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {dup.severity === 'alert' ? (
                        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-medium uppercase ${
                              dup.severity === 'alert' ? 'text-red-400' : 'text-yellow-400'
                            }`}
                          >
                            {dup.severity}
                          </span>
                          <span className="text-xs text-muted">{dup.reason}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                          {[a, b].map((t) => (
                            <div
                              key={t.id}
                              className="bg-background/50 rounded-md px-3 py-2 text-sm"
                            >
                              <p className="text-xs text-accent font-medium mb-1">
                                {getDisplayName(t.accountName || 'Unknown')}
                              </p>
                              <p className="text-foreground truncate">
                                {t.merchantName || t.description}
                              </p>
                              <div className="flex justify-between mt-1 text-xs text-muted">
                                <span>{format(parseISO(t.date), 'dd MMM yyyy')}</span>
                                <span
                                  className={`font-medium ${
                                    t.amount >= 0 ? 'text-green-400' : 'text-red-400'
                                  }`}
                                >
                                  {formatGBP(Math.abs(t.amount))}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
