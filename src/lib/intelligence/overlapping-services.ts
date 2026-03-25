import type { Transaction } from '@/types';
import { formatGBP } from './utils';

export interface OverlappingService {
  serviceType: string;         // "Streaming", "Insurance", "Gym", etc.
  services: {
    merchant: string;
    monthlyAmount: number;     // pence
    account: string;           // which account
  }[];
  totalMonthly: number;        // pence
  suggestion: string;          // "4 streaming services at £45/month total. Need all of them?"
}

const SERVICE_GROUPS: Record<string, string[]> = {
  'Streaming': [
    'NETFLIX', 'DISNEY', 'AMAZON PRIME', 'APPLE TV', 'NOW TV',
    'PARAMOUNT', 'HAYU', 'BRITBOX', 'DISCOVERY', 'CRUNCHYROLL',
    'YOUTUBE PREMIUM',
  ],
  'Music': [
    'SPOTIFY', 'APPLE MUSIC', 'TIDAL', 'DEEZER', 'AMAZON MUSIC',
    'YOUTUBE MUSIC',
  ],
  'Gym / Fitness': [
    'PURE GYM', 'DAVID LLOYD', 'THE GYM', 'VIRGIN ACTIVE',
    'NUFFIELD', 'ANYTIME FITNESS', 'PELOTON', 'FIIT', 'STRAVA',
  ],
  'Insurance': [
    'AVIVA', 'DIRECT LINE', 'ADMIRAL', 'MORE THAN', 'CHURCHILL',
    'HASTINGS', 'AA INSURANCE', 'RAC',
  ],
  'News / Media': [
    'THE TIMES', 'TELEGRAPH', 'GUARDIAN', 'ECONOMIST', 'FT.COM',
    'AUDIBLE', 'KINDLE',
  ],
  'Cloud Storage': [
    'ICLOUD', 'GOOGLE ONE', 'DROPBOX', 'ONEDRIVE',
  ],
  'Food Delivery': [
    'DELIVEROO', 'UBER EATS', 'JUST EAT',
  ],
};

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

/**
 * Detect when the household pays for multiple services in the same category.
 * Only flags when 2+ services in the same group are found active
 * (charged within last 2 months).
 */
export function detectOverlappingServices(transactions: Transaction[]): OverlappingService[] {
  // Determine the "recent" cutoff — last 2 calendar months
  const dates = transactions.map((t) => t.date).sort();
  if (dates.length === 0) return [];

  const latestDate = dates[dates.length - 1];
  const latestMonth = latestDate.slice(0, 7); // YYYY-MM
  const [y, m] = latestMonth.split('-').map(Number);
  // Go back 2 months from latest transaction
  const cutoffDate = new Date(y, m - 3, 1); // 2 months before the month of latest
  const cutoffISO = cutoffDate.toISOString().slice(0, 10);

  // Only consider recent outflows
  const recentOutflows = transactions.filter(
    (t) => t.amount < 0 && t.date >= cutoffISO && !INTERNAL_CATEGORIES.has(t.category)
  );

  const results: OverlappingService[] = [];

  for (const [serviceType, patterns] of Object.entries(SERVICE_GROUPS)) {
    // For each pattern, find matching transactions and compute monthly average
    const activeServices: {
      merchant: string;
      monthlyAmount: number;
      account: string;
    }[] = [];

    for (const pattern of patterns) {
      // Find all recent transactions matching this pattern
      const matching = recentOutflows.filter((t) => {
        const desc = (t.rawDescription || t.description).toUpperCase();
        const merchant = (t.merchantName || t.description).toUpperCase();
        return desc.includes(pattern) || merchant.includes(pattern);
      });

      if (matching.length === 0) continue;

      // Group by account
      const byAccount = new Map<string, number[]>();
      for (const t of matching) {
        const account = t.accountName || t.source || 'Unknown';
        if (!byAccount.has(account)) byAccount.set(account, []);
        byAccount.get(account)!.push(Math.abs(t.amount));
      }

      for (const [account, amounts] of byAccount) {
        // Compute monthly average — if multiple charges in the window, average them
        const months = new Set(matching
          .filter((t) => (t.accountName || t.source || 'Unknown') === account)
          .map((t) => t.date.slice(0, 7))
        );
        const totalAmount = amounts.reduce((s, a) => s + a, 0);
        const monthlyAmount = Math.round(totalAmount / Math.max(months.size, 1));

        activeServices.push({
          merchant: pattern,
          monthlyAmount,
          account,
        });
      }
    }

    // Only flag if 2+ distinct services in this group
    // Dedupe by pattern (same service on multiple accounts counts as 1 service)
    const uniqueServices = new Map<string, typeof activeServices[0]>();
    for (const svc of activeServices) {
      const key = svc.merchant;
      if (!uniqueServices.has(key) || svc.monthlyAmount > uniqueServices.get(key)!.monthlyAmount) {
        uniqueServices.set(key, svc);
      }
    }

    if (uniqueServices.size < 2) continue;

    const services = Array.from(uniqueServices.values());
    const totalMonthly = services.reduce((s, svc) => s + svc.monthlyAmount, 0);

    const count = services.length;
    const suggestion = `${count} ${serviceType.toLowerCase()} services at ${formatGBP(totalMonthly)}/month total. Need all of them?`;

    results.push({
      serviceType,
      services,
      totalMonthly,
      suggestion,
    });
  }

  return results.sort((a, b) => b.totalMonthly - a.totalMonthly);
}
