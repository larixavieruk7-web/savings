export interface Transaction {
  id: string;
  date: string; // ISO 8601
  type: string; // e.g., "DEB", "D/D", "TFR", "BGC"
  description: string;
  rawDescription: string;
  amount: number; // in pence, negative = outflow
  balance: number; // in pence
  category: string;
  subcategory?: string;
  merchantName?: string;
  isRecurring: boolean;
  isEssential?: boolean; // true = need, false = want
  accountName?: string;
  source?: 'natwest' | 'amex' | 'universal'; // which parser was used
  categorySource?: 'rule' | 'ai' | 'manual'; // how category was assigned
  userNote?: string; // e.g., "Health Express = Mounjaro for Larissa"
}

export interface CategoryRule {
  pattern: string;
  category: string;
  subcategory?: string;
  isEssential?: boolean;
  source: 'manual' | 'ai' | 'system';
  note?: string; // user explanation
}

export interface SavingsTarget {
  id: string;
  month: string; // YYYY-MM
  targetAmount: number; // pence
  description?: string;
}

export interface KnowledgeEntry {
  id: string;
  date: string; // ISO date
  title: string;
  description: string;
  tags?: string[]; // e.g., ['larissa', 'travel', 'barcelona']
  type: 'event' | 'context' | 'goal' | 'note';
  createdAt: string;
}

export interface Insight {
  id: string;
  type: 'spending' | 'anomaly' | 'saving' | 'trend' | 'recurring';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'alert';
  data?: Record<string, unknown>;
  periodStart?: string;
  periodEnd?: string;
}

export interface MonthlyBreakdown {
  month: string; // YYYY-MM
  income: number; // pence
  spending: number; // pence
  net: number; // pence
  essentialSpend: number; // pence
  discretionarySpend: number; // pence
  byCategory: Record<string, number>;
}

export type PeriodOption = 'last30' | 'last90' | 'last6m' | 'last12m' | 'all';

export type CategoryName =
  | 'Housing'
  | 'Rent / Mortgage'
  | 'Groceries'
  | 'Dining Out'
  | 'Transport'
  | 'Subscriptions'
  | 'Shopping'
  | 'Entertainment'
  | 'Health & Fitness'
  | 'Healthcare'
  | 'Utilities'
  | 'Phone & Internet'
  | 'Insurance'
  | 'Personal Care'
  | 'Education'
  | 'Childcare & Education'
  | 'Gifts & Donations'
  | 'Charity'
  | 'Travel & Holidays'
  | 'Holidays & Travel'
  | 'Drinks & Nights Out'
  | 'Cash Withdrawals'
  | 'Transfers'
  | 'Savings & Investments'
  | 'Debt Repayments'
  | 'Bank Charges'
  | 'Income'
  | 'Salary'
  | 'Benefits'
  | 'Refunds'
  | 'Other Income'
  | 'Other';
