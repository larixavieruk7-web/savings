import type { CategoryName, CategoryRule } from '@/types';

/** Default UK category rules — keyword patterns for NatWest transactions */
export const DEFAULT_RULES: CategoryRule[] = [
  // Groceries
  { pattern: 'TESCO', category: 'Groceries', source: 'system' },
  { pattern: 'SAINSBURY', category: 'Groceries', source: 'system' },
  { pattern: 'ASDA', category: 'Groceries', source: 'system' },
  { pattern: 'ALDI', category: 'Groceries', source: 'system' },
  { pattern: 'LIDL', category: 'Groceries', source: 'system' },
  { pattern: 'WAITROSE', category: 'Groceries', source: 'system' },
  { pattern: 'M&S FOOD', category: 'Groceries', source: 'system' },
  { pattern: 'MORRISONS', category: 'Groceries', source: 'system' },
  { pattern: 'CO-OP', category: 'Groceries', source: 'system' },
  { pattern: 'ICELAND', category: 'Groceries', source: 'system' },
  { pattern: 'OCADO', category: 'Groceries', source: 'system' },

  // Dining Out
  { pattern: 'DELIVEROO', category: 'Dining Out', source: 'system' },
  { pattern: 'JUST EAT', category: 'Dining Out', source: 'system' },
  { pattern: 'UBER EATS', category: 'Dining Out', source: 'system' },
  { pattern: 'NANDOS', category: 'Dining Out', source: 'system' },
  { pattern: 'GREGGS', category: 'Dining Out', source: 'system' },
  { pattern: 'COSTA', category: 'Dining Out', source: 'system' },
  { pattern: 'STARBUCKS', category: 'Dining Out', source: 'system' },
  { pattern: 'PRET A MANGER', category: 'Dining Out', source: 'system' },
  { pattern: 'MCDONALDS', category: 'Dining Out', source: 'system' },
  { pattern: 'KFC', category: 'Dining Out', source: 'system' },
  { pattern: 'PIZZA', category: 'Dining Out', source: 'system' },
  { pattern: 'RESTAURANT', category: 'Dining Out', source: 'system' },

  // Transport
  { pattern: 'TFL', category: 'Transport', source: 'system' },
  { pattern: 'UBER ', category: 'Transport', source: 'system' },
  { pattern: 'TRAINLINE', category: 'Transport', source: 'system' },
  { pattern: 'NATIONAL RAIL', category: 'Transport', source: 'system' },
  { pattern: 'BOLT', category: 'Transport', source: 'system' },

  // Fuel
  { pattern: 'SHELL', category: 'Transport', subcategory: 'Fuel', source: 'system' },
  { pattern: 'BP ', category: 'Transport', subcategory: 'Fuel', source: 'system' },
  { pattern: 'ESSO', category: 'Transport', subcategory: 'Fuel', source: 'system' },
  { pattern: 'TEXACO', category: 'Transport', subcategory: 'Fuel', source: 'system' },

  // Subscriptions
  { pattern: 'NETFLIX', category: 'Subscriptions', source: 'system' },
  { pattern: 'SPOTIFY', category: 'Subscriptions', source: 'system' },
  { pattern: 'AMAZON PRIME', category: 'Subscriptions', source: 'system' },
  { pattern: 'DISNEY+', category: 'Subscriptions', source: 'system' },
  { pattern: 'DISNEY PLUS', category: 'Subscriptions', source: 'system' },
  { pattern: 'APPLE.COM/BILL', category: 'Subscriptions', source: 'system' },
  { pattern: 'GOOGLE STORAGE', category: 'Subscriptions', source: 'system' },
  { pattern: 'NOW TV', category: 'Subscriptions', source: 'system' },
  { pattern: 'SKY DIGITAL', category: 'Subscriptions', source: 'system' },
  { pattern: 'GYM', category: 'Health & Fitness', source: 'system' },
  { pattern: 'PURE GYM', category: 'Health & Fitness', source: 'system' },

  // Shopping
  { pattern: 'AMAZON', category: 'Shopping', source: 'system' },
  { pattern: 'AMZN', category: 'Shopping', source: 'system' },
  { pattern: 'EBAY', category: 'Shopping', source: 'system' },
  { pattern: 'JOHN LEWIS', category: 'Shopping', source: 'system' },
  { pattern: 'ARGOS', category: 'Shopping', source: 'system' },
  { pattern: 'IKEA', category: 'Shopping', source: 'system' },
  { pattern: 'PRIMARK', category: 'Shopping', source: 'system' },
  { pattern: 'NEXT ', category: 'Shopping', source: 'system' },
  { pattern: 'ASOS', category: 'Shopping', source: 'system' },
  { pattern: 'ZARA', category: 'Shopping', source: 'system' },
  { pattern: 'H&M', category: 'Shopping', source: 'system' },

  // Utilities
  { pattern: 'BRITISH GAS', category: 'Utilities', source: 'system' },
  { pattern: 'EDF ENERGY', category: 'Utilities', source: 'system' },
  { pattern: 'OCTOPUS ENERGY', category: 'Utilities', source: 'system' },
  { pattern: 'THAMES WATER', category: 'Utilities', source: 'system' },
  { pattern: 'COUNCIL TAX', category: 'Utilities', source: 'system' },
  { pattern: 'BT GROUP', category: 'Utilities', source: 'system' },
  { pattern: 'VIRGIN MEDIA', category: 'Utilities', source: 'system' },
  { pattern: 'THREE', category: 'Utilities', source: 'system' },
  { pattern: 'VODAFONE', category: 'Utilities', source: 'system' },
  { pattern: 'O2 ', category: 'Utilities', source: 'system' },
  { pattern: 'EE ', category: 'Utilities', source: 'system' },

  // Housing
  { pattern: 'MORTGAGE', category: 'Housing', source: 'system' },
  { pattern: 'RENT', category: 'Housing', source: 'system' },
  { pattern: 'NATWEST MORTGAGE', category: 'Housing', source: 'system' },

  // Insurance
  { pattern: 'INSURANCE', category: 'Insurance', source: 'system' },
  { pattern: 'AVIVA', category: 'Insurance', source: 'system' },
  { pattern: 'ADMIRAL', category: 'Insurance', source: 'system' },
  { pattern: 'DIRECT LINE', category: 'Insurance', source: 'system' },

  // Cash
  { pattern: 'ATM', category: 'Cash Withdrawals', source: 'system' },
  { pattern: 'CASH', category: 'Cash Withdrawals', source: 'system' },

  // Entertainment
  { pattern: 'CINEMA', category: 'Entertainment', source: 'system' },
  { pattern: 'ODEON', category: 'Entertainment', source: 'system' },
  { pattern: 'VUE', category: 'Entertainment', source: 'system' },
  { pattern: 'CINEWORLD', category: 'Entertainment', source: 'system' },
  { pattern: 'TICKETMASTER', category: 'Entertainment', source: 'system' },
];

/** Category colors for charts */
export const CATEGORY_COLORS: Record<CategoryName, string> = {
  'Housing': '#6366f1',
  'Groceries': '#22c55e',
  'Dining Out': '#f97316',
  'Transport': '#3b82f6',
  'Subscriptions': '#8b5cf6',
  'Shopping': '#ec4899',
  'Entertainment': '#f59e0b',
  'Health & Fitness': '#10b981',
  'Utilities': '#64748b',
  'Insurance': '#06b6d4',
  'Personal Care': '#d946ef',
  'Education': '#0ea5e9',
  'Gifts & Donations': '#f43f5e',
  'Travel & Holidays': '#14b8a6',
  'Cash Withdrawals': '#78716c',
  'Transfers': '#94a3b8',
  'Income': '#16a34a',
  'Other': '#a1a1aa',
};

/** Categorize a transaction description using rules */
export function categorize(
  description: string,
  customRules: CategoryRule[] = []
): { category: string; subcategory?: string } {
  const upper = description.toUpperCase();

  // Check custom/user rules first (higher priority)
  for (const rule of customRules) {
    if (upper.includes(rule.pattern.toUpperCase())) {
      return { category: rule.category, subcategory: rule.subcategory };
    }
  }

  // Check default system rules
  for (const rule of DEFAULT_RULES) {
    if (upper.includes(rule.pattern.toUpperCase())) {
      return { category: rule.category, subcategory: rule.subcategory };
    }
  }

  return { category: 'Other' };
}
