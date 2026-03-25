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
  { pattern: 'YOURCASH', category: 'Cash Withdrawals', source: 'system' },
  { pattern: 'ROYAL BANK', category: 'Cash Withdrawals', source: 'system' },

  // Entertainment
  { pattern: 'CINEMA', category: 'Entertainment', source: 'system' },
  { pattern: 'ODEON', category: 'Entertainment', source: 'system' },
  { pattern: 'VUE', category: 'Entertainment', source: 'system' },
  { pattern: 'CINEWORLD', category: 'Entertainment', source: 'system' },
  { pattern: 'TICKETMASTER', category: 'Entertainment', source: 'system' },

  // ─── NatWest-specific patterns (from Larissa & Gus's actual data) ───

  // Transfers between own accounts (DPC type)
  { pattern: 'To A/C', category: 'Transfers', source: 'system' },
  { pattern: 'From A/C', category: 'Transfers', source: 'system' },
  { pattern: 'Via Mobile Xfer', category: 'Transfers', source: 'system' },
  { pattern: 'ROUND UP FROM', category: 'Savings & Investments', source: 'system' },

  // Credit card payments (internal transfers — not real income/spending)
  // NatWest shows Amex payments under several description variants — all must be Transfers
  { pattern: 'AMERICAN EXP', category: 'Transfers', source: 'system' },
  { pattern: 'AMEX', category: 'Transfers', source: 'system' },
  { pattern: 'PAYMENT RECEIVED - THANK YOU', category: 'Transfers', source: 'system' },

  // JPMC salary (Larissa & Gus — both paid via 3305 JPMCB BAC)
  { pattern: '3305 JPMCB', category: 'Salary', source: 'system' },

  // Interest
  { pattern: 'INTER BON', category: 'Income', source: 'system' },

  // Bank charges / fees
  { pattern: 'NON-STERLING TRANSACTION', category: 'Bank Charges', source: 'system' },

  // Gus → Larissa transfer (covers NatWest loan — NOT salary)
  { pattern: 'XAVIER DA SILVA G', category: 'Transfers', source: 'system' },

  // Rewards
  { pattern: 'MYREWARDS', category: 'Income', source: 'system' },

  // Loans & Debt
  { pattern: 'NATWEST LOAN', category: 'Debt Repayments', source: 'system' },

  // Mortgage (Nationwide Building Society)
  { pattern: 'NATIONWIDE B S', category: 'Rent / Mortgage', source: 'system' },

  // Utilities (from D/D patterns)
  { pattern: 'OCTOPUS ENERGY', category: 'Utilities', source: 'system' },
  { pattern: 'BRISTOLWESSEXWATER', category: 'Utilities', source: 'system' },
  { pattern: 'SOUTH WEST WATER', category: 'Utilities', source: 'system' },
  { pattern: 'BCP COUNCIL', category: 'Utilities', source: 'system' },
  { pattern: 'CTAX', category: 'Utilities', source: 'system' },

  // Insurance
  { pattern: 'L&G INSURANCE', category: 'Insurance', source: 'system' },

  // Transport / Car
  { pattern: 'DVLA', category: 'Transport', source: 'system' },

  // PayPal (common in POS type)
  { pattern: 'PAYPAL', category: 'Shopping', source: 'system' },

  // Faster payments received
  { pattern: 'FASTER PAYMENT RECEIVED', category: 'Income', source: 'system' },
];

/** Category colors for charts — includes both rule-based and AI categories */
export const CATEGORY_COLORS: Record<string, string> = {
  // Core categories
  'Housing': '#6366f1',
  'Rent / Mortgage': '#6366f1',
  'Groceries': '#22c55e',
  'Dining Out': '#f97316',
  'Transport': '#3b82f6',
  'Subscriptions': '#8b5cf6',
  'Shopping': '#ec4899',
  'Entertainment': '#f59e0b',
  'Health & Fitness': '#10b981',
  'Healthcare': '#10b981',
  'Utilities': '#64748b',
  'Phone & Internet': '#64748b',
  'Insurance': '#06b6d4',
  'Personal Care': '#d946ef',
  'Education': '#0ea5e9',
  'Childcare & Education': '#0ea5e9',
  'Gifts & Donations': '#f43f5e',
  'Charity': '#f43f5e',
  'Travel & Holidays': '#14b8a6',
  'Holidays & Travel': '#14b8a6',
  'Drinks & Nights Out': '#fb923c',
  'Cash Withdrawals': '#78716c',
  'Transfers': '#94a3b8',
  'Savings & Investments': '#a3e635',
  'Debt Repayments': '#ef4444',
  'Bank Charges': '#71717a',
  // Income categories
  'Income': '#16a34a',
  'Salary': '#16a34a',
  'Benefits': '#22d3ee',
  'Refunds': '#34d399',
  'Other Income': '#86efac',
  'Other': '#a1a1aa',
};

// Categories where spending is essential (needs, not wants)
export const ESSENTIAL_CATEGORIES = new Set([
  'Groceries', 'Transport', 'Utilities', 'Housing', 'Rent / Mortgage',
  'Insurance', 'Phone & Internet', 'Healthcare', 'Childcare & Education',
  'Education', 'Debt Repayments',
]);

// Categories where spending is discretionary (wants, not needs)
export const DISCRETIONARY_CATEGORIES = new Set([
  'Dining Out', 'Subscriptions', 'Shopping', 'Entertainment',
  'Health & Fitness', 'Personal Care', 'Drinks & Nights Out',
  'Holidays & Travel', 'Travel & Holidays', 'Gifts & Donations',
  'Charity', 'Cash Withdrawals',
]);

/** Derive isEssential from category name */
export function isEssentialCategory(category: string): boolean | undefined {
  if (ESSENTIAL_CATEGORIES.has(category)) return true;
  if (DISCRETIONARY_CATEGORIES.has(category)) return false;
  return undefined; // neutral categories (Transfers, Savings, Income, Other)
}

/** Categorize a transaction description using rules */
export function categorize(
  description: string,
  customRules: CategoryRule[] = []
): { category: string; subcategory?: string; isEssential?: boolean } {
  const upper = description.toUpperCase();

  // Check custom/user rules first (higher priority)
  for (const rule of customRules) {
    if (upper.includes(rule.pattern.toUpperCase())) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        isEssential: rule.isEssential ?? isEssentialCategory(rule.category),
      };
    }
  }

  // Check default system rules
  for (const rule of DEFAULT_RULES) {
    if (upper.includes(rule.pattern.toUpperCase())) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        isEssential: rule.isEssential ?? isEssentialCategory(rule.category),
      };
    }
  }

  return { category: 'Other' };
}
