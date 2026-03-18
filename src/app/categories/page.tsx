'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { DEFAULT_RULES, CATEGORY_COLORS } from '@/lib/categories';
import {
  getCustomRules,
  addCustomRule,
  saveCustomRules,
  getTransactions,
  saveTransactions,
} from '@/lib/storage';
import type { CategoryRule, CategoryName } from '@/types';
import {
  Tags,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertCircle,
  Search,
} from 'lucide-react';

const ALL_CATEGORIES: CategoryName[] = [
  'Housing',
  'Rent / Mortgage',
  'Groceries',
  'Dining Out',
  'Transport',
  'Subscriptions',
  'Shopping',
  'Entertainment',
  'Health & Fitness',
  'Healthcare',
  'Utilities',
  'Phone & Internet',
  'Insurance',
  'Personal Care',
  'Education',
  'Childcare & Education',
  'Gifts & Donations',
  'Charity',
  'Travel & Holidays',
  'Holidays & Travel',
  'Drinks & Nights Out',
  'Cash Withdrawals',
  'Transfers',
  'Savings & Investments',
  'Debt Repayments',
  'Bank Charges',
  'Income',
  'Salary',
  'Benefits',
  'Refunds',
  'Other Income',
  'Other',
];

function CategoryDot({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] || '#a1a1aa';
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

export default function CategoriesPage() {
  const { transactions, reload } = useTransactionContext();
  const [customRules, setCustomRules] = useState<CategoryRule[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Add rule form state
  const [newPattern, setNewPattern] = useState('');
  const [newCategory, setNewCategory] = useState<string>('Other');
  const [newEssential, setNewEssential] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Collapsed state for system rule groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCustomRules(getCustomRules());
    setLoaded(true);
  }, []);

  // Group system rules by category
  const systemRulesByCategory = useMemo(() => {
    const groups: Record<string, CategoryRule[]> = {};
    for (const rule of DEFAULT_RULES) {
      if (!groups[rule.category]) groups[rule.category] = [];
      groups[rule.category].push(rule);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, []);

  // Count transactions matching a pattern
  const matchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const allRules = [...customRules, ...DEFAULT_RULES];
    for (const rule of allRules) {
      const upper = rule.pattern.toUpperCase();
      let count = 0;
      for (const t of transactions) {
        if (
          t.description.toUpperCase().includes(upper) ||
          t.merchantName?.toUpperCase().includes(upper)
        ) {
          count++;
        }
      }
      counts[rule.pattern] = count;
    }
    return counts;
  }, [transactions, customRules]);

  // Summary stats
  const totalSystemRules = DEFAULT_RULES.length;
  const totalCustomRules = customRules.length;
  const uncategorizedCount = useMemo(
    () => transactions.filter((t) => t.category === 'Other' && t.amount < 0).length,
    [transactions]
  );

  const handleAddRule = useCallback(() => {
    const trimmed = newPattern.trim();
    if (!trimmed) return;

    const rule: CategoryRule = {
      pattern: trimmed,
      category: newCategory,
      isEssential: newEssential,
      source: 'manual',
      note: newNote.trim() || undefined,
    };

    addCustomRule(rule);
    setCustomRules(getCustomRules());
    reload();

    // Reset form
    setNewPattern('');
    setNewCategory('Other');
    setNewEssential(false);
    setNewNote('');
  }, [newPattern, newCategory, newEssential, newNote, reload]);

  const handleDeleteRule = useCallback(
    (pattern: string) => {
      const updated = customRules.filter(
        (r) => r.pattern.toUpperCase() !== pattern.toUpperCase()
      );
      saveCustomRules(updated);
      setCustomRules(updated);

      // Re-categorize affected transactions back to defaults
      const allTransactions = getTransactions();
      const upperPattern = pattern.toUpperCase();
      let changed = false;
      for (const t of allTransactions) {
        if (
          t.categorySource === 'manual' &&
          (t.description.toUpperCase().includes(upperPattern) ||
            t.merchantName?.toUpperCase().includes(upperPattern))
        ) {
          // Reset to 'Other' — on next reload the system rules will re-apply via CSV import
          t.category = 'Other';
          t.subcategory = undefined;
          t.categorySource = 'rule';
          t.isEssential = undefined;
          t.userNote = undefined;
          changed = true;
        }
      }
      if (changed) {
        saveTransactions(allTransactions);
        reload();
      }
    },
    [customRules, reload]
  );

  const toggleGroup = useCallback((category: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // Filter system rules by search
  const filteredSystemRules = useMemo(() => {
    if (!searchFilter.trim()) return systemRulesByCategory;
    const upper = searchFilter.toUpperCase();
    return systemRulesByCategory
      .map(([cat, rules]) => {
        const filtered = rules.filter(
          (r) =>
            r.pattern.toUpperCase().includes(upper) ||
            r.category.toUpperCase().includes(upper)
        );
        return [cat, filtered] as [string, CategoryRule[]];
      })
      .filter(([, rules]) => rules.length > 0);
  }, [systemRulesByCategory, searchFilter]);

  const filteredCustomRules = useMemo(() => {
    if (!searchFilter.trim()) return customRules;
    const upper = searchFilter.toUpperCase();
    return customRules.filter(
      (r) =>
        r.pattern.toUpperCase().includes(upper) ||
        r.category.toUpperCase().includes(upper) ||
        r.note?.toUpperCase().includes(upper)
    );
  }, [customRules, searchFilter]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Tags className="h-6 w-6 text-accent" />
          Category Rules
        </h1>
        <p className="text-muted text-sm mt-1">
          Manage how transactions are categorized. Custom rules take priority over system rules.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-lg p-4">
          <p className="text-xs text-muted uppercase tracking-wider">System Rules</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totalSystemRules}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Custom Rules</p>
          <p className="text-2xl font-bold text-accent mt-1">{totalCustomRules}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Uncategorized</p>
          <p className={`text-2xl font-bold mt-1 ${uncategorizedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {uncategorizedCount}
          </p>
        </div>
      </div>

      {/* Add Rule Form */}
      <div className="bg-card border border-card-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-accent" />
          Add Custom Rule
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Pattern (matches description)</label>
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="e.g. HEALTH EXPRESS"
              className="w-full bg-background border border-card-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Category</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full bg-background border border-card-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Note (optional)</label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. Mounjaro prescription"
              className="w-full bg-background border border-card-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={newEssential}
                onChange={(e) => setNewEssential(e.target.checked)}
                className="rounded border-card-border bg-background accent-accent"
              />
              Essential
            </label>
            <button
              onClick={handleAddRule}
              disabled={!newPattern.trim()}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add Rule
            </button>
          </div>
        </div>
      </div>

      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search rules..."
          className="w-full bg-card border border-card-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Custom Rules Section */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-card-border bg-accent/5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" />
            Custom Rules
            <span className="text-xs text-muted font-normal">
              ({filteredCustomRules.length} rule{filteredCustomRules.length !== 1 ? 's' : ''})
            </span>
          </h2>
        </div>

        {filteredCustomRules.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted text-sm">
            {customRules.length === 0
              ? 'No custom rules yet. Add one above to override system categorization.'
              : 'No custom rules match your search.'}
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {filteredCustomRules.map((rule) => (
              <div
                key={rule.pattern}
                className="px-5 py-3 flex items-center gap-3 hover:bg-background/50 transition-colors"
              >
                <CategoryDot category={rule.category} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-foreground bg-background px-1.5 py-0.5 rounded">
                      {rule.pattern}
                    </code>
                    <span className="text-xs text-muted">→</span>
                    <span className="text-sm text-foreground">{rule.category}</span>
                    {rule.isEssential && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                        Essential
                      </span>
                    )}
                  </div>
                  {rule.note && (
                    <p className="text-xs text-muted mt-0.5">{rule.note}</p>
                  )}
                </div>
                <span className="text-xs text-muted whitespace-nowrap">
                  {matchCounts[rule.pattern] ?? 0} match{(matchCounts[rule.pattern] ?? 0) !== 1 ? 'es' : ''}
                </span>
                <button
                  onClick={() => handleDeleteRule(rule.pattern)}
                  className="p-1.5 text-muted hover:text-red-400 transition-colors rounded hover:bg-red-400/10"
                  title="Delete rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Rules Section */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-card-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted" />
            System Rules
            <span className="text-xs text-muted font-normal">(read-only, {DEFAULT_RULES.length} rules)</span>
          </h2>
        </div>

        <div className="divide-y divide-card-border">
          {filteredSystemRules.map(([category, rules]) => {
            const isCollapsed = collapsedGroups.has(category);
            return (
              <div key={category}>
                <button
                  onClick={() => toggleGroup(category)}
                  className="w-full px-5 py-2.5 flex items-center gap-2 hover:bg-background/50 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted" />
                  )}
                  <CategoryDot category={category} />
                  <span className="text-sm font-medium text-foreground">{category}</span>
                  <span className="text-xs text-muted">
                    ({rules.length} rule{rules.length !== 1 ? 's' : ''})
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="pb-2">
                    {rules.map((rule, ruleIdx) => (
                      <div
                        key={`${rule.pattern}-${rule.category}-${ruleIdx}`}
                        className="px-5 pl-12 py-1.5 flex items-center gap-3 text-sm"
                      >
                        <code className="font-mono text-muted bg-background px-1.5 py-0.5 rounded text-xs">
                          {rule.pattern}
                        </code>
                        {rule.subcategory && (
                          <>
                            <span className="text-xs text-muted">→</span>
                            <span className="text-xs text-muted">{rule.subcategory}</span>
                          </>
                        )}
                        <span className="ml-auto text-xs text-muted">
                          {matchCounts[rule.pattern] ?? 0} match{(matchCounts[rule.pattern] ?? 0) !== 1 ? 'es' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
