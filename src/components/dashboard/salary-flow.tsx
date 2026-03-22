'use client';

import type { SalaryFlow } from '@/types';
import { ResponsiveSankey } from '@nivo/sankey';

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function formatShortGBP(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(1)}k`;
  return `£${pounds.toFixed(0)}`;
}

interface SalaryFlowProps {
  salaryFlow: SalaryFlow | null;
}

export function SalaryFlowChart({ salaryFlow }: SalaryFlowProps) {
  if (!salaryFlow || salaryFlow.totalSalary === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">Where Your Salary Went</h3>
        <p className="text-sm text-muted">Select a salary cycle with income to see the flow.</p>
      </div>
    );
  }

  const { totalSalary, creditCardPayments, savingsContributions, directDebits, directSpending, creditCardSpending } = salaryFlow;

  // Build Sankey data — only include nodes with value > 0
  const nodes: { id: string }[] = [{ id: 'Salary' }];
  const links: { source: string; target: string; value: number }[] = [];

  if (creditCardPayments > 0) {
    nodes.push({ id: 'Credit Cards' });
    links.push({ source: 'Salary', target: 'Credit Cards', value: creditCardPayments });
  }
  if (savingsContributions > 0) {
    nodes.push({ id: 'Savings' });
    links.push({ source: 'Salary', target: 'Savings', value: savingsContributions });
  }
  if (directDebits > 0) {
    nodes.push({ id: 'Direct Debits' });
    links.push({ source: 'Salary', target: 'Direct Debits', value: directDebits });
  }
  if (directSpending > 0) {
    nodes.push({ id: 'Debit Spend' });
    links.push({ source: 'Salary', target: 'Debit Spend', value: directSpending });
  }

  // If there are links, render the Sankey
  if (links.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">Where Your Salary Went</h3>
        <p className="text-sm text-muted">No outflows detected for this cycle.</p>
      </div>
    );
  }

  // Summary bars for non-Sankey display (compact fallback + always shown)
  const outflows = [
    { label: 'Credit Cards', amount: creditCardPayments, color: '#3b82f6' },
    { label: 'Savings', amount: savingsContributions, color: '#22c55e' },
    { label: 'Direct Debits', amount: directDebits, color: '#f59e0b' },
    { label: 'Debit Spend', amount: directSpending, color: '#8b5cf6' },
  ].filter((o) => o.amount > 0);

  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Where Your Salary Went</h3>
          <p className="text-xs text-muted mt-0.5">This cycle · {formatGBP(totalSalary)} income</p>
        </div>
        {creditCardSpending > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted">Amex actual spend</p>
            <p className="text-sm font-semibold text-foreground">{formatGBP(creditCardSpending)}</p>
          </div>
        )}
      </div>

      {/* Sankey chart */}
      <div className="h-48 -mx-2">
        <ResponsiveSankey
          data={{ nodes, links }}
          margin={{ top: 10, right: 100, bottom: 10, left: 10 }}
          align="justify"
          colors={(node: { id: string }) => {
            const colorMap: Record<string, string> = {
              'Salary': '#16a34a',
              'Credit Cards': '#3b82f6',
              'Savings': '#22c55e',
              'Direct Debits': '#f59e0b',
              'Debit Spend': '#8b5cf6',
            };
            return colorMap[node.id] || '#6b7280';
          }}
          nodeOpacity={1}
          nodeThickness={14}
          nodeInnerPadding={2}
          nodeBorderWidth={0}
          linkOpacity={0.25}
          linkHoverOpacity={0.5}
          linkContract={1}
          enableLinkGradient
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={8}
          labelTextColor="#9ca3af"
          nodeTooltip={({ node }) => (
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded px-3 py-1.5 text-xs">
              <span className="text-white font-medium">{node.id}</span>
              <span className="text-gray-400 ml-2">{formatGBP(node.value)}</span>
            </div>
          )}
          theme={{
            labels: {
              text: {
                fontSize: 11,
                fontFamily: 'inherit',
              },
            },
            tooltip: {
              container: {
                background: '#1a1a2e',
                borderRadius: '6px',
                border: '1px solid #2a2a3e',
              },
            },
          }}
        />
      </div>

      {/* Summary row */}
      <div className="mt-3 pt-3 border-t border-card-border grid grid-cols-2 sm:grid-cols-4 gap-3">
        {outflows.map((o) => {
          const pct = totalSalary > 0 ? ((o.amount / totalSalary) * 100).toFixed(0) : '0';
          return (
            <div key={o.label}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                <span className="text-xs text-muted">{o.label}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatShortGBP(o.amount)}</span>
                <span className="text-[10px] text-muted">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
