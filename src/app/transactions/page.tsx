'use client';

import { useState, useMemo } from 'react';
import { useTransactionContext } from '@/context/transactions';
import { formatGBP } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import type { CategoryName } from '@/types';
import { format, parseISO } from 'date-fns';
import { Search, Filter, Upload, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';

type SortField = 'date' | 'amount' | 'category' | 'description';
type SortDir = 'asc' | 'desc';

export default function TransactionsPage() {
  const { transactions, loaded } = useTransactionContext();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const perPage = 50;

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

  // Filtered stats
  const filteredIncome = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const filteredSpending = filtered.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  if (!loaded) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted">Loading...</p></div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
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
      <div>
        <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
        <p className="text-muted mt-1">
          {filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? 's' : ''}
          {search || categoryFilter ? ' (filtered)' : ''}
        </p>
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

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-muted">
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
                  className="border-b border-card-border/50 hover:bg-card-border/20 transition-colors"
                >
                  <td className="p-3 text-muted whitespace-nowrap">
                    {format(parseISO(t.date), 'dd MMM yyyy')}
                  </td>
                  <td className="p-3 text-foreground max-w-xs truncate" title={t.description}>
                    {t.description}
                  </td>
                  <td className="p-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${CATEGORY_COLORS[t.category as CategoryName] || '#a1a1aa'}20`,
                        color: CATEGORY_COLORS[t.category as CategoryName] || '#a1a1aa',
                      }}
                    >
                      {t.category}
                    </span>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-card-border">
            <p className="text-sm text-muted">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm bg-card-border rounded-lg disabled:opacity-30 hover:bg-muted/30 transition-colors"
              >
                Previous
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
      </div>
    </div>
  );
}
