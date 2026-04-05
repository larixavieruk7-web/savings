import Papa from 'papaparse';
import { parse, format, isValid } from 'date-fns';
import { categorize } from '@/lib/categories';
import type { Transaction, CategoryRule } from '@/types';

interface NatWestRow {
  Date: string;
  Type: string;
  Description: string;
  Value: string;
  Balance: string;
  'Account Name': string;
  'Account Number': string;
}

/** Try multiple date formats that NatWest uses */
function parseNatWestDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  const formats = [
    'dd MMMM yyyy',  // "29 May 2025" — actual NatWest format
    'dd MMM yyyy',   // "29 May 2025" short month
    'dd/MM/yyyy',    // "29/05/2025" — alternative format
    'd MMMM yyyy',   // "9 May 2025" — single digit day
    'd MMM yyyy',    // "9 May 2025"
  ];

  for (const fmt of formats) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed) && parsed.getFullYear() > 2000) {
      return parsed;
    }
  }

  // Fallback: try native Date parsing
  const native = new Date(trimmed);
  if (isValid(native) && native.getFullYear() > 2000) {
    return native;
  }

  throw new Error(`Cannot parse date: "${trimmed}"`);
}

/** Parse a NatWest CSV string into normalized transactions */
export function parseNatWestCSV(
  csvString: string,
  customRules: CategoryRule[] = []
): { transactions: Transaction[]; errors: string[] } {
  const errors: string[] = [];

  const result = Papa.parse<NatWestRow>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    errors.push(
      ...result.errors.map((e) => `Row ${e.row}: ${e.message}`)
    );
  }

  // First pass: parse all rows into transactions with base IDs
  interface ParsedRow {
    baseId: string;
    description: string;
    accountNum: string;
    txn: Omit<Transaction, 'id'>;
  }
  const parsed: ParsedRow[] = [];

  // NatWest credit-card CSVs leave the Balance column blank on every row and
  // only publish the real outstanding balance on a "Balance as at …" summary
  // row. Capture those per-account so we can stamp the latest onto the most
  // recent transaction after parsing.
  const balanceSnapshots = new Map<string, number>();

  for (const row of result.data) {
    try {
      // Balance-as-at summary row: no Value, but Balance is populated.
      if (row.Description?.trim().startsWith('Balance as at')) {
        const acct = row['Account Number']?.trim() || '';
        const balStr = row.Balance?.trim().replace(/[£,]/g, '');
        if (acct && balStr) {
          const bal = parseFloat(balStr);
          if (!isNaN(bal)) balanceSnapshots.set(acct, Math.round(bal * 100));
        }
        continue;
      }

      if (!row.Date?.trim() || !row.Value?.trim()) continue;

      const parsedDate = parseNatWestDate(row.Date);
      const isoDate = format(parsedDate, 'yyyy-MM-dd');

      // Parse amount — NatWest current/savings use negative for outflows,
      // BUT NatWest credit-card CSVs invert the sign: purchases are positive
      // and payments received are negative. Detect credit cards by the masked
      // account number (e.g. "546811******1853") and flip.
      const accountNum = row['Account Number']?.trim() || '';
      const isCreditCard = accountNum.includes('*');

      const amountStr = row.Value.trim().replace(/[£,]/g, '');
      const amountPoundsRaw = parseFloat(amountStr);
      if (isNaN(amountPoundsRaw)) {
        errors.push(`Invalid amount "${row.Value}" for: ${row.Description}`);
        continue;
      }
      const amountPounds = isCreditCard ? -amountPoundsRaw : amountPoundsRaw;
      const amountPence = Math.round(amountPounds * 100);

      // Parse balance
      const balanceStr = row.Balance?.trim().replace(/[£,]/g, '') || '0';
      const balancePence = Math.round(parseFloat(balanceStr) * 100);

      // Categorize
      const description = row.Description?.trim() || '';
      const txnType = row.Type?.trim().toUpperCase() || '';
      const { category, subcategory, isEssential: ruleEssential } = categorize(description, customRules);

      // NatWest type-based fallback when description rules don't match
      let finalCategory = category;
      if (category === 'Other') {
        if (txnType === 'CHG') finalCategory = 'Bank Charges';
        else if (txnType === 'C/L') finalCategory = 'Cash Withdrawals';
        else if (txnType === 'INT') finalCategory = 'Income';
        else if (txnType === 'FEES') finalCategory = 'Bank Charges';
        // BAC is the most common UK payment type — do NOT default to Salary.
        // Only known salary patterns (3305 JPMCB, XAVIER DA SILVA G) should
        // be Salary — those are caught by keyword rules above.
        // Unknown BAC credits stay as 'Other' to avoid inflating income.
      }

      // Build a base ID including account to handle multi-account CSVs
      const baseId = `${isoDate}-${amountPence}-${accountNum}-${description.slice(0, 30)}`;

      parsed.push({
        baseId,
        description,
        accountNum,
        txn: {
          date: isoDate,
          type: row.Type?.trim() || '',
          description,
          rawDescription: row.Description || '',
          amount: amountPence,
          balance: balancePence,
          category: finalCategory,
          subcategory,
          isEssential: ruleEssential,
          accountName: row['Account Name']?.trim(),
          source: 'natwest' as const,
          categorySource: 'rule' as const,
          isRecurring: false,
          merchantName: extractMerchant(description),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${msg} — row: ${row.Date} ${row.Description}`);
    }
  }

  // Second pass: stamp captured "Balance as at" snapshots onto the most recent
  // txn of each account. NatWest credit-card rows otherwise have empty Balance.
  for (const [acct, balPence] of balanceSnapshots) {
    let latestIdx = -1;
    let latestDate = '';
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].accountNum === acct && parsed[i].txn.date > latestDate) {
        latestDate = parsed[i].txn.date;
        latestIdx = i;
      }
    }
    if (latestIdx >= 0) parsed[latestIdx].txn.balance = balPence;
  }

  // Third pass: assign deterministic suffixes by sorting collisions alphabetically
  const transactions = assignDeterministicIds(parsed);

  return { transactions, errors };
}

/** Assign deterministic IDs: sort collisions by full description so suffix order is stable */
function assignDeterministicIds(
  parsed: { baseId: string; description: string; accountNum: string; txn: Omit<Transaction, 'id'> }[]
): Transaction[] {
  // Group by baseId to find collisions
  const groups = new Map<string, typeof parsed>();
  for (const entry of parsed) {
    const group = groups.get(entry.baseId);
    if (group) group.push(entry);
    else groups.set(entry.baseId, [entry]);
  }

  const transactions: Transaction[] = [];
  for (const [baseId, group] of groups) {
    if (group.length === 1) {
      transactions.push({ ...group[0].txn, id: baseId });
    } else {
      // Sort alphabetically by full description for deterministic suffix assignment
      const sorted = [...group].sort((a, b) => a.description.localeCompare(b.description));
      for (let i = 0; i < sorted.length; i++) {
        transactions.push({ ...sorted[i].txn, id: `${baseId}-${i + 1}` });
      }
    }
  }
  return transactions;
}

/** Extract a clean merchant name from a NatWest description */
function extractMerchant(description: string): string {
  let cleaned = description.trim();
  // Remove common NatWest prefixes
  cleaned = cleaned.replace(/^(VISA |VIS |DEB |D\/D |S\/O |TFR |BGC |FPO |FPI |CHQ )/i, '');
  // Remove trailing reference numbers
  cleaned = cleaned.replace(/\s+\d{4,}$/, '');
  // Remove dates at end
  cleaned = cleaned.replace(/\s+\d{2}\/\d{2}\/?\d{0,4}$/, '');
  // Take first meaningful portion
  cleaned = cleaned.split(/\s{2,}/)[0] || cleaned;
  return cleaned.trim();
}

/** Detect NatWest CSV format by checking headers */
export function isNatWestFormat(headers: string[]): boolean {
  const required = ['Date', 'Type', 'Description', 'Value', 'Balance'];
  const normalized = headers.map((h) => h.trim());
  return required.every((r) => normalized.includes(r));
}
