'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { formatGBP } from '@/lib/utils';
import { saveTransactions, getTransactions } from '@/lib/storage';
import { format, parseISO } from 'date-fns';
import { Search, Filter, Upload, ArrowUpDown, Brain, Loader2, CheckSquare, XCircle, Tag } from 'lucide-react';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import Link from 'next/link';
import { CategoryEditor } from '@/components/CategoryEditor';

type SortField = 'date' | 'amount' | 'category' | 'description';
type SortDir = 'asc' | 'desc';

const BULK_CATEGORY_GROUPS: Record<string, string[]> = {
  Essential: [
    'Rent / Mortgage', 'Utilities', 'Groceries', 'Insurance', 'Transport',
    'Phone & Internet', 'Childcare & Education', 'Healthcare', 'Debt Repayments',
  ],
  Discretionary: [
    'Dining Out', 'Entertainment', 'Shopping', 'Subscriptions', 'Personal Care',
    'Holidays & Travel', 'Drinks & Nights Out',
  ],
  Financial: [
    'Savings & Investments', 'Transfers', 'Cash Withdrawals', 'Bank Charges', 'Charity',
  ],
  Income: ['Salary', 'Benefits', 'Refunds', 'Other Income'],
};

function isBulkEssentialDefault(category: string): boolean {
  return BULK_CATEGORY_GROUPS.Essential.includes(category);
}

export default function TransactionsPage() {
  const { transactions, loaded, reload } = useTransactionContext();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const perPage = 50;
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categorizeResult, setCategorizeResult] = useState('');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkEssential, setBulkEssential] = useState(false);

  const uncategorizedCount = useMemo(
    () => transactions.filter((t) => t.category === 'Other' && t.amount < 0 && t.categorySource !== 'manual').length,
    [transactions]
  );

  const recategorizeAll = useCallback(async () => {
    const uncategorized = transactions.filter(
      (t) => t.category === 'Other' && t.amount < 0 && t.categorySource !== 'manual'
    );
    if (uncategorized.length === 0) {
      setCategorizeResult('No uncategorized transactions to process.');
      return;
    }

    setIsCategorizing(true);
    setCategorizeResult('');

    try {
      const response = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: uncategorized.map((t) => ({
            id: t.id,
            description: t.description,
            amount: t.amount / 100,
            merchant: t.merchantName,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Categorization failed');
      }

      const { results } = await response.json();
      const resultMap = new Map<string, { id: string; category: string; isEssential: boolean }>(
        results.map((r: { id: string; category: string; isEssential: boolean }) => [r.id, r])
      );

      // Update localStorage directly
      const all = await getTransactions();
      let updated = 0;
      for (const t of all) {
        const aiResult = resultMap.get(t.id);
        if (aiResult && aiResult.category) {
          t.category = aiResult.category;
          t.isEssential = aiResult.isEssential;
          t.categorySource = 'ai';
          updated++;
        }
      }
      await saveTransactions(all);
      reload();

      setCategorizeResult(`AI categorized ${updated} transactions.`);
    } catch (err) {
      setCategorizeResult(err instanceof Error ? err.message : 'Failed');
    }
    setIsCategorizing(false);
  }, [transactions, reload]);

  const categories = useMemo(() => {
    const cats = new Set(transactions.map((t) => t.category));
    return Array.from(cats).sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    let result = transactions;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.merchantName?.toLowerCase().includes(q)
      );
    }

    if (categoryFilter) {
      result = result.filter((t) => t.category === categoryFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = a.date.localeCompare(b.date);
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'category':
          cmp = a.category.localeCompare(b.category);
          break;
        case 'description':
          cmp = a.description.localeCompare(b.description);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [transactions, search, categoryFilter, sortField, sortDir]);

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  // Bulk selection helpers
  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    const pageIds = paged.map((t) => t.id);
    setSelectedIds((prev) => {
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [paged]);

  const allOnPageSelected = paged.length > 0 && paged.every((t) => selectedIds.has(t.id));
  const someOnPageSelected = paged.some((t) => selectedIds.has(t.id));

  const handleBulkApply = useCallback(async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    const all = await getTransactions();
    for (const t of all) {
      if (selectedIds.has(t.id)) {
        t.category = bulkCategory;
        t.isEssential = bulkEssential;
        t.categorySource = 'manual';
      }
    }
    await saveTransactions(all);
    reload();
    setSelectedIds(new Set());
    setBulkCategory('');
    setBulkEssential(false);
  }, [bulkCategory, bulkEssential, selectedIds, reload]);

  const handleBulkClear = useCallback(() => {
    setSelectedIds(new Set());
    setBulkCategory('');
    setBulkEssential(false);
  }, []);

  const handleBulkCategoryChange = useCallback((cat: string) => {
    setBulkCategory(cat);
    setBulkEssential(isBulkEssentialDefault(cat));
  }, []);

  // Filtered stats
  const filteredIncome = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const filteredSpending = filtered.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  if (!loaded) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted">Loading...</p></div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Transactions</h1>
        <div className="border border-dashed border-card-border rounded-xl p-16 text-center">
          <p className="text-muted mb-4">No transactions yet.</p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Upload className="h-4 w-4" /> Upload CSV
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Transactions</h1>
          <p className="text-xs md:text-sm text-muted mt-0.5 md:mt-1">
            {filtered.length.toLocaleString()} txn{filtered.length !== 1 ? 's' : ''}
            {search || categoryFilter ? ' (filtered)' : ''}
          </p>
        </div>
        <PeriodSelector />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-card-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent text-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(0);
            }}
            className="pl-10 pr-8 py-2.5 bg-card border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent text-sm appearance-none cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* AI Re-categorize */}
      {uncategorizedCount > 0 && (
        <div className="flex items-center justify-between bg-accent/10 border border-accent/30 rounded-xl p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {uncategorizedCount} transactions need categorizing
            </p>
            <p className="text-xs text-muted">
              AI will classify them as essential/discretionary with specific categories
            </p>
          </div>
          <button
            onClick={recategorizeAll}
            disabled={isCategorizing}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            {isCategorizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            {isCategorizing ? 'Categorizing...' : 'Categorize with AI'}
          </button>
        </div>
      )}
      {categorizeResult && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-3 text-sm text-success">
          {categorizeResult}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card border border-card-border rounded-lg p-4">
          <p className="text-xs text-muted">Income</p>
          <p className="text-lg font-bold text-success">{formatGBP(filteredIncome)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <p className="text-xs text-muted">Spending</p>
          <p className="text-lg font-bold text-danger">{formatGBP(filteredSpending)}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4 hidden md:block">
          <p className="text-xs text-muted">Avg Transaction</p>
          <p className="text-lg font-bold text-foreground">
            {filtered.length > 0 ? formatGBP(Math.round((filteredIncome + filteredSpending) / filtered.length)) : '£0.00'}
          </p>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {paged.map((t, i) => (
          <div
            key={`m-${t.id}-${i}`}
            className={`bg-card border border-card-border rounded-xl p-3.5 ${
              selectedIds.has(t.id) ? 'border-accent/40 bg-accent/5' : ''
            }`}
            onClick={() => toggleSelectOne(t.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{t.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted">{format(parseISO(t.date), 'dd MMM')}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-card-border/60 text-muted">{t.category}</span>
                </div>
              </div>
              <span className={`text-sm font-bold font-mono whitespace-nowrap ${t.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                {t.amount >= 0 ? '+' : '-'}{formatGBP(Math.abs(t.amount))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-muted">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                    onChange={toggleSelectAllOnPage}
                    className="rounded border-card-border bg-card accent-accent h-4 w-4 cursor-pointer"
                    title="Select all on this page"
                  />
                </th>
                {([
                  ['date', 'Date'],
                  ['description', 'Description'],
                  ['category', 'Category'],
                  ['amount', 'Amount'],
                ] as [SortField, string][]).map(([field, label]) => (
                  <th
                    key={field}
                    className={`p-3 font-medium cursor-pointer hover:text-foreground transition-colors ${
                      field === 'amount' ? 'text-right' : 'text-left'
                    }`}
                    onClick={() => toggleSort(field)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <ArrowUpDown
                        className={`h-3 w-3 ${
                          sortField === field ? 'text-accent' : 'text-muted/50'
                        }`}
                      />
                    </span>
                  </th>
                ))}
                <th className="text-right p-3 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((t, i) => (
                <tr
                  key={`${t.id}-${i}`}
                  className={`border-b border-card-border/50 hover:bg-card-border/20 transition-colors ${
                    selectedIds.has(t.id) ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelectOne(t.id)}
                      className="rounded border-card-border bg-card accent-accent h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 text-muted whitespace-nowrap">
                    {format(parseISO(t.date), 'dd MMM yyyy')}
                  </td>
                  <td className="p-3 text-foreground max-w-xs truncate" title={t.description}>
                    {t.description}
                  </td>
                  <td className="p-3">
                    <CategoryEditor transaction={t} onSaved={reload} />
                  </td>
                  <td className={`p-3 text-right font-mono ${t.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                    {t.amount >= 0 ? '+' : '-'}{formatGBP(Math.abs(t.amount))}
                  </td>
                  <td className="p-3 text-right font-mono text-muted">
                    {formatGBP(t.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 md:p-4 bg-card border border-card-border rounded-xl md:rounded-none md:border-t md:border-x-0 md:border-b-0">
          <p className="text-xs md:text-sm text-muted">
            {page + 1} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm bg-card-border rounded-lg disabled:opacity-30 hover:bg-muted/30 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm bg-card-border rounded-lg disabled:opacity-30 hover:bg-muted/30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50">
          <div className="max-w-5xl mx-auto px-3 md:px-4 pb-3 md:pb-4">
            <div className="bg-card/90 backdrop-blur border border-card-border rounded-t-xl shadow-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground shrink-0">
                <CheckSquare className="h-4 w-4 text-accent" />
                {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''} selected
              </div>

              <div className="flex flex-1 flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Category dropdown */}
                <div className="relative">
                  <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                  <select
                    value={bulkCategory}
                    onChange={(e) => handleBulkCategoryChange(e.target.value)}
                    className="pl-8 pr-8 py-2 bg-card border border-card-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer min-w-[200px]"
                  >
                    <option value="">Select category...</option>
                    {Object.entries(BULK_CATEGORY_GROUPS).map(([group, cats]) => (
                      <optgroup key={group} label={group}>
                        {cats.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Essential checkbox */}
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={bulkEssential}
                    onChange={(e) => setBulkEssential(e.target.checked)}
                    className="rounded border-card-border bg-card accent-accent h-4 w-4"
                  />
                  Essential
                </label>

                {/* Apply button */}
                <button
                  onClick={handleBulkApply}
                  disabled={!bulkCategory}
                  className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
                >
                  Apply
                </button>

                {/* Clear button */}
                <button
                  onClick={handleBulkClear}
                  className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground px-3 py-2 rounded-lg border border-card-border hover:bg-card-border/40 transition-colors shrink-0"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
