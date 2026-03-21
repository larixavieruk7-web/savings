'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { formatGBP } from '@/lib/utils';
import type { PotentialDuplicate, RecurringMerchant } from '@/lib/subscriptions';

interface Props {
  potentialDuplicates: PotentialDuplicate[];
  recurringMerchants: RecurringMerchant[];
}

export function SubscriptionsPanel({ potentialDuplicates, recurringMerchants }: Props) {
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  const byAccount = recurringMerchants.reduce<Record<string, RecurringMerchant[]>>((acc, m) => {
    if (!acc[m.account]) acc[m.account] = [];
    acc[m.account].push(m);
    return acc;
  }, {});

  const accountEntries = Object.entries(byAccount);
  const displayedAccounts = showAllAccounts ? accountEntries : accountEntries.slice(0, 3);

  const totalWasted = potentialDuplicates.reduce((s, d) => s + d.wastedMonthlyPence, 0);
  const totalMonthlyRecurring = recurringMerchants.reduce((s, m) => s + m.avgAmountPence, 0);

  return (
    <div id="subscriptions" className="space-y-4">
      {/* Potential Duplicates */}
      {potentialDuplicates.length > 0 ? (
        <div className="bg-card border border-amber-500/25 rounded-xl p-5">
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-foreground">
                Potential Duplicate Subscriptions
              </h3>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-xs text-muted">Wasted monthly</p>
              <p className="text-xl font-bold text-amber-400">~{formatGBP(totalWasted)}</p>
            </div>
          </div>
          <p className="text-sm text-muted mb-4">
            These merchants appear as recurring charges on more than one account — you may be paying for the same service twice.
          </p>
          <div className="space-y-3">
            {potentialDuplicates.map((d, i) => (
              <div key={i} className="border-l-2 border-amber-500/50 pl-4 py-0.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-foreground">{d.merchant}</span>
                  <span className="text-xs font-medium text-amber-400">
                    ~{formatGBP(d.wastedMonthlyPence)} wasted/mo
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.accounts.map((a, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1.5 text-xs bg-amber-500/8 border border-amber-500/20 text-amber-300/80 px-2.5 py-1 rounded-full"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
                      {a.account} · {formatGBP(a.avgAmountPence)}/mo · {a.monthCount}m
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-muted shrink-0" />
          <p className="text-sm text-muted">No duplicate subscriptions detected across accounts.</p>
        </div>
      )}

      {/* All Recurring Payments */}
      {recurringMerchants.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold text-foreground">All Recurring Payments</h3>
            <div className="ml-auto text-right">
              <span className="text-xs text-muted block">{recurringMerchants.length} found</span>
              <span className="text-xs font-medium text-foreground">{formatGBP(totalMonthlyRecurring)}/mo total</span>
            </div>
          </div>

          <div className="space-y-5">
            {displayedAccounts.map(([account, merchants]) => (
              <div key={account}>
                <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                  {account}
                </p>
                <div className="space-y-0">
                  {merchants.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-card-border/40 last:border-0"
                    >
                      <span className="text-sm text-foreground">{m.merchant}</span>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <span className="text-xs text-muted hidden sm:block">
                          {m.monthCount} months
                        </span>
                        <span className="text-sm font-medium text-foreground w-24 text-right">
                          {formatGBP(m.avgAmountPence)}/mo
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {accountEntries.length > 3 && (
            <button
              onClick={() => setShowAllAccounts(!showAllAccounts)}
              className="flex items-center gap-1 text-sm text-accent mt-4 hover:underline"
            >
              {showAllAccounts ? (
                <><ChevronUp className="h-3 w-3" /> Show less</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> Show all {accountEntries.length} accounts</>
              )}
            </button>
          )}
        </div>
      )}

      {potentialDuplicates.length === 0 && recurringMerchants.length === 0 && (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <RefreshCw className="h-10 w-10 text-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted">
            No recurring payments detected yet. Upload more months of bank statements to identify subscription patterns.
          </p>
        </div>
      )}
    </div>
  );
}
