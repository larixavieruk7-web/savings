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
  category?: string;           // most common category for this merchant
  isEssential: boolean;        // true for mortgage, loan, utilities, etc.
  essentialAdvice?: string;    // contextual advice for essential items
  recentTransactions: {        // last 3 months for evidence display
    date: string;
    description: string;
    amount: number;
    account: string;
  }[];
}

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

// Categories that are essential commitments — never flag as "still needed?"
const ESSENTIAL_CATEGORIES = new Set([
  'Housing', 'Rent / Mortgage', 'Debt Repayments', 'Utilities',
]);

// Categories where the advice should be "check for better rates" not "cancel"
const RATE_CHECK_CATEGORIES: Record<string, string> = {
  'Housing': 'Could you remortgage for a better rate? Check if rates have changed since you fixed.',
  'Rent / Mortgage': 'Could you remortgage for a better rate? Check if rates have changed since you fixed.',
  'Debt Repayments': 'What\'s the remaining term? Check if overpaying or switching lender could save on interest.',
  'Utilities': 'Are you on the best tariff? Compare on Ofgem-accredited sites like Uswitch or Compare the Market.',
  'Insurance': 'When does this renew? Get comparison quotes 3 weeks before renewal to avoid loyalty tax.',
};

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
  {
    type: 'mortgage',
    patterns: [
      'NATIONWIDE', 'HALIFAX', 'SANTANDER MORTG', 'NATWEST MORTG',
      'BARCLAYS MORTG', 'HSBC MORTG', 'LLOYDS MORTG',
    ],
  },
  {
    type: 'loan',
    patterns: [
      'NATWEST LOAN', 'BARCLAYS LOAN', 'HSBC LOAN', 'LLOYDS LOAN',
      'SANTANDER LOAN', 'TESCO LOAN', 'ZOPA', 'FUNDING CIRCLE',
    ],
  },
  {
    type: 'energy',
    patterns: [
      'OCTOPUS ENERGY', 'BRITISH GAS', 'EDF', 'SSE', 'SCOTTISH POWER',
      'E.ON', 'EON', 'OVO ENERGY', 'BULB', 'SHELL ENERGY',
      'UTILITY WAREHOUSE',
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

function generateSuggestion(
  merchant: string,
  monthlyAmount: number,
  months: number,
  category: string | undefined,
  isEssential: boolean,
): {
  suggestion: string;
  estimatedSaving: string;
  essentialAdvice?: string;
} {
  const type = getMerchantType(merchant);
  const monthlyGBP = formatGBP(monthlyAmount);

  // Essential items get different messaging
  if (isEssential && category) {
    const advice = RATE_CHECK_CATEGORIES[category];
    if (advice) {
      return {
        suggestion: advice,
        estimatedSaving: 'Check for better rates',
        essentialAdvice: advice,
      };
    }
  }

  // Merchant-type-specific suggestions for known types
  if (type === 'mortgage') {
    return {
      suggestion: 'Could you remortgage for a better rate? Check if rates have changed since you fixed.',
      estimatedSaving: 'Check for better rates',
      essentialAdvice: 'Could you remortgage for a better rate? Check if rates have changed since you fixed.',
    };
  }
  if (type === 'loan') {
    return {
      suggestion: 'What\'s the remaining term? Check if overpaying or switching lender could save on interest.',
      estimatedSaving: 'Check overpayment options',
      essentialAdvice: 'What\'s the remaining term? Check if overpaying or switching lender could save on interest.',
    };
  }
  if (type === 'energy') {
    return {
      suggestion: 'Are you on the best tariff? Compare on Ofgem-accredited sites like Uswitch.',
      estimatedSaving: 'Typical saving: £10-30/month',
      essentialAdvice: 'Are you on the best tariff? Compare on Ofgem-accredited sites like Uswitch.',
    };
  }

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
        essentialAdvice: 'When does this renew? Get comparison quotes 3 weeks before to avoid loyalty tax.',
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
 * Now category-aware: mortgages, loans, and utilities get different messaging
 * instead of "still needed?" because obviously they're still needed.
 *
 * Returns alerts sorted by totalPaid descending (biggest contracts first).
 */
export function detectContractAlerts(
  transactions: Transaction[],
  essentialMerchants: string[] = [],
): ContractAlert[] {
  // Only look at outflows
  const outflows = transactions.filter(
    (t) => t.amount < 0 && !INTERNAL_CATEGORIES.has(t.category)
  );

  // Group by normalised merchant → month → amounts + track categories and transactions
  const merchantData = new Map<string, {
    displayName: string;
    months: Map<string, number[]>;  // YYYY-MM → amounts in pence (absolute)
    categories: Map<string, number>; // category → count
    transactions: Transaction[];
  }>();

  for (const t of outflows) {
    const raw = (t.merchantName || t.description).slice(0, 60);
    const key = normaliseMerchant(raw);
    if (!merchantData.has(key)) {
      merchantData.set(key, { displayName: raw.trim(), months: new Map(), categories: new Map(), transactions: [] });
    }
    const data = merchantData.get(key)!;
    // Keep the shortest display name (usually cleaner)
    if (raw.trim().length < data.displayName.length) {
      data.displayName = raw.trim();
    }
    const month = t.date.slice(0, 7);
    if (!data.months.has(month)) data.months.set(month, []);
    data.months.get(month)!.push(Math.abs(t.amount));

    // Track categories
    data.categories.set(t.category, (data.categories.get(t.category) || 0) + 1);
    data.transactions.push(t);
  }

  const essentialSet = new Set(essentialMerchants.map((m) => m.toLowerCase().trim()));
  const alerts: ContractAlert[] = [];

  for (const [key, data] of merchantData) {
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

    // Determine the most common category for this merchant
    let topCategory: string | undefined;
    let maxCount = 0;
    for (const [cat, count] of data.categories) {
      if (count > maxCount) {
        maxCount = count;
        topCategory = cat;
      }
    }

    // Determine if essential: by category, by merchant type, or by user marking
    const merchantType = getMerchantType(data.displayName);
    const isEssentialByCategory = topCategory ? ESSENTIAL_CATEGORIES.has(topCategory) : false;
    const isEssentialByType = ['mortgage', 'loan', 'energy'].includes(merchantType);
    const isEssentialByUser = essentialSet.has(key);
    const isEssential = isEssentialByCategory || isEssentialByType || isEssentialByUser;

    const { suggestion, estimatedSaving, essentialAdvice } = generateSuggestion(
      data.displayName,
      avgMonthly,
      monthKeys.length,
      topCategory,
      isEssential,
    );

    // Get recent transactions for evidence (last 3 months)
    const recentMonths = monthKeys.slice(-3);
    const recentTransactions = data.transactions
      .filter((t) => recentMonths.some((m) => t.date.startsWith(m)))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((t) => ({
        date: t.date,
        description: t.merchantName || t.description,
        amount: Math.abs(t.amount),
        account: t.accountName || t.source || 'Unknown',
      }));

    alerts.push({
      merchant: data.displayName,
      monthlyAmount: avgMonthly,
      months: monthKeys.length,
      totalPaid,
      suggestion,
      estimatedSaving,
      firstSeen: `${firstMonth}-01`,
      lastSeen: `${lastMonth}-01`,
      category: topCategory,
      isEssential,
      essentialAdvice,
      recentTransactions,
    });
  }

  return alerts.sort((a, b) => b.totalPaid - a.totalPaid);
}
