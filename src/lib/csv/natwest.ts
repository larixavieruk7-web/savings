import Papa from 'papaparse';
import { parse, format } from 'date-fns';
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

  for (const row of result.data) {
    try {
      // Parse NatWest date format (DD/MM/YYYY)
      const parsedDate = parse(row.Date.trim(), 'dd/MM/yyyy', new Date());
      const isoDate = format(parsedDate, 'yyyy-MM-dd');

      // Parse amount — NatWest uses negative for outflows
      const amountStr = row.Value?.trim().replace(/[£,]/g, '');
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
      const { category, subcategory } = categorize(
        row.Description,
        customRules
      );

      // Determine if income
      const finalCategory = amountPence > 0 && category === 'Other'
        ? 'Income'
        : category;

      transactions.push({
        id: `${isoDate}-${amountPence}-${row.Description.trim().slice(0, 20)}`,
        date: isoDate,
        type: row.Type?.trim() || '',
        description: row.Description?.trim() || '',
        rawDescription: row.Description || '',
        amount: amountPence,
        balance: balancePence,
        category: finalCategory,
        subcategory,
        accountName: row['Account Name']?.trim(),
        isRecurring: false,
        merchantName: extractMerchant(row.Description),
      });
    } catch {
      errors.push(`Failed to parse row: ${JSON.stringify(row)}`);
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
