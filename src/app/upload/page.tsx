'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { parseNatWestCSV } from '@/lib/csv/natwest';
import { formatGBP } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import { useTransactionContext } from '@/context/transactions';
import type { CategoryName } from '@/types';

interface ImportResult {
  fileName: string;
  totalParsed: number;
  newAdded: number;
  duplicatesSkipped: number;
  errors: string[];
}

export default function UploadPage() {
  const { addTransactions, transactions: existingTransactions } = useTransactionContext();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setLastImport({
        fileName: file.name,
        totalParsed: 0,
        newAdded: 0,
        duplicatesSkipped: 0,
        errors: ['Please upload a CSV file'],
      });
      return;
    }

    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      const result = parseNatWestCSV(csv);

      // Auto-save immediately
      const countBefore = existingTransactions.length;
      const merged = addTransactions(result.transactions);
      const newAdded = merged.length - countBefore;
      const duplicatesSkipped = result.transactions.length - newAdded;

      setLastImport({
        fileName: file.name,
        totalParsed: result.transactions.length,
        newAdded,
        duplicatesSkipped,
        errors: result.errors,
      });
      setIsProcessing(false);
    };
    reader.onerror = () => {
      setLastImport({
        fileName: file.name,
        totalParsed: 0,
        newAdded: 0,
        duplicatesSkipped: 0,
        errors: ['Failed to read file'],
      });
      setIsProcessing(false);
    };
    reader.readAsText(file);
  }, [addTransactions, existingTransactions.length]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFile]
  );

  // Stats from all stored transactions
  const totalIncome = existingTransactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSpending = existingTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Accounts summary
  const accountCounts = existingTransactions.reduce<Record<string, number>>((acc, t) => {
    const name = t.accountName || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  // Category breakdown of all stored data
  const categoryBreakdown = existingTransactions
    .filter((t) => t.amount < 0)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      return acc;
    }, {});
  const sortedCategories = Object.entries(categoryBreakdown).sort(
    ([, a], [, b]) => b - a
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Statements</h1>
        <p className="text-muted mt-1">
          Import bank statement CSVs — duplicates are automatically skipped
        </p>
      </div>

      {/* Drop Zone — always visible */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-card-border hover:border-muted'
        }`}
      >
        <Upload
          className={`h-10 w-10 mx-auto mb-3 ${
            isDragging ? 'text-accent' : 'text-muted'
          }`}
        />
        <h2 className="text-lg font-semibold text-foreground mb-1">
          {isProcessing ? 'Processing...' : 'Drop your CSV here'}
        </h2>
        <p className="text-sm text-muted mb-3">
          NatWest format supported · Amex coming soon
        </p>
        <label className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          Choose CSV File
          <input
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Last Import Result */}
      {lastImport && (
        <div className={`border rounded-xl p-4 ${
          lastImport.errors.length > 0 && lastImport.newAdded === 0
            ? 'bg-danger/10 border-danger/30'
            : 'bg-success/10 border-success/30'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {lastImport.newAdded > 0 ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <AlertCircle className="h-5 w-5 text-warning" />
            )}
            <span className="font-medium text-foreground">
              {lastImport.fileName}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-muted">
              Parsed: <span className="text-foreground font-medium">{lastImport.totalParsed.toLocaleString()}</span>
            </span>
            <span className="text-success">
              New: <span className="font-medium">+{lastImport.newAdded.toLocaleString()}</span>
            </span>
            {lastImport.duplicatesSkipped > 0 && (
              <span className="text-muted">
                Duplicates skipped: <span className="font-medium">{lastImport.duplicatesSkipped.toLocaleString()}</span>
              </span>
            )}
          </div>
          {lastImport.errors.length > 0 && (
            <div className="mt-2 text-xs text-danger/80">
              {lastImport.errors.slice(0, 3).map((err, i) => (
                <p key={i}>{err}</p>
              ))}
              {lastImport.errors.length > 3 && (
                <p>...and {lastImport.errors.length - 3} more</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stored Data Summary */}
      {existingTransactions.length > 0 && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">Total Transactions</p>
              <p className="text-2xl font-bold text-foreground">
                {existingTransactions.length.toLocaleString()}
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">Total Income</p>
              <p className="text-2xl font-bold text-success">{formatGBP(totalIncome)}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">Total Spending</p>
              <p className="text-2xl font-bold text-danger">{formatGBP(totalSpending)}</p>
            </div>
          </div>

          {/* Accounts Loaded */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-base font-semibold text-foreground mb-3">
              Accounts Loaded
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(accountCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-card-border"
                  >
                    <span className="text-sm text-foreground truncate">{name}</span>
                    <span className="text-xs text-muted ml-2 shrink-0">
                      {count.toLocaleString()} txns
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-base font-semibold text-foreground mb-3">
              All-Time Spending by Category
            </h3>
            <div className="space-y-2.5">
              {sortedCategories.map(([category, amount]) => {
                const pct = (amount / totalSpending) * 100;
                const color = CATEGORY_COLORS[category as CategoryName] || '#a1a1aa';
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-sm text-foreground">{category}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted">{pct.toFixed(1)}%</span>
                        <span className="text-sm font-medium text-foreground">{formatGBP(amount)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-card-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
