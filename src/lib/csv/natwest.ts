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

  const transactions: Transaction[] = [];
  const seenIds = new Set<string>();

  for (const row of result.data) {
    try {
      if (!row.Date?.trim() || !row.Value?.trim()) continue;

      const parsedDate = parseNatWestDate(row.Date);
      const isoDate = format(parsedDate, 'yyyy-MM-dd');

      // Parse amount — NatWest uses negative for outflows
      const amountStr = row.Value.trim().replace(/[£,]/g, '');
      const amountPounds = parseFloat(amountStr);
      if (isNaN(amountPounds)) {
        errors.push(`Invalid amount "${row.Value}" for: ${row.Description}`);
        continue;
      }
      const amountPence = Math.round(amountPounds * 100);

      // Parse balance
      const balanceStr = row.Balance?.trim().replace(/[£,]/g, '') || '0';
      const balancePence = Math.round(parseFloat(balanceStr) * 100);

      // Categorize
      const description = row.Description?.trim() || '';
      const { category, subcategory } = categorize(description, customRules);

      // Determine if income (positive amount with no specific category)
      const finalCategory = amountPence > 0 && category === 'Other'
        ? 'Income'
        : category;

      // Build a unique ID including account to handle multi-account CSVs
      const accountNum = row['Account Number']?.trim() || '';
      let id = `${isoDate}-${amountPence}-${accountNum}-${description.slice(0, 30)}`;

      // Handle duplicate IDs (same day, same amount, same description)
      let suffix = 0;
      let uniqueId = id;
      while (seenIds.has(uniqueId)) {
        suffix++;
        uniqueId = `${id}-${suffix}`;
      }
      seenIds.add(uniqueId);

      transactions.push({
        id: uniqueId,
        date: isoDate,
        type: row.Type?.trim() || '',
        description,
        rawDescription: row.Description || '',
        amount: amountPence,
        balance: balancePence,
        category: finalCategory,
        subcategory,
        accountName: row['Account Name']?.trim(),
        isRecurring: false,
        merchantName: extractMerchant(description),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${msg} — row: ${row.Date} ${row.Description}`);
    }
  }

  return { transactions, errors };
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
