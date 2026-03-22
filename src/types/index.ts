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

// 'all' = all time; 'cycle-YYYY-MM' = salary cycle starting on 26th of that month
export type PeriodOption = string;

// ─── Account Hierarchy ──────────────────────────────────────────

export type AccountType = 'hub' | 'credit-card' | 'savings' | 'unknown';

export interface AccountConfig {
  rawName: string;       // matches Transaction.accountName
  type: AccountType;
  autoDetected: boolean; // true if inferred, false if user-set
}

// ─── Intelligence ───────────────────────────────────────────────

export interface SalaryFlow {
  cycleId: string;
  totalSalary: number;           // pence
  creditCardPayments: number;    // pence (hub → credit cards)
  savingsContributions: number;  // pence (hub → savings)
  directDebits: number;          // pence (D/D type from hub)
  directSpending: number;        // pence (other hub outflows excl transfers)
  creditCardSpending: number;    // pence (actual spending on credit cards)
  unaccounted: number;           // salary - sum of above
}

export interface CategoryCreep {
  category: string;
  currentCycleSpend: number;     // pence
  rollingAverage: number;        // pence (3-cycle rolling average)
  percentIncrease: number;       // e.g. 35.2 = +35.2% above rolling average
  trend: 'rising' | 'stable' | 'falling';
}

export interface HealthScorecard {
  cycleId: string;
  overallScore: number;          // 0-100
  verdict: 'Strong month' | 'Watch spending' | 'Danger zone';
  metrics: {
    savingsRate: number;
    savingsRateScore: number;    // 0-25
    essentialRatio: number;
    essentialScore: number;      // 0-25
    creepCount: number;
    creepScore: number;          // 0-25
    unaccountedPct: number;
    flowScore: number;           // 0-25
  };
  highlights: string[];          // 2-3 good things
  warnings: string[];            // 0-3 problem areas
}

export interface Recommendation {
  id: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  category?: string;
  merchant?: string;
  potentialSaving: number;       // pence per cycle
  actionType: 'reduce' | 'switch' | 'cancel' | 'review' | 'celebrate';
}

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
