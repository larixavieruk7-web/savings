'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [redirectMessage, setRedirectMessage] = useState('');

  const processFile = useCallback(
    async (file: File): Promise<{ result: ImportResult; transactions: Transaction[] }> => {
      const ext = file.name.toLowerCase().split('.').pop();

      if (ext !== 'csv' && ext !== 'pdf') {
        return {
          result: {
            fileName: file.name,
            totalParsed: 0,
            newAdded: 0,
            duplicatesSkipped: 0,
            errors: ['Please upload a CSV or PDF file'],
          },
          transactions: [],
        };
      }

      // ─── PDF path: send to API route ───
      if (ext === 'pdf') {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('filename', file.name);
          const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData });
          const json = await res.json();

          if (!res.ok) {
            return {
              result: {
                fileName: file.name,
                totalParsed: 0,
                newAdded: 0,
                duplicatesSkipped: 0,
                errors: [json.error || 'PDF parsing failed', ...(json.errors ?? [])],
                bank: 'PDF',
              },
              transactions: [],
            };
          }

          const txns = (json.transactions ?? []) as Transaction[];
          const source = json.source === 'amex' ? 'Amex' : 'NatWest';
          return {
            result: {
              fileName: file.name,
              totalParsed: txns.length,
              newAdded: 0,
              duplicatesSkipped: 0,
              errors: json.errors ?? [],
              bank: `${source} (PDF)`,
            },
            transactions: txns,
          };
        } catch {
          return {
            result: {
              fileName: file.name,
              totalParsed: 0,
              newAdded: 0,
              duplicatesSkipped: 0,
              errors: ['Failed to parse PDF — try CSV export instead'],
              bank: 'PDF',
            },
            transactions: [],
          };
        }
      }

      // ─── CSV path: parse client-side (unchanged) ───
      return new Promise((resolve) => {
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
              newAdded: 0,
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

      // Merge all transactions at once — returns accurate dedup counts
      const allParsedTransactions = parsed.flatMap((p) => p.transactions);
      const { added: totalNewAdded } =
        await addTransactions(allParsedTransactions);

      // Build per-file dedup stats by checking which IDs from each file were new
      // We need the existing IDs to figure out per-file splits
      const existingIds = new Set(existingTransactions.map(t => t.id));
      const results = parsed.map((p) => {
        let fileNew = 0;
        let fileSkipped = 0;
        for (const t of p.transactions) {
          if (existingIds.has(t.id)) fileSkipped++;
          else fileNew++;
        }
        return {
          ...p.result,
          newAdded: fileNew,
          duplicatesSkipped: fileSkipped,
        };
      });

      setImportResults(results);
      setIsProcessing(false);

      // Redirect to dashboard after successful import so shepherd can categorize
      if (totalNewAdded > 0) {
        setRedirectMessage(`Upload complete! ${totalNewAdded} new transactions. Redirecting to categorize...`);
        setTimeout(() => {
          router.push('/');
        }, 2000);
      }
    },
    [addTransactions, existingTransactions, processFile, router]
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
          Import CSV or PDF statements — duplicates auto-skipped
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
          {isProcessing ? 'Processing...' : 'Drop your statements here'}
        </h2>
        <p className="text-sm text-muted mb-3">
          NatWest & Amex auto-detected · CSV and PDF supported · Multiple files
        </p>
        <label className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer">
          <Plus className="h-4 w-4" />
          Choose Files
          <input
            type="file"
            accept=".csv,.pdf"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Import Results */}
      {importResults.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
          {importResults.map((importResult, idx) => (
            <div key={idx} className="flex items-start gap-2">
              {importResult.errors.length > 0 && importResult.newAdded === 0 ? (
                <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {importResult.bank ?? 'Unknown'} — {importResult.fileName}
                  </span>
                  <span className="text-sm text-muted">→</span>
                  <span className="text-sm">
                    <span className="text-success font-medium">{importResult.newAdded} new</span>
                    {importResult.duplicatesSkipped > 0 && (
                      <span className="text-muted"> · {importResult.duplicatesSkipped} already existed</span>
                    )}
                  </span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-1 text-xs text-danger/80">
                    {importResult.errors.slice(0, 3).map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                    {importResult.errors.length > 3 && (
                      <p>...and {importResult.errors.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {importResults.some(r => r.duplicatesSkipped > 0) && (
            <p className="text-xs text-muted pt-1 border-t border-card-border mt-2">
              Overlapping dates detected — duplicates automatically ignored.
            </p>
          )}
        </div>
      )}

      {/* Redirect message after successful upload */}
      {redirectMessage && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 flex items-center gap-3">
          <Brain className="h-5 w-5 text-accent animate-pulse" />
          <p className="text-sm font-medium text-foreground">{redirectMessage}</p>
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
