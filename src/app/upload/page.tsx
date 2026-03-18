'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { parseNatWestCSV } from '@/lib/csv/natwest';
import { formatGBP } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/categories';
import { useTransactionContext } from '@/context/transactions';
import type { Transaction, CategoryName } from '@/types';

export default function UploadPage() {
  const router = useRouter();
  const { addTransactions, transactions: existingTransactions } = useTransactionContext();
  const [isDragging, setIsDragging] = useState(false);
  const [parsed, setParsed] = useState<Transaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrors(['Please upload a CSV file']);
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setSaved(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      const result = parseNatWestCSV(csv);
      setParsed(result.transactions);
      setErrors(result.errors);
      setIsProcessing(false);
    };
    reader.onerror = () => {
      setErrors(['Failed to read file']);
      setIsProcessing(false);
    };
    reader.readAsText(file);
  }, []);

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
    },
    [handleFile]
  );

  const handleSave = () => {
    const merged = addTransactions(parsed);
    setSaved(true);
    // Count how many were new vs duplicates
    const newCount = merged.length - existingTransactions.length;
    const dupCount = parsed.length - newCount;
    setErrors((prev) =>
      dupCount > 0
        ? [...prev, `${dupCount} duplicate transactions were skipped`]
        : prev
    );
  };

  const clearData = () => {
    setParsed([]);
    setErrors([]);
    setFileName('');
    setSaved(false);
  };

  // Summary stats for parsed data
  const totalIncome = parsed
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSpending = parsed
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const categoryBreakdown = parsed
    .filter((t) => t.amount < 0)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      return acc;
    }, {});
  const sortedCategories = Object.entries(categoryBreakdown).sort(
    ([, a], [, b]) => b - a
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Statement</h1>
        <p className="text-muted mt-1">
          Import your NatWest bank statement CSV
          {existingTransactions.length > 0 && (
            <span className="ml-2 text-accent">
              ({existingTransactions.length} transactions stored)
            </span>
          )}
        </p>
      </div>

      {/* Drop Zone */}
      {parsed.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
            isDragging
              ? 'border-accent bg-accent/5'
              : 'border-card-border hover:border-muted'
          }`}
        >
          <Upload
            className={`h-12 w-12 mx-auto mb-4 ${
              isDragging ? 'text-accent' : 'text-muted'
            }`}
          />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {isProcessing ? 'Processing...' : 'Drop your NatWest CSV here'}
          </h2>
          <p className="text-sm text-muted mb-4">or click to browse files</p>
          <label className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors cursor-pointer">
            <FileText className="h-4 w-4" />
            Choose CSV File
            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
          <p className="text-xs text-muted mt-4">
            Expected format: Date, Type, Description, Value, Balance, Account
            Name, Account Number
          </p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-danger" />
            <span className="font-medium text-danger">
              {errors.length} notice{errors.length > 1 ? 's' : ''}
            </span>
          </div>
          <ul className="text-sm text-danger/80 space-y-1">
            {errors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
          </ul>
        </div>
      )}

      {/* Results */}
      {parsed.length > 0 && (
        <>
          {/* File info bar + Save button */}
          <div className="flex items-center justify-between bg-card border border-card-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium text-foreground">{fileName}</p>
                <p className="text-sm text-muted">
                  {parsed.length} transactions parsed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!saved ? (
                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 bg-success hover:bg-success/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Save to Dashboard
                </button>
              ) : (
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  View Dashboard
                </button>
              )}
              <button
                onClick={clearData}
                className="p-2 text-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {saved && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm text-success font-medium">
                Transactions saved! They&apos;ll persist across sessions.
              </span>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-6">
              <p className="text-sm text-muted mb-1">Total Income</p>
              <p className="text-2xl font-bold text-success">{formatGBP(totalIncome)}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-6">
              <p className="text-sm text-muted mb-1">Total Spending</p>
              <p className="text-2xl font-bold text-danger">{formatGBP(totalSpending)}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-6">
              <p className="text-sm text-muted mb-1">Net</p>
              <p className={`text-2xl font-bold ${totalIncome - totalSpending >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatGBP(totalIncome - totalSpending)}
              </p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Spending by Category</h3>
            <div className="space-y-3">
              {sortedCategories.map(([category, amount]) => {
                const percentage = (amount / totalSpending) * 100;
                const color = CATEGORY_COLORS[category as CategoryName] || '#a1a1aa';
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-sm text-foreground">{category}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted">{percentage.toFixed(1)}%</span>
                        <span className="text-sm font-medium text-foreground">{formatGBP(amount)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-card-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-card-border">
              <h3 className="text-lg font-semibold text-foreground">Transactions Preview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-muted">
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Description</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((t, i) => (
                    <tr key={`${t.id}-${i}`} className="border-b border-card-border/50 hover:bg-card-border/20">
                      <td className="p-3 text-muted whitespace-nowrap">{t.date}</td>
                      <td className="p-3 text-foreground max-w-xs truncate">{t.description}</td>
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
                        {formatGBP(Math.abs(t.amount))}
                      </td>
                      <td className="p-3 text-right font-mono text-muted">{formatGBP(t.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 50 && (
                <div className="p-4 text-center text-sm text-muted">
                  Showing 50 of {parsed.length} transactions
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
