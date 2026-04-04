import Papa from 'papaparse';
import { parse, format, isValid } from 'date-fns';
import { categorize } from '@/lib/categories';
import type { Transaction, CategoryRule } from '@/types';

interface AmexRow {
  Date: string;
  Description: string;
  'Card Member': string;
  'Account #': string;
  Amount: string;
  'Extended Details': string;
  'Appears On Your Statement As': string;
  Address: string;
  'Town/City': string;
  Postcode: string;
  Country: string;
  Reference: string;
  Category: string;
}

/** Map Amex categories to our categories */
const AMEX_CATEGORY_MAP: Record<string, { category: string; isEssential: boolean }> = {
  // Groceries
  'general purchases-groceries': { category: 'Groceries', isEssential: true },
  'general purchases-supermarkets': { category: 'Groceries', isEssential: true },
  // Dining
  'entertainment-restaurants': { category: 'Dining Out', isEssential: false },
  'entertainment-bars & cafés': { category: 'Drinks & Nights Out', isEssential: false },
  'entertainment-bars & cafes': { category: 'Drinks & Nights Out', isEssential: false },
  // Shopping
  'general purchases-department stores': { category: 'Shopping', isEssential: false },
  'general purchases-clothing stores': { category: 'Shopping', isEssential: false },
  'general purchases-online shopping': { category: 'Shopping', isEssential: false },
  'general purchases-florists & gardening': { category: 'Shopping', isEssential: false },
  'general purchases-retail': { category: 'Shopping', isEssential: false },
  // Health
  'general purchases-pharmacies': { category: 'Healthcare', isEssential: true },
  'general purchases-health & wellness': { category: 'Healthcare', isEssential: true },
  // Fuel
  'general purchases-fuel': { category: 'Transport', isEssential: true },
  // Travel
  'travel-airline': { category: 'Holidays & Travel', isEssential: false },
  'travel-travel agencies': { category: 'Holidays & Travel', isEssential: false },
  'travel-hotels & accommodations': { category: 'Holidays & Travel', isEssential: false },
  'travel-car rental': { category: 'Holidays & Travel', isEssential: false },
  // Transport
  'transportation-fuel': { category: 'Transport', isEssential: true },
  'transportation-parking': { category: 'Transport', isEssential: true },
  'transportation-taxis & rideshare': { category: 'Transport', isEssential: true },
  // Communications
  'communications-landline communication': { category: 'Phone & Internet', isEssential: true },
  'communications-mobile communication': { category: 'Phone & Internet', isEssential: true },
  // Entertainment
  'entertainment-entertainment': { category: 'Entertainment', isEssential: false },
  'entertainment-cinema': { category: 'Entertainment', isEssential: false },
  // Insurance
  'insurance-insurance': { category: 'Insurance', isEssential: true },
  // Subscriptions
  'general purchases-subscriptions': { category: 'Subscriptions', isEssential: false },
  // Personal care
  'general purchases-personal care': { category: 'Personal Care', isEssential: false },
  'general purchases-beauty': { category: 'Personal Care', isEssential: false },
  // Home
  'general purchases-home improvement': { category: 'Housing', isEssential: true },
  'general purchases-home furnishings': { category: 'Shopping', isEssential: false },
  // Education
  'education-education': { category: 'Childcare & Education', isEssential: true },
  // Charity
  'charity-charity': { category: 'Charity', isEssential: false },
  // Travel (additional)
  'travel-lodging': { category: 'Holidays & Travel', isEssential: false },
  'travel-rail services': { category: 'Transport', isEssential: true },
  'travel-auto services': { category: 'Transport', isEssential: true },
  // General retail / computer / government
  'general purchases-general retail': { category: 'Shopping', isEssential: false },
  'general purchases-computer supplies': { category: 'Subscriptions', isEssential: false },
  'general purchases-government services': { category: 'Other', isEssential: true },
  'general purchases-arts & jewellery': { category: 'Shopping', isEssential: false },
  // Communications (alternate spelling from Amex)
  'communications-mobile telecommunication': { category: 'Phone & Internet', isEssential: true },
  // Miscellaneous
  'miscellaneous-other': { category: 'Other', isEssential: false },
};

function mapAmexCategory(amexCat: string): { category: string; isEssential: boolean } | null {
  if (!amexCat) return null;
  const key = amexCat.toLowerCase().trim();
  return AMEX_CATEGORY_MAP[key] || null;
}

/** Parse Amex date format DD/MM/YYYY */
function parseAmexDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  const parsed = parse(trimmed, 'dd/MM/yyyy', new Date());
  if (isValid(parsed) && parsed.getFullYear() > 2000) return parsed;

  // Fallback
  const native = new Date(trimmed);
  if (isValid(native) && native.getFullYear() > 2000) return native;

  throw new Error(`Cannot parse Amex date: "${trimmed}"`);
}

/** Extract card member's first name */
function getCardMemberName(member: string): string {
  if (!member) return '';
  // "MRS LARISSA DA SILVA" → "Larissa"
  // "G XAVIER DA SILVA" → "Gus"
  const parts = member.trim().split(/\s+/);
  // Skip title (MR/MRS/MS/DR)
  const nameIdx = /^(MR|MRS|MS|DR|MISS)$/i.test(parts[0]) ? 1 : 0;
  return parts[nameIdx] || member;
}

/** Parse an Amex CSV string into normalized transactions */
export function parseAmexCSV(
  csvString: string,
  customRules: CategoryRule[] = []
): { transactions: Transaction[]; errors: string[] } {
  const errors: string[] = [];

  const result = Papa.parse<AmexRow>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    errors.push(...result.errors.map((e) => `Row ${e.row}: ${e.message}`));
  }

  // First pass: parse all rows into transactions with base IDs
  interface ParsedRow {
    baseId: string;
    description: string;
    txn: Omit<Transaction, 'id'>;
  }
  const parsed: ParsedRow[] = [];

  for (const row of result.data) {
    try {
      if (!row.Date?.trim() || !row.Amount?.trim()) continue;

      const parsedDate = parseAmexDate(row.Date);
      const isoDate = format(parsedDate, 'yyyy-MM-dd');

      // Amex amounts: positive = charge (money out), negative = refund/credit
      const amountStr = row.Amount.trim().replace(/[£,]/g, '');
      const amountPounds = parseFloat(amountStr);
      if (isNaN(amountPounds)) {
        errors.push(`Invalid amount "${row.Amount}" for: ${row.Description}`);
        continue;
      }
      // FLIP sign: Amex positive = outflow, our convention negative = outflow
      const amountPence = Math.round(-amountPounds * 100);

      const description = row.Description?.trim() || '';
      const cardMember = row['Card Member']?.trim() || '';
      const accountNum = row['Account #']?.trim() || '';
      const town = row['Town/City']?.trim() || '';
      const amexCategory = row.Category?.trim() || '';

      // Try Amex's own category mapping first
      const amexMapped = mapAmexCategory(amexCategory);

      // Then try our keyword rules
      const { category: ruleCategory, subcategory } = categorize(description, customRules);

      // Priority: custom rules > Amex mapping > keyword rules > Other
      let finalCategory = ruleCategory;
      let isEssential: boolean | undefined;
      const categorySource: 'rule' | 'ai' | 'manual' = 'rule';

      if (ruleCategory !== 'Other') {
        // Our rules matched
        finalCategory = ruleCategory;
      } else if (amexMapped) {
        // Use Amex's own category
        finalCategory = amexMapped.category;
        isEssential = amexMapped.isEssential;
      }

      // Positive amounts (refunds) that didn't match → Income/Refunds
      if (amountPence > 0 && finalCategory === 'Other') {
        finalCategory = 'Refunds';
      }

      // Build account name from card member
      const memberName = getCardMemberName(cardMember);
      const accountName = `Amex ${memberName} (${accountNum})`;

      // Extract merchant from description (clean up Amex format)
      const merchantName = extractAmexMerchant(description, town);

      // Base ID for dedup
      const baseId = `amex-${isoDate}-${amountPence}-${accountNum}-${description.slice(0, 25)}`;

      parsed.push({
        baseId,
        description,
        txn: {
          date: isoDate,
          type: 'AMEX',
          description: town ? `${description} (${town})` : description,
          rawDescription: description,
          amount: amountPence,
          balance: 0, // Amex doesn't provide running balance
          category: finalCategory,
          subcategory,
          merchantName,
          isRecurring: false,
          isEssential,
          accountName,
          source: 'amex',
          categorySource,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${msg} — row: ${row.Date} ${row.Description}`);
    }
  }

  // Second pass: assign deterministic suffixes by sorting collisions alphabetically
  const transactions = assignDeterministicIds(parsed);

  return { transactions, errors };
}

/** Assign deterministic IDs: sort collisions by full description so suffix order is stable */
function assignDeterministicIds(
  parsed: { baseId: string; description: string; txn: Omit<Transaction, 'id'> }[]
): Transaction[] {
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
      const sorted = [...group].sort((a, b) => a.description.localeCompare(b.description));
      for (let i = 0; i < sorted.length; i++) {
        transactions.push({ ...sorted[i].txn, id: `${baseId}-${i + 1}` });
      }
    }
  }
  return transactions;
}

/** Clean up Amex merchant descriptions */
function extractAmexMerchant(description: string, town: string): string {
  let cleaned = description.trim();
  // Remove trailing town/location (Amex often appends it)
  if (town && cleaned.toUpperCase().endsWith(town.toUpperCase())) {
    cleaned = cleaned.slice(0, -town.length).trim();
  }
  // Remove trailing spaces and special chars
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned || description.trim();
}

/** Detect Amex CSV format by checking headers */
export function isAmexFormat(headers: string[]): boolean {
  const required = ['Date', 'Description', 'Card Member', 'Amount', 'Category'];
  const normalized = headers.map((h) => h.trim());
  return required.every((r) => normalized.includes(r));
}
