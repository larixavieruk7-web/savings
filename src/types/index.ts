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
  accountName?: string;
}

export interface CategoryRule {
  pattern: string;
  category: string;
  subcategory?: string;
  source: 'manual' | 'ai' | 'system';
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
  byCategory: Record<string, number>;
}

export type CategoryName =
  | 'Housing'
  | 'Groceries'
  | 'Dining Out'
  | 'Transport'
  | 'Subscriptions'
  | 'Shopping'
  | 'Entertainment'
  | 'Health & Fitness'
  | 'Utilities'
  | 'Insurance'
  | 'Personal Care'
  | 'Education'
  | 'Gifts & Donations'
  | 'Travel & Holidays'
  | 'Cash Withdrawals'
  | 'Transfers'
  | 'Income'
  | 'Other';
