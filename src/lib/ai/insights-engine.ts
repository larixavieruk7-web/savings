/**
 * AI-powered personal finance insights engine.
 *
 * Analyses categorised transactions to detect:
 *   1. Spending anomalies (unusual amounts for a merchant/category)
 *   2. Savings opportunities (subscriptions, renegotiable contracts, cheaper alternatives)
 *   3. Spending trends (month-over-month changes)
 *
 * NEW code — not extracted from Distil. Built to complement the categoriser.
 */

import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from './retry'

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

export interface CategorisedTransaction {
  id: string
  date: string
  description: string
  amount: number
  merchant: string | null
  category: string
  isEssential: boolean
}

export interface SpendingAnomaly {
  transactionId: string
  description: string
  amount: number
  category: string
  reason: string           // e.g. "This is 3x your usual spend at Tesco"
  severity: 'info' | 'warning' | 'alert'
}

export interface SavingsOpportunity {
  category: string
  merchant: string | null
  currentMonthlySpend: number
  suggestion: string       // AI-generated suggestion
  estimatedSaving: number | null
  type: 'subscription' | 'renegotiate' | 'switch' | 'reduce' | 'cancel'
}

export interface SpendingSummary {
  totalIn: number
  totalOut: number
  netFlow: number
  essentialSpend: number
  discretionarySpend: number
  essentialPercent: number
  topCategories: { category: string; total: number; count: number }[]
  topMerchants: { merchant: string; total: number; count: number }[]
  monthlyBreakdown: { month: string; in: number; out: number }[]
}

// ─── Spending summary (pure computation, no AI) ─────────────────────────────

export function computeSpendingSummary(transactions: CategorisedTransaction[]): SpendingSummary {
  let totalIn = 0
  let totalOut = 0
  let essentialSpend = 0
  let discretionarySpend = 0

  const categoryTotals: Record<string, { total: number; count: number }> = {}
  const merchantTotals: Record<string, { total: number; count: number }> = {}
  const monthlyTotals: Record<string, { in: number; out: number }> = {}

  for (const txn of transactions) {
    if (txn.amount >= 0) {
      totalIn += txn.amount
    } else {
      totalOut += Math.abs(txn.amount)
      if (txn.isEssential) {
        essentialSpend += Math.abs(txn.amount)
      } else {
        discretionarySpend += Math.abs(txn.amount)
      }
    }

    // Category breakdown (spending only)
    if (txn.amount < 0 && txn.category) {
      if (!categoryTotals[txn.category]) categoryTotals[txn.category] = { total: 0, count: 0 }
      categoryTotals[txn.category].total += Math.abs(txn.amount)
      categoryTotals[txn.category].count++
    }

    // Merchant breakdown (spending only)
    if (txn.amount < 0 && txn.merchant) {
      const key = txn.merchant.toUpperCase()
      if (!merchantTotals[key]) merchantTotals[key] = { total: 0, count: 0 }
      merchantTotals[key].total += Math.abs(txn.amount)
      merchantTotals[key].count++
    }

    // Monthly breakdown
    if (txn.date) {
      const month = txn.date.substring(0, 7) // YYYY-MM
      if (!monthlyTotals[month]) monthlyTotals[month] = { in: 0, out: 0 }
      if (txn.amount >= 0) {
        monthlyTotals[month].in += txn.amount
      } else {
        monthlyTotals[month].out += Math.abs(txn.amount)
      }
    }
  }

  const topCategories = Object.entries(categoryTotals)
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)

  const topMerchants = Object.entries(merchantTotals)
    .map(([merchant, data]) => ({ merchant, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  const monthlyBreakdown = Object.entries(monthlyTotals)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    totalIn: Math.round(totalIn * 100) / 100,
    totalOut: Math.round(totalOut * 100) / 100,
    netFlow: Math.round((totalIn - totalOut) * 100) / 100,
    essentialSpend: Math.round(essentialSpend * 100) / 100,
    discretionarySpend: Math.round(discretionarySpend * 100) / 100,
    essentialPercent: totalOut > 0 ? Math.round((essentialSpend / totalOut) * 100) : 0,
    topCategories,
    topMerchants,
    monthlyBreakdown,
  }
}

// ─── Anomaly detection (statistical + AI) ───────────────────────────────────

export function detectAnomalies(transactions: CategorisedTransaction[]): SpendingAnomaly[] {
  const anomalies: SpendingAnomaly[] = []

  // Group spending by merchant
  const merchantHistory: Record<string, number[]> = {}
  for (const txn of transactions) {
    if (txn.amount >= 0 || !txn.merchant) continue
    const key = txn.merchant.toUpperCase()
    if (!merchantHistory[key]) merchantHistory[key] = []
    merchantHistory[key].push(Math.abs(txn.amount))
  }

  // Detect unusually high transactions per merchant (> 2x the average)
  for (const txn of transactions) {
    if (txn.amount >= 0 || !txn.merchant) continue
    const key = txn.merchant.toUpperCase()
    const history = merchantHistory[key]
    if (!history || history.length < 3) continue

    const avg = history.reduce((s, v) => s + v, 0) / history.length
    const absAmount = Math.abs(txn.amount)

    if (absAmount > avg * 2.5 && absAmount > 20) {
      anomalies.push({
        transactionId: txn.id,
        description: txn.description,
        amount: txn.amount,
        category: txn.category,
        reason: `This is ${(absAmount / avg).toFixed(1)}x your average spend at ${txn.merchant} (avg: £${avg.toFixed(2)})`,
        severity: absAmount > avg * 5 ? 'alert' : 'warning',
      })
    }
  }

  // Detect duplicate/near-duplicate charges (same merchant, same amount, within 3 days)
  const spending = transactions
    .filter(t => t.amount < 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  for (let i = 0; i < spending.length - 1; i++) {
    for (let j = i + 1; j < spending.length; j++) {
      const a = spending[i]
      const b = spending[j]
      if (!a.date || !b.date) continue

      const daysDiff = Math.abs(
        (new Date(b.date).getTime() - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysDiff > 3) break

      if (
        a.merchant && b.merchant &&
        a.merchant.toUpperCase() === b.merchant.toUpperCase() &&
        Math.abs(a.amount) === Math.abs(b.amount) &&
        Math.abs(a.amount) > 10
      ) {
        anomalies.push({
          transactionId: b.id,
          description: b.description,
          amount: b.amount,
          category: b.category,
          reason: `Possible duplicate charge: same amount (£${Math.abs(b.amount).toFixed(2)}) at ${b.merchant} within ${daysDiff} day(s)`,
          severity: 'warning',
        })
      }
    }
  }

  return anomalies
}

// ─── AI savings suggestions ─────────────────────────────────────────────────

export async function generateSavingsSuggestions(
  summary: SpendingSummary,
  transactions: CategorisedTransaction[],
): Promise<SavingsOpportunity[]> {
  // Build a concise summary for GPT
  const subscriptions = transactions
    .filter(t => t.amount < 0 && t.category === 'Subscriptions')
    .reduce((acc, t) => {
      const key = (t.merchant || t.description).toUpperCase()
      if (!acc[key]) acc[key] = { merchant: t.merchant || t.description, total: 0, count: 0 }
      acc[key].total += Math.abs(t.amount)
      acc[key].count++
      return acc
    }, {} as Record<string, { merchant: string; total: number; count: number }>)

  const monthCount = summary.monthlyBreakdown.length || 1

  const context = `Household spending analysis (${monthCount} month${monthCount > 1 ? 's' : ''}):
- Total income: £${summary.totalIn.toFixed(2)}/month avg
- Total spending: £${summary.totalOut.toFixed(2)}/month avg
- Essential: £${summary.essentialSpend.toFixed(2)} (${summary.essentialPercent}%)
- Discretionary: £${summary.discretionarySpend.toFixed(2)} (${100 - summary.essentialPercent}%)
- Net: £${summary.netFlow.toFixed(2)}

Top spending categories:
${summary.topCategories.slice(0, 10).map(c => `  ${c.category}: £${c.total.toFixed(2)} (${c.count} transactions)`).join('\n')}

Top merchants:
${summary.topMerchants.slice(0, 15).map(m => `  ${m.merchant}: £${m.total.toFixed(2)} (${m.count} transactions)`).join('\n')}

Active subscriptions:
${Object.values(subscriptions).map(s => `  ${s.merchant}: £${s.total.toFixed(2)} total (${s.count} payments)`).join('\n') || '  None detected'}

Monthly trend:
${summary.monthlyBreakdown.map(m => `  ${m.month}: in £${m.in.toFixed(2)}, out £${m.out.toFixed(2)}`).join('\n')}`

  const response = await withRetry(
    () => getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a UK personal finance advisor. Analyse the household spending data and suggest specific, actionable ways to save money.

Focus on:
1. Subscriptions that could be cancelled or downgraded
2. Insurance/utilities that could be renegotiated or switched (mention UK comparison sites like MoneySupermarket, Compare the Market, Uswitch)
3. Spending categories where the household is notably high vs UK averages
4. Quick wins (small changes that add up)
5. Patterns suggesting waste (e.g. high dining out + high groceries = potential food waste)

Return JSON: { "suggestions": [{ "category": "...", "merchant": "..." or null, "currentMonthlySpend": number, "suggestion": "specific actionable advice", "estimatedSaving": number or null (£/month), "type": "subscription|renegotiate|switch|reduce|cancel" }] }

Be specific to their actual merchants and amounts. Max 10 suggestions, ordered by impact.`
        },
        { role: 'user', content: context },
      ],
    }),
    { isRetryable: isRetryableOpenAIError, label: 'OpenAI.SavingsSuggestions' },
  )

  const content = response.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(content)

  if (!Array.isArray(parsed.suggestions)) return []

  return parsed.suggestions.map((s: Record<string, unknown>) => ({
    category: String(s.category || ''),
    merchant: s.merchant ? String(s.merchant) : null,
    currentMonthlySpend: Number(s.currentMonthlySpend) || 0,
    suggestion: String(s.suggestion || ''),
    estimatedSaving: s.estimatedSaving != null ? Number(s.estimatedSaving) : null,
    type: (['subscription', 'renegotiate', 'switch', 'reduce', 'cancel'].includes(String(s.type))
      ? String(s.type)
      : 'reduce') as SavingsOpportunity['type'],
  }))
}
