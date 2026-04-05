'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { Landmark, CreditCard, PiggyBank, Wallet } from 'lucide-react';
import type { Transaction } from '@/types';
import { getManualBalances, saveManualBalance } from '@/lib/storage';

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
  // Household has two Amex accounts, each with a primary + supplementary card:
  //   BA Premium Plus: Gus -21005 primary, Larissa -21013 supplementary
  //   Platinum Cashback: Gus -71002 primary, Larissa -71010 supplementary
  // The bill for each account covers both cards. Gus pays both via NatWest FP.
  { key: 'amex-ba',          label: 'Amex BA Premium',          type: 'credit-card' },
  { key: 'amex-cashback',    label: 'Amex Platinum Cashback',   type: 'credit-card' },
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

// Manual balances are persisted in Supabase (user_settings.manual_balances jsonb).
// Defaults below are only used on first load before the fetch completes.
const DEFAULTS: Record<string, number> = {
  'natwest-loan':  691359,  // £6,913.59
  'amex-ba':       221165,  // £2,211.65 (-21005 primary + -21013 Larissa supp)
  'amex-cashback': 9683,    // £96.83  (-71002 primary + -71010 Larissa supp)
};

// ─── Helpers ────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

/** Match a transaction to one of the 7 slot keys, or null to exclude */
function matchSlot(t: Transaction): string | null {
  const name = (t.accountName ?? '').toLowerCase();

  if (t.source === 'amex') {
    // Amex account_name is set by parser as "Amex <Initial> (-NNNNN)".
    // Two Amex accounts in the household, each with primary + supplementary:
    //   BA Premium Plus account: -21005 (Gus) + -21013 (Larissa supp)
    //   Platinum Cashback account: -71002 (Gus) + -71010 (Larissa supp)
    // Payments on either account cover both cards on that account.
    if (name.includes('21005') || name.includes('21013')) return 'amex-ba';
    if (name.includes('71002') || name.includes('71010')) return 'amex-cashback';
    return null;
  }

  if (t.source === 'natwest') {
    // Credit cards first — "Food Shopping Cc" contains "current" nowhere but
    // we still want CC matchers ahead of the generic current/savings checks.
    if (name.includes('food') || name.includes('shopping')) return 'natwest-food-cc';
    if (name.includes('mastercard') || name.includes('master card')) return 'natwest-mc';
    // NatWest CSV labels are "Current Account" / "Main Savings Account" —
    // old strict equality on "natwest current"/"natwest savings" never matched.
    if (name.includes('savings')) return 'natwest-savings';
    if (name.includes('current')) return 'natwest-current';
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
    // Walk back to find a non-zero balance if the most recent is zero.
    // NatWest reports CC outstanding as a POSITIVE number on the "Balance as at"
    // summary row, and the parser stores it as-is. Old convention stored debt
    // as negative, so accept either and return the magnitude.
    for (const t of sorted) {
      if (t.balance !== 0 && !isNaN(t.balance)) {
        return Math.abs(t.balance);
      }
    }
    return 0; // all zero — card is clear
  }

  // Hub / savings — return as-is
  return sorted[0].balance;
}

/** Amex balance: charges since last real statement payment, or last 30 days.
 *  A "payment" is specifically the "PAYMENT RECEIVED - THANK YOU" row Amex
 *  inserts when a statement direct-debit clears — NOT merchant refunds, which
 *  also appear as positive amounts. Previously the logic treated any positive
 *  as a payment, which for Larissa's card (no PAYMENT RECEIVED rows in the
 *  exported CSV) caused tiny refunds to anchor the window and hugely inflate
 *  the outstanding figure. */
function amexOutstanding(txns: Transaction[]): number | null {
  if (txns.length === 0) return null;

  const isStatementPayment = (t: Transaction) => {
    const d = `${t.description ?? ''} ${t.rawDescription ?? ''}`.toUpperCase();
    return t.amount > 0 && d.includes('PAYMENT RECEIVED');
  };

  const payments = txns
    .filter(isStatementPayment)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastPaymentDate = payments[0]?.date;

  if (lastPaymentDate) {
    // Sum signed amounts after last payment — charges (negative) plus any
    // refunds (positive) — so refunds reduce the outstanding correctly.
    const netSinceLastPayment = txns
      .filter(t => t.date > lastPaymentDate && !isStatementPayment(t))
      .reduce((s, t) => s + t.amount, 0);
    const outstanding = -netSinceLastPayment; // charges are negative, flip to show as positive owed
    return outstanding > 0 ? outstanding : 0;
  }

  // No PAYMENT RECEIVED row found — fall back to last 30 days of net activity.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const netRecent = txns
    .filter(t => t.date >= cutoffStr)
    .reduce((s, t) => s + t.amount, 0);
  const recent = -netRecent;
  return recent > 0 ? recent : 0;
}

// ─── Component ──────────────────────────────────────────────────

// Slot keys that have a user-editable manual balance. Stored in Supabase
// (user_settings.manual_balances jsonb), defaults only while fetch is pending.
const MANUAL_BALANCE_SLOTS = new Set(['natwest-loan', 'amex-ba', 'amex-cashback']);

export function AccountBalancesPanel() {
  const { allTransactions } = useTransactionContext();

  // Start with defaults, replace with Supabase values once fetched.
  const [manualPence, setManualPence] = useState<Record<string, number>>(DEFAULTS);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load manual balances from Supabase on mount. Merge over defaults so any
  // slot the user hasn't set yet keeps its default.
  useEffect(() => {
    let cancelled = false;
    getManualBalances().then((remote) => {
      if (cancelled || !remote) return;
      setManualPence((prev) => ({ ...prev, ...remote }));
    }).catch((err) => console.error('[AccountBalancesPanel] load balances error:', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (editingSlot && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSlot]);

  function saveEdit() {
    if (!editingSlot) return;
    const parsed = parseFloat(editInput.replace(/[^0-9.]/g, ''));
    if (MANUAL_BALANCE_SLOTS.has(editingSlot) && !isNaN(parsed) && parsed >= 0) {
      const pence = Math.round(parsed * 100);
      const slot = editingSlot;
      setManualPence((prev) => ({ ...prev, [slot]: pence }));
      saveManualBalance(slot, pence).catch((err) =>
        console.error('[AccountBalancesPanel] save balance error:', err)
      );
    }
    setEditingSlot(null);
  }

  function beginEdit(slotKey: string) {
    if (!MANUAL_BALANCE_SLOTS.has(slotKey)) return;
    setEditInput((manualPence[slotKey] / 100).toFixed(2));
    setEditingSlot(slotKey);
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

      if (MANUAL_BALANCE_SLOTS.has(slot.key)) {
        balance = manualPence[slot.key] ?? DEFAULTS[slot.key] ?? 0;
      } else if (slot.type === 'credit-card') {
        balance = natwestBalance(txns, true);
      } else {
        balance = natwestBalance(txns, false);
      }

      return { ...slot, ...style, balance };
    });
  }, [slotTxns, manualPence]);

  const totalCreditDebt = cards
    .filter(c => c.type === 'credit-card' && c.balance !== null)
    .reduce((s, c) => s + (c.balance ?? 0), 0);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Account Balances</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = ICON_MAP[card.type];
          const isEditable = MANUAL_BALANCE_SLOTS.has(card.key);
          const isEditingThis = editingSlot === card.key;

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
                {isEditable && isEditingThis ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingSlot(null); }}
                    className="bg-transparent border-b border-dashed text-lg font-bold w-full outline-none"
                    style={{
                      color: card.balanceColor,
                      borderColor: card.accent,
                      fontFamily: "var(--font-fira-code), ui-monospace, monospace",
                    }}
                  />
                ) : (
                  <button
                    className={`text-lg font-bold leading-tight text-left ${isEditable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                    style={{
                      color: card.balance === null ? 'var(--muted)' : card.balanceColor,
                      fontFamily: "var(--font-fira-code), ui-monospace, monospace",
                    }}
                    onClick={() => { if (isEditable) beginEdit(card.key); }}
                    tabIndex={isEditable ? 0 : -1}
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
        Loan remaining: <span className="text-red-400 font-medium">{formatPence(manualPence['natwest-loan'] ?? 0)}</span>
      </p>
    </div>
  );
}
