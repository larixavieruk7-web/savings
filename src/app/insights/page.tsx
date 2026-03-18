'use client';

import { useTransactionContext } from '@/context/transactions';
import { Brain, Upload, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function InsightsPage() {
  const { transactions, loaded } = useTransactionContext();

  if (!loaded) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted">Loading...</p></div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-foreground">AI Insights</h1>
        <div className="border border-dashed border-card-border rounded-xl p-16 text-center">
          <p className="text-muted mb-4">Upload a bank statement first to generate AI insights.</p>
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
        <h1 className="text-3xl font-bold text-foreground">AI Insights</h1>
        <p className="text-muted mt-1">
          Powered by OpenAI — connect your API key to enable
        </p>
      </div>

      <div className="border border-dashed border-accent/30 rounded-xl p-12 text-center bg-accent/5">
        <Brain className="h-16 w-16 text-accent mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          AI Insights Coming Soon
        </h2>
        <p className="text-muted max-w-md mx-auto mb-4">
          This page will analyze your {transactions.length} transactions using OpenAI to find:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
          {[
            'Spending patterns & anomalies',
            'Price increases on recurring bills',
            'Savings opportunities',
            'Monthly spending reports',
            'Subscription audit',
            'Budget recommendations',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="text-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
