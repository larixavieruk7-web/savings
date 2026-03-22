import type { Transaction } from '@/types';

export interface ConveniencePremium {
  merchant: string;
  category: string;
  totalSpend: number;        // pence in current period
  transactionCount: number;
  premiumType: 'delivery' | 'convenience-store' | 'coffee-shop' | 'ride-hail';
}

// UK-specific convenience merchants
const CONVENIENCE_MERCHANTS: { pattern: string; type: ConveniencePremium['premiumType'] }[] = [
  // Food delivery — paying for speed/convenience
  { pattern: 'DELIVEROO', type: 'delivery' },
  { pattern: 'JUST EAT', type: 'delivery' },
  { pattern: 'UBER EATS', type: 'delivery' },
  { pattern: 'UBEREATS', type: 'delivery' },

  // Ride hailing — premium over public transport
  { pattern: 'UBER ', type: 'ride-hail' },
  { pattern: 'BOLT', type: 'ride-hail' },
  { pattern: 'FREE NOW', type: 'ride-hail' },

  // Coffee shops — daily habit premium
  { pattern: 'COSTA', type: 'coffee-shop' },
  { pattern: 'STARBUCKS', type: 'coffee-shop' },
  { pattern: 'PRET A MANGER', type: 'coffee-shop' },
  { pattern: 'PRET ', type: 'coffee-shop' },
  { pattern: 'CAFFE NERO', type: 'coffee-shop' },
  { pattern: 'GREGGS', type: 'coffee-shop' },

  // Convenience stores — premium pricing vs supermarket
  { pattern: 'TESCO EXPRESS', type: 'convenience-store' },
  { pattern: 'TESCO METRO', type: 'convenience-store' },
  { pattern: 'SAINSBURY LOCAL', type: 'convenience-store' },
  { pattern: 'CO-OP', type: 'convenience-store' },
  { pattern: 'SPAR ', type: 'convenience-store' },
  { pattern: 'LONDIS', type: 'convenience-store' },
  { pattern: 'MCCOLL', type: 'convenience-store' },
  { pattern: 'ONE STOP', type: 'convenience-store' },
];

const INTERNAL_CATEGORIES = new Set([
  'Transfers', 'Savings & Investments', 'Income', 'Salary',
  'Benefits', 'Refunds', 'Other Income',
]);

/**
 * Detect and aggregate "convenience premium" spending.
 * These are merchants where you pay extra for speed/convenience
 * versus cheaper alternatives (cooking vs delivery, bus vs Uber, etc.)
 */
export function detectConveniencePremiums(
  transactions: Transaction[]
): { items: ConveniencePremium[]; totalPremium: number } {
  const map = new Map<string, ConveniencePremium>();

  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (INTERNAL_CATEGORIES.has(t.category)) continue;

    const desc = (t.rawDescription || t.description).toUpperCase();
    const merchant = (t.merchantName || t.description).toUpperCase();

    for (const { pattern, type } of CONVENIENCE_MERCHANTS) {
      if (desc.includes(pattern) || merchant.includes(pattern)) {
        const key = `${pattern}|${type}`;
        const existing = map.get(key);
        if (existing) {
          existing.totalSpend += Math.abs(t.amount);
          existing.transactionCount++;
        } else {
          map.set(key, {
            merchant: pattern.trim(),
            category: t.category,
            totalSpend: Math.abs(t.amount),
            transactionCount: 1,
            premiumType: type,
          });
        }
        break; // Only match first pattern per transaction
      }
    }
  }

  const items = Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  const totalPremium = items.reduce((s, i) => s + i.totalSpend, 0);

  return { items, totalPremium };
}
