'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { Landmark, CreditCard, PiggyBank, Wallet } from 'lucide-react';
import type { Transaction } from '@/types';

// ─── Fixed account slots ────────────────────────────────────────

type SlotType = 'hub' | 'savings' | 'credit-card' | 'loan';

interface AccountSlot {
  key: string;
  label: string;
  type: SlotType;
}

const ACCOUNTS: AccountSlot[] = [
  { key: 'natwest-current',  label: 'NatWest Current',          type: 'hub'         },
  { key: 'natwest-savings',  label: 'NatWest Savings',          type: 'savings'     },
  { key: 'natwest-food-cc',  label: 'NatWest Food Shopping CC', type: 'credit-card' },
  { key: 'natwest-mc',       label: 'NatWest Mastercard',       type: 'credit-card' },
  { key: 'natwest-loan',     label: 'NatWest Personal Loan',    type: 'loan'        },
  { key: 'amex-larissa',     label: 'Amex (Larissa)',           type: 'credit-card' },
  { key: 'amex-gus',         label: 'Amex (Gus)',               type: 'credit-card' },
];

// ─── Style config ───────────────────────────────────────────────

const STYLE: Record<SlotType, { accent: string; balanceColor: string; badge: string; balanceLabel: string }> = {
  hub:          { accent: '#3b82f6', balanceColor: '#ffffff', badge: 'CURRENT',  balanceLabel: 'BALANCE' },
  savings:      { accent: '#22c55e', balanceColor: '#22c55e', badge: 'SAVINGS',  balanceLabel: 'BALANCE' },
  'credit-card': { accent: '#f59e0b', balanceColor: '#f59e0b', badge: 'CREDIT',   balanceLabel: 'OUTSTANDING' },
  loan:         { accent: '#ef4444', balanceColor: '#ef4444', badge: 'LOAN',     balanceLabel: 'REMAINING' },
};

const ICON_MAP: Record<SlotType, typeof Landmark> = {
  hub: Landmark,
  savings: PiggyBank,
  'credit-card': CreditCard,
  loan: Wallet,
};

// ─── Constants ──────────────────────────────────────────────────

const LOAN_STORAGE_KEY = 'loan_balance_pence';
const DEFAULT_LOAN_PENCE = 691359;

// ─── Helpers ────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

/** Match a transaction to one of the 7 slot keys, or null to exclude */
function matchSlot(t: Transaction): string | null {
  const name = (t.accountName ?? '').toLowerCase();

  if (t.source === 'amex') {
    const text = `${t.description ?? ''} ${t.rawDescription ?? ''}`.toUpperCase();
    if (text.includes('LARISSA')) return 'amex-larissa';
    if (text.includes('XAVIER') || text.includes('GUS')) return 'amex-gus';
    // Check accountName as fallback
    if (name.includes('larissa')) return 'amex-larissa';
    if (name.includes('xavier') || name.includes('gus')) return 'amex-gus';
    return null; // unmatched amex — exclude
  }

  if (t.source === 'natwest') {
    if (name === 'natwest current') return 'natwest-current';
    if (name === 'natwest savings') return 'natwest-savings';
    if (name.includes('food') || name.includes('shopping')) return 'natwest-food-cc';
    if (name.includes('mastercard') || name.includes('master card')) return 'natwest-mc';
    // Excluded accounts and anything else — don't show
    return null;
  }

  return null;
}

/** NatWest balance: most recent transaction's .balance field */
function natwestBalance(txns: Transaction[], isCreditCard: boolean): number | null {
  if (txns.length === 0) return null;
  const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));

  if (isCreditCard) {
    // Walk back to find a non-zero balance if the most recent is zero
    for (const t of sorted) {
      if (t.balance !== 0) {
        return t.balance < 0 ? Math.abs(t.balance) : 0;
      }
    }
    return 0; // all zero — card is clear
  }

  // Hub / savings — return as-is
  return sorted[0].balance;
}

/** Amex balance: charges since last payment, or last 45 days */
function amexOutstanding(txns: Transaction[]): number | null {
  if (txns.length === 0) return null;

  const payments = txns
    .filter(t => t.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastPaymentDate = payments[0]?.date;

  if (lastPaymentDate) {
    const charges = txns
      .filter(t => t.amount < 0 && t.date > lastPaymentDate)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return charges > 0 ? charges : 0;
  }

  // No payment found — use last 45 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = txns
    .filter(t => t.amount < 0 && t.date >= cutoffStr)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  return recent > 0 ? recent : 0;
}

// ─── Component ──────────────────────────────────────────────────

export function AccountBalancesPanel() {
  const { allTransactions } = useTransactionContext();

  // Loan balance from localStorage
  const [loanPence, setLoanPence] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOAN_PENCE;
    const stored = localStorage.getItem(LOAN_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_LOAN_PENCE;
  });
  const [editingLoan, setEditingLoan] = useState(false);
  const [loanInput, setLoanInput] = useState('');
  const loanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLoan && loanInputRef.current) {
      loanInputRef.current.focus();
      loanInputRef.current.select();
    }
  }, [editingLoan]);

  function saveLoan() {
    const parsed = parseFloat(loanInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed >= 0) {
      const pence = Math.round(parsed * 100);
      setLoanPence(pence);
      localStorage.setItem(LOAN_STORAGE_KEY, String(pence));
    }
    setEditingLoan(false);
  }

  // Group transactions into the 7 fixed slots
  const slotTxns = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const slot of ACCOUNTS) map.set(slot.key, []);

    for (const t of allTransactions) {
      const key = matchSlot(t);
      if (key && map.has(key)) {
        map.get(key)!.push(t);
      }
    }
    return map;
  }, [allTransactions]);

  // Compute balances per slot
  const cards = useMemo(() => {
    return ACCOUNTS.map((slot) => {
      const style = STYLE[slot.type];
      const txns = slotTxns.get(slot.key) ?? [];

      let balance: number | null;

      if (slot.key === 'natwest-loan') {
        balance = loanPence;
      } else if (slot.key.startsWith('amex-')) {
        balance = amexOutstanding(txns);
      } else if (slot.type === 'credit-card') {
        balance = natwestBalance(txns, true);
      } else {
        balance = natwestBalance(txns, false);
      }

      return { ...slot, ...style, balance };
    });
  }, [slotTxns, loanPence]);

  const totalCreditDebt = cards
    .filter(c => c.type === 'credit-card' && c.balance !== null)
    .reduce((s, c) => s + (c.balance ?? 0), 0);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Account Balances</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = ICON_MAP[card.type];
          const isLoan = card.type === 'loan';

          return (
            <div
              key={card.key}
              className="relative rounded-lg p-4 overflow-hidden"
              style={{
                background: '#111318',
                border: '1px solid #1e2028',
                borderLeftWidth: '3px',
                borderLeftColor: card.accent,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">
                  {card.label}
                </span>
                <span
                  className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{
                    background: `${card.accent}18`,
                    color: card.accent,
                  }}
                >
                  {card.badge}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: card.accent }} />
                {isLoan && editingLoan ? (
                  <input
                    ref={loanInputRef}
                    type="text"
                    value={loanInput}
                    onChange={(e) => setLoanInput(e.target.value)}
                    onBlur={saveLoan}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveLoan(); if (e.key === 'Escape') setEditingLoan(false); }}
                    className="bg-transparent border-b border-dashed text-lg font-bold w-full outline-none"
                    style={{
                      color: card.balanceColor,
                      borderColor: card.accent,
                      fontFamily: "var(--font-fira-code), ui-monospace, monospace",
                    }}
                  />
                ) : (
                  <button
                    className={`text-lg font-bold leading-tight text-left ${isLoan ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                    style={{
                      color: card.balance === null ? 'var(--muted)' : card.balanceColor,
                      fontFamily: "var(--font-fira-code), ui-monospace, monospace",
                    }}
                    onClick={() => {
                      if (isLoan) {
                        setLoanInput((loanPence / 100).toFixed(2));
                        setEditingLoan(true);
                      }
                    }}
                    tabIndex={isLoan ? 0 : -1}
                  >
                    {card.balance === null ? 'No data' : formatPence(card.balance)}
                  </button>
                )}
              </div>

              <p className="text-[9px] text-muted/60 mt-1 tracking-wider uppercase">
                {card.balanceLabel}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Total credit card debt: <span className="text-amber-400 font-medium">{formatPence(totalCreditDebt)}</span>
        {' — '}
        Loan remaining: <span className="text-red-400 font-medium">{formatPence(loanPence)}</span>
      </p>
    </div>
  );
}
