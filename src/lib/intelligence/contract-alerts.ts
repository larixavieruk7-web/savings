import type { Transaction } from '@/types';
import { formatGBP } from './utils';

export interface ContractAlert {
  merchant: string;
  monthlyAmount: number;       // pence (average monthly charge)
  months: number;              // how many consecutive months
  totalPaid: number;           // pence (total paid over detected period)
  suggestion: string;          // "Call retentions or check comparison sites"
  estimatedSaving: string;     // "Typical saving: £15-25/month"
  firstSeen: string;           // ISO date of first charge
  lastSeen: string;            // ISO date of most recent charge
}

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

// Merchant type patterns for generating tailored suggestions
const MERCHANT_TYPE_PATTERNS: { type: string; patterns: string[] }[] = [
  {
    type: 'phone_broadband',
    patterns: [
      'VODAFONE', 'EE', 'THREE', 'O2', 'BT ', 'SKY', 'VIRGIN MEDIA',
      'PLUSNET', 'TALKTALK', 'HYPEROPTIC', 'ZEN INTERNET', 'GIFFGAFF',
      'TESCO MOBILE', 'ID MOBILE', 'VOXI',
    ],
  },
  {
    type: 'insurance',
    patterns: [
      'AVIVA', 'DIRECT LINE', 'ADMIRAL', 'MORE THAN', 'CHURCHILL',
      'HASTINGS', 'AA INSURANCE', 'RAC', 'VITALITY', 'BUPA',
      'AXA', 'ZURICH', 'LEGAL & GENERAL', 'NFU', 'POLICY EXPERT',
    ],
  },
  {
    type: 'streaming',
    patterns: [
      'NETFLIX', 'DISNEY', 'AMAZON PRIME', 'APPLE TV', 'NOW TV',
      'PARAMOUNT', 'HAYU', 'BRITBOX', 'DISCOVERY', 'CRUNCHYROLL',
      'YOUTUBE PREMIUM', 'SPOTIFY', 'APPLE MUSIC', 'TIDAL', 'DEEZER',
      'AUDIBLE',
    ],
  },
  {
    type: 'gym',
    patterns: [
      'PURE GYM', 'DAVID LLOYD', 'THE GYM', 'VIRGIN ACTIVE',
      'NUFFIELD', 'ANYTIME FITNESS', 'PELOTON', 'FIIT', 'STRAVA',
    ],
  },
];

function getMerchantType(merchant: string): string {
  const upper = merchant.toUpperCase();
  for (const { type, patterns } of MERCHANT_TYPE_PATTERNS) {
    for (const p of patterns) {
      if (upper.includes(p)) return type;
    }
  }
  return 'default';
}

function generateSuggestion(merchant: string, monthlyAmount: number, months: number): {
  suggestion: string;
  estimatedSaving: string;
} {
  const type = getMerchantType(merchant);
  const monthlyGBP = formatGBP(monthlyAmount);

  switch (type) {
    case 'phone_broadband':
      return {
        suggestion: 'Call retentions team or check Uswitch — loyalty deals are always worse than new-customer offers.',
        estimatedSaving: 'Typical saving: £10-20/month',
      };
    case 'insurance':
      return {
        suggestion: 'Get comparison quotes — loyalty tax is real. Same cover is often 20-40% cheaper elsewhere.',
        estimatedSaving: 'Typical saving: £15-30/month',
      };
    case 'streaming':
      return {
        suggestion: `Worth ${monthlyGBP}/month to you? Free alternatives exist (Freeview, BBC iPlayer, YouTube).`,
        estimatedSaving: `Cancel to save ${monthlyGBP}/month`,
      };
    case 'gym':
      return {
        suggestion: 'Using it regularly? If not, cancel. Outdoor exercise is free.',
        estimatedSaving: `Cancel to save ${monthlyGBP}/month`,
      };
    default:
      return {
        suggestion: `Been paying ${monthlyGBP}/month for ${months} months. Still needed?`,
        estimatedSaving: `Review to potentially save ${monthlyGBP}/month`,
      };
  }
}

/**
 * Normalise merchant name for grouping.
 * Strips reference numbers, country codes, and normalises whitespace.
 */
function normaliseMerchant(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[*·]/g, ' ');
  s = s.replace(/\+(\s|$)/g, ' plus ');
  s = s.replace(/\s+(?:GB|GBR|UK|US|USA|IE|AU|CA)(?:\s|$).*/i, '');
  s = s.replace(/\s*\.\s*(?:com|co\.uk|net|org|io).*$/i, '');
  s = s.replace(/\s+(?:LTD|PLC|INC|LLC|CORP|CO|LIMITED|GROUP)\.?(?:\s|$).*/i, '');
  s = s.replace(/\s+[A-F0-9]{6,}\s*$/i, '');
  s = s.replace(/\s+\d{4,}\s*$/g, '');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s || raw.toLowerCase().trim();
}

/**
 * Detect merchants with consistent monthly charges over 12+ months — likely
 * contracts that may be up for renegotiation.
 *
 * Returns alerts sorted by totalPaid descending (biggest contracts first).
 */
export function detectContractAlerts(transactions: Transaction[]): ContractAlert[] {
  // Only look at outflows
  const outflows = transactions.filter(
    (t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)
  );

  // Group by normalised merchant → month → amounts
  const merchantData = new Map<string, {
    displayName: string;
    months: Map<string, number[]>;  // YYYY-MM → amounts in pence (absolute)
  }>();

  for (const t of outflows) {
    const raw = (t.merchantName || t.description).slice(0, 60);
    const key = normaliseMerchant(raw);
    if (!merchantData.has(key)) {
      merchantData.set(key, { displayName: raw.trim(), months: new Map() });
    }
    const data = merchantData.get(key)!;
    // Keep the shortest display name (usually cleaner)
    if (raw.trim().length < data.displayName.length) {
      data.displayName = raw.trim();
    }
    const month = t.date.slice(0, 7);
    if (!data.months.has(month)) data.months.set(month, []);
    data.months.get(month)!.push(Math.abs(t.amount));
  }

  const alerts: ContractAlert[] = [];

  for (const [, data] of merchantData) {
    const monthKeys = Array.from(data.months.keys()).sort();
    if (monthKeys.length < 12) continue;

    // Take the last 12 months of data
    const last12 = monthKeys.slice(-12);

    // Count how many of the last 12 calendar months have charges
    const monthsWithCharges = last12.length;
    if (monthsWithCharges < 10) continue; // need at least 10 of 12

    // Compute per-month totals
    const monthlyTotals: number[] = [];
    for (const m of last12) {
      const amounts = data.months.get(m)!;
      monthlyTotals.push(amounts.reduce((s, a) => s + a, 0));
    }

    // Check consistency: each month's total within 10% of the average
    const avgMonthly = Math.round(monthlyTotals.reduce((s, a) => s + a, 0) / monthlyTotals.length);
    if (avgMonthly < 100) continue; // skip trivial amounts (< £1)

    const consistentCount = monthlyTotals.filter(
      (total) => Math.abs(total - avgMonthly) <= avgMonthly * 0.10
    ).length;

    // At least 8 of the months should be within 10% of the average
    if (consistentCount < 8) continue;

    // Get date range from all months (not just last 12)
    const allDates = Array.from(data.months.keys()).sort();
    const firstMonth = allDates[0];
    const lastMonth = allDates[allDates.length - 1];

    // Total paid across ALL months
    let totalPaid = 0;
    for (const [, amounts] of data.months) {
      totalPaid += amounts.reduce((s, a) => s + a, 0);
    }

    const { suggestion, estimatedSaving } = generateSuggestion(
      data.displayName,
      avgMonthly,
      monthKeys.length
    );

    alerts.push({
      merchant: data.displayName,
      monthlyAmount: avgMonthly,
      months: monthKeys.length,
      totalPaid,
      suggestion,
      estimatedSaving,
      firstSeen: `${firstMonth}-01`,
      lastSeen: `${lastMonth}-01`,
    });
  }

  return alerts.sort((a, b) => b.totalPaid - a.totalPaid);
}
