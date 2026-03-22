import type { Transaction, AccountConfig, SalaryFlow } from '@/types';
import type { SalaryCycle } from '@/hooks/useTransactions';
import { buildAccountTypeMap, getAccountType } from './account-hierarchy';

const INTERNAL_CATEGORIES = new Set(['Transfers', 'Savings & Investments']);

/**
 * Compute where salary went for a given cycle.
 * Breaks down: credit card payments, savings, direct debits, direct spending,
 * and actual credit card spending (from Amex CSVs).
 */
export function computeSalaryFlow(
  transactions: Transaction[],
  accountTypes: AccountConfig[],
  cycle: SalaryCycle
): SalaryFlow {
  const typeMap = buildAccountTypeMap(accountTypes);

  // Filter to this cycle
  const cycleTxns = transactions.filter(
    (t) => t.date >= cycle.start && t.date <= cycle.end
  );

  let totalSalary = 0;
  let creditCardPayments = 0;
  let savingsContributions = 0;
  let directDebits = 0;
  let directSpending = 0;
  let creditCardSpending = 0;

  for (const t of cycleTxns) {
    const acctType = getAccountType(t.accountName, typeMap);

    // Salary = positive amounts categorized as Salary from hub
    if (acctType === 'hub' && t.category === 'Salary' && t.amount > 0) {
      totalSalary += t.amount;
      continue;
    }

    // Hub outflows
    if (acctType === 'hub' && t.amount < 0) {
      const absAmount = Math.abs(t.amount);

      if (t.category === 'Transfers') {
        // Check if it's a credit card payment or generic transfer
        const desc = (t.rawDescription || t.description).toUpperCase();
        if (desc.includes('AMEX') || desc.includes('AMERICAN EXP')) {
          creditCardPayments += absAmount;
        }
        // Other transfers (between own NatWest accounts) — don't count as spending
        continue;
      }

      if (t.category === 'Savings & Investments') {
        savingsContributions += absAmount;
        continue;
      }

      // Real spending from hub
      if (t.type === 'D/D') {
        directDebits += absAmount;
      } else {
        directSpending += absAmount;
      }
      continue;
    }

    // Credit card spending (from Amex CSVs — actual itemised charges)
    if (acctType === 'credit-card' && t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)) {
      creditCardSpending += Math.abs(t.amount);
    }
  }

  const unaccounted = totalSalary - creditCardPayments - savingsContributions - directDebits - directSpending;

  return {
    cycleId: cycle.id,
    totalSalary,
    creditCardPayments,
    savingsContributions,
    directDebits,
    directSpending,
    creditCardSpending,
    unaccounted,
  };
}
