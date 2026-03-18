import { PiggyBank, Upload, TrendingUp, Brain } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHome() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted mt-1">Household spending overview</p>
      </div>

      {/* Getting Started Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/upload"
          className="group border border-card-border bg-card rounded-xl p-6 hover:border-accent/50 transition-all"
        >
          <Upload className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">
            Upload Bank Statement
          </h3>
          <p className="text-sm text-muted mt-1">
            Import your NatWest CSV to get started
          </p>
        </Link>

        <div className="border border-card-border bg-card rounded-xl p-6 opacity-50">
          <TrendingUp className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold text-foreground">Spending Trends</h3>
          <p className="text-sm text-muted mt-1">
            Upload data first to see trends
          </p>
        </div>

        <div className="border border-card-border bg-card rounded-xl p-6 opacity-50">
          <Brain className="h-8 w-8 text-accent mb-3" />
          <h3 className="font-semibold text-foreground">AI Insights</h3>
          <p className="text-sm text-muted mt-1">
            Upload data first for AI analysis
          </p>
        </div>
      </div>

      {/* Empty State */}
      <div className="border border-dashed border-card-border rounded-xl p-16 text-center">
        <PiggyBank className="h-16 w-16 text-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          No transactions yet
        </h2>
        <p className="text-muted max-w-md mx-auto mb-6">
          Upload your NatWest bank statement CSV to start tracking your household
          spending, find savings opportunities, and get AI-powered insights.
        </p>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload Your First Statement
        </Link>
      </div>
    </div>
  );
}
