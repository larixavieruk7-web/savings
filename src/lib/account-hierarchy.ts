import type { Transaction, AccountConfig, AccountType } from '@/types';

// ─── Patterns for auto-detection ────────────────────────────────

const SALARY_PATTERNS = ['3305 JPMCB', 'XAVIER DA SILVA G'];

const CREDIT_CARD_PATTERNS = ['AMEX', 'AMERICAN EXP'];

const SAVINGS_PATTERNS = ['SAVINGS', 'ISA', 'ROUND UP FROM'];

// ─── Auto-detection ─────────────────────────────────────────────

/** Infer account type from the account name and its transaction patterns */
export function detectAccountType(
  accountName: string,
  transactions: Transaction[]
): AccountType {
  const upper = (accountName || '').toUpperCase();

  // Credit cards — check account name first
  if (upper.includes('AMEX') || upper.includes('AMERICAN EXPRESS')) {
    return 'credit-card';
  }

  // Savings accounts — check account name
  for (const p of SAVINGS_PATTERNS) {
    if (upper.includes(p)) return 'savings';
  }

  // Hub detection — does this account receive salary?
  const accountTxns = transactions.filter(
    (t) => t.accountName === accountName
  );
  const hasSalary = accountTxns.some((t) =>
    SALARY_PATTERNS.some((p) =>
      (t.rawDescription || t.description).toUpperCase().includes(p)
    )
  );
  if (hasSalary) return 'hub';

  // Check if it's a NatWest account with only round-ups / savings transfers
  const allSavings = accountTxns.length > 0 && accountTxns.every((t) => {
    const desc = (t.rawDescription || t.description).toUpperCase();
    return SAVINGS_PATTERNS.some((p) => desc.includes(p)) ||
      t.category === 'Savings & Investments' ||
      t.category === 'Transfers';
  });
  if (allSavings && accountTxns.length > 0) return 'savings';

  return 'unknown';
}

/** Auto-detect types for all accounts found in transactions */
export function detectAllAccountTypes(
  transactions: Transaction[],
  existing: AccountConfig[] = []
): AccountConfig[] {
  // Collect unique account names
  const accountNames = new Set<string>();
  for (const t of transactions) {
    if (t.accountName) accountNames.add(t.accountName);
  }

  // Preserve user-set configs, auto-detect the rest
  const userSet = new Map(
    existing.filter((c) => !c.autoDetected).map((c) => [c.rawName, c])
  );

  const configs: AccountConfig[] = [];
  for (const name of accountNames) {
    if (userSet.has(name)) {
      configs.push(userSet.get(name)!);
    } else {
      configs.push({
        rawName: name,
        type: detectAccountType(name, transactions),
        autoDetected: true,
      });
    }
  }

  return configs;
}

// ─── Account type lookups ───────────────────────────────────────

/** Build a lookup map from account name → type */
export function buildAccountTypeMap(
  configs: AccountConfig[]
): Map<string, AccountType> {
  return new Map(configs.map((c) => [c.rawName, c.type]));
}

/** Get the type for an account, defaulting to 'unknown' */
export function getAccountType(
  accountName: string | undefined,
  typeMap: Map<string, AccountType>
): AccountType {
  if (!accountName) return 'unknown';
  return typeMap.get(accountName) ?? 'unknown';
}

// ─── Transfer reclassification ──────────────────────────────────

/**
 * Check if a transaction is an inter-account transfer that should be
 * reclassified based on the account hierarchy.
 *
 * Returns the new category if reclassification is needed, or null if not.
 */
export function shouldReclassifyAsTransfer(
  transaction: Transaction,
  typeMap: Map<string, AccountType>
): string | null {
  const accountType = getAccountType(transaction.accountName, typeMap);
  const desc = (transaction.rawDescription || transaction.description).toUpperCase();

  // Hub account: outgoing payments to credit cards = Transfers
  if (accountType === 'hub' && transaction.amount < 0) {
    for (const p of CREDIT_CARD_PATTERNS) {
      if (desc.includes(p)) return 'Transfers';
    }
  }

  // Hub account: outgoing to savings = Savings & Investments
  if (accountType === 'hub' && transaction.amount < 0) {
    if (desc.includes('ROUND UP FROM') || desc.includes('SAVE THE CHANGE')) {
      return 'Savings & Investments';
    }
  }

  // Savings account: money going TO hub (positive from savings perspective,
  // or negative = transfer out of savings) = Transfers, NOT income
  if (accountType === 'savings') {
    // Any movement in/out of savings that looks like a transfer
    if (desc.includes('TO A/C') || desc.includes('FROM A/C') ||
        desc.includes('VIA MOBILE') || desc.includes('TFR')) {
      return 'Transfers';
    }
  }

  return null;
}

/**
 * Re-classify transfers across all transactions based on account hierarchy.
 * Only touches transactions that aren't manually categorized.
 * Returns the number of changes made.
 */
export function reclassifyTransfers(
  transactions: Transaction[],
  accountTypes: AccountConfig[]
): { transactions: Transaction[]; changed: number } {
  const typeMap = buildAccountTypeMap(accountTypes);
  let changed = 0;

  for (const t of transactions) {
    // Never override manual corrections
    if (t.categorySource === 'manual') continue;

    const newCategory = shouldReclassifyAsTransfer(t, typeMap);
    if (newCategory && newCategory !== t.category) {
      t.category = newCategory;
      t.categorySource = 'rule';
      changed++;
    }
  }

  return { transactions, changed };
}
