'use client';

import { useState, useCallback } from 'react';
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  Plus,
  Brain,
} from 'lucide-react';
import { parseNatWestCSV, isNatWestFormat } from '@/lib/csv/natwest';
import { parseAmexCSV, isAmexFormat } from '@/lib/csv/amex';
import { formatGBP } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import { useTransactionContext } from '@/context/transactions';
import type { Transaction, CategoryName } from '@/types';

interface ImportResult {
  fileName: string;
  totalParsed: number;
  newAdded: number;
  duplicatesSkipped: number;
  errors: string[];
  bank?: string;
}

export default function UploadPage() {
  const { addTransactions, allTransactions: existingTransactions } =
    useTransactionContext();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const processFile = useCallback(
    (file: File): Promise<{ result: ImportResult; transactions: Transaction[] }> => {
      return new Promise((resolve) => {
        if (!file.name.endsWith('.csv')) {
          resolve({
            result: {
              fileName: file.name,
              totalParsed: 0,
              newAdded: 0,
              duplicatesSkipped: 0,
              errors: ['Please upload a CSV file'],
            },
            transactions: [],
          });
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const csv = e.target?.result as string;

          const firstLine = csv.split('\n')[0] || '';
          const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

          let parsed: { transactions: Transaction[]; errors: string[] };
          let detectedBank = 'Unknown';

          if (isAmexFormat(headers)) {
            parsed = parseAmexCSV(csv);
            detectedBank = 'Amex';
          } else if (isNatWestFormat(headers)) {
            parsed = parseNatWestCSV(csv);
            detectedBank = 'NatWest';
          } else {
            parsed = parseNatWestCSV(csv);
            detectedBank = 'NatWest (assumed)';
          }

          resolve({
            result: {
              fileName: file.name,
              totalParsed: parsed.transactions.length,
              newAdded: 0, // will be calculated after merge
              duplicatesSkipped: 0,
              errors: parsed.errors,
              bank: detectedBank,
            },
            transactions: parsed.transactions,
          });
        };
        reader.onerror = () => {
          resolve({
            result: {
              fileName: file.name,
              totalParsed: 0,
              newAdded: 0,
              duplicatesSkipped: 0,
              errors: ['Failed to read file'],
            },
            transactions: [],
          });
        };
        reader.readAsText(file);
      });
    },
    []
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsProcessing(true);
      setImportResults([]);

      // Parse all files in parallel
      const parsed = await Promise.all(files.map((f) => processFile(f)));

      // Merge all transactions at once for accurate dedup counts
      const allTransactions = parsed.flatMap((p) => p.transactions);
      const countBefore = existingTransactions.length;
      const merged = await addTransactions(allTransactions);
      const totalNewAdded = merged.length - countBefore;

      // Calculate per-file results (approximate — dedup is global)
      const results = parsed.map((p) => ({
        ...p.result,
        newAdded: p.transactions.length, // parsed count before dedup
        duplicatesSkipped: 0,
      }));

      // Add a summary if multiple files
      if (files.length > 1) {
        const totalParsed = parsed.reduce((s, p) => s + p.result.totalParsed, 0);
        const totalErrors = parsed.flatMap((p) => p.result.errors);
        results.unshift({
          fileName: `${files.length} files total`,
          totalParsed,
          newAdded: totalNewAdded,
          duplicatesSkipped: totalParsed - totalNewAdded,
          errors: totalErrors,
          bank: 'Summary',
        });
      } else if (results.length === 1) {
        results[0].newAdded = totalNewAdded;
        results[0].duplicatesSkipped = results[0].totalParsed - totalNewAdded;
      }

      setImportResults(results);
      setIsProcessing(false);
    },
    [addTransactions, existingTransactions.length, processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) handleFiles(files);
      e.target.value = '';
    },
    [handleFiles]
  );

  // Stats from all stored transactions
  const totalIncome = existingTransactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSpending = existingTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const accountCounts = existingTransactions.reduce<Record<string, number>>(
    (acc, t) => {
      const name = t.accountName || 'Unknown';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    },
    {}
  );

  const categoryBreakdown = existingTransactions
    .filter((t) => t.amount < 0)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      return acc;
    }, {});
  const sortedCategories = Object.entries(categoryBreakdown).sort(
    ([, a], [, b]) => b - a
  );

  // Count AI-categorized vs rule-based
  const aiCategorized = existingTransactions.filter(
    (t) => t.categorySource === 'ai'
  ).length;
  const uncategorized = existingTransactions.filter(
    (t) => t.category === 'Other' && t.amount < 0
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Upload Statements
        </h1>
        <p className="text-xs md:text-sm text-muted mt-0.5 md:mt-1">
          Import CSVs — duplicates auto-skipped
        </p>
      </div>

      {/* Drop Zone */}
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
          {isProcessing ? 'Processing...' : 'Drop your CSVs here'}
        </h2>
        <p className="text-sm text-muted mb-3">
          NatWest & Amex auto-detected · Multiple files supported
        </p>
        <label className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          Choose CSV Files
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Import Results */}
      {importResults.length > 0 && (
        <div className="space-y-3">
          {importResults.map((importResult, idx) => (
            <div
              key={idx}
              className={`border rounded-xl p-4 ${
                importResult.errors.length > 0 && importResult.newAdded === 0
                  ? 'bg-danger/10 border-danger/30'
                  : 'bg-success/10 border-success/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {importResult.newAdded > 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-warning" />
                )}
                <span className="font-medium text-foreground">
                  {importResult.fileName}
                  {importResult.bank && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
                      {importResult.bank}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-muted">
                  Parsed:{' '}
                  <span className="text-foreground font-medium">
                    {importResult.totalParsed.toLocaleString()}
                  </span>
                </span>
                <span className="text-success">
                  New:{' '}
                  <span className="font-medium">
                    +{importResult.newAdded.toLocaleString()}
                  </span>
                </span>
                {importResult.duplicatesSkipped > 0 && (
                  <span className="text-muted">
                    Duplicates skipped:{' '}
                    <span className="font-medium">
                      {importResult.duplicatesSkipped.toLocaleString()}
                    </span>
                  </span>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-xs text-danger/80">
                  {importResult.errors.slice(0, 3).map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                  {importResult.errors.length > 3 && (
                    <p>...and {importResult.errors.length - 3} more</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stored Data Summary */}
      {existingTransactions.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">Total Transactions</p>
              <p className="text-2xl font-bold text-foreground">
                {existingTransactions.length.toLocaleString()}
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">Total Income</p>
              <p className="text-2xl font-bold text-success">
                {formatGBP(totalIncome)}
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">Total Spending</p>
              <p className="text-2xl font-bold text-danger">
                {formatGBP(totalSpending)}
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-sm text-muted mb-1">AI Categorized</p>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-accent" />
                <p className="text-2xl font-bold text-accent">
                  {aiCategorized}
                </p>
              </div>
              {uncategorized > 0 && (
                <p className="text-xs text-warning mt-1">
                  {uncategorized} still uncategorized
                </p>
              )}
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
                    <span className="text-sm text-foreground truncate">
                      {name}
                    </span>
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
                const color =
                  CATEGORY_COLORS[category as CategoryName] || '#a1a1aa';
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-foreground">
                          {category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted">
                          {pct.toFixed(1)}%
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {formatGBP(amount)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-card-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                        }}
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
