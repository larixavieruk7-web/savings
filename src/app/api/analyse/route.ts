import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

/**
 * AI-powered monthly financial analysis.
 *
 * Unlike the rule-based intelligence layer (health scorecard, category creep, etc.),
 * this endpoint sends rich spending data to GPT and asks it to THINK about the data —
 * spot patterns, make connections, push back on behaviour, and give specific advice.
 *
 * This is the "financial advisor brain" — the rule-based layer handles the obvious stuff,
 * GPT handles the nuanced pattern recognition a human advisor would do.
 */

const SYSTEM_PROMPT = `You are a senior financial advisor analysing a UK household's monthly spending. You have been given their COMPLETE transaction data for a salary cycle (pay period).

Your job is to produce a structured monthly analysis. You must be:
- SPECIFIC: reference exact amounts, merchant names, dates
- PRESCRIPTIVE: tell them what to DO, not just what happened
- HONEST: if spending is concerning, say so directly
- ACTIONABLE: every recommendation must have a concrete next step

The household:
- Gus and Larissa, UK-based
- Both work at JP Morgan (salaries via 3305 JPMCB BAC)
- Main account: NatWest current (hub)
- Credit cards: Amex (Gus) and Amex (Larissa)
- They have a Nationwide mortgage and NatWest loans

Respond in JSON with this exact structure:
{
  "summary": "2-3 sentence overview of the month — was it good, bad, on track?",
  "monthGrade": "A/B/C/D/F with + or - (e.g. B+)",
  "topInsight": "The single most important thing they need to know this month",
  "spendingPatterns": [
    {
      "pattern": "description of a spending pattern or habit",
      "impact": "estimated monthly cost in pounds",
      "recommendation": "what to do about it",
      "urgency": "high/medium/low"
    }
  ],
  "pushBack": [
    {
      "area": "specific category or merchant",
      "message": "direct, honest feedback — as if you were their advisor sitting across the table",
      "suggestedAction": "concrete next step"
    }
  ],
  "savingsOpportunities": [
    {
      "opportunity": "description",
      "estimatedSaving": "pounds per month",
      "difficulty": "easy/medium/hard",
      "howTo": "step by step"
    }
  ],
  "positives": ["things they did well this month — celebrate good behaviour"],
  "warnings": ["things trending in the wrong direction"],
  "nextMonthTarget": "specific, measurable goal for next month"
}`

interface AnalyseRequest {
  cycleLabel: string
  totalIncome: number
  totalSpending: number
  essentialSpending: number
  discretionarySpending: number
  savingsRate: number
  // Category breakdown
  categories: { category: string; amount: number; txnCount: number }[]
  // Top merchants
  merchants: { merchant: string; amount: number; count: number; category: string }[]
  // Credit card vs debit breakdown
  cardBreakdown: { card: string; amount: number; count: number }[]
  // Salary flow
  salaryFlow?: {
    totalSalary: number
    creditCardPayments: number
    savingsContributions: number
    directDebits: number
    directSpending: number
  }
  // Category creep (if available)
  categoryCreep?: { category: string; current: number; average: number; pctChange: number }[]
  // Convenience spending
  convenienceTotal?: number
  convenienceItems?: { merchant: string; amount: number; count: number }[]
  // Previous analysis summary (for trend tracking)
  previousSummary?: string
  // Individual transactions for the cycle (top 50 by amount for detailed analysis)
  topTransactions?: { date: string; description: string; amount: number; category: string; account: string }[]
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    const data: AnalyseRequest = await req.json()

    // Build a rich context message from the structured data
    const parts: string[] = []

    parts.push(`# Monthly Analysis: ${data.cycleLabel}`)
    parts.push('')
    parts.push(`## Overview`)
    parts.push(`- Total Income: £${(data.totalIncome / 100).toFixed(2)}`)
    parts.push(`- Total Spending: £${(data.totalSpending / 100).toFixed(2)}`)
    parts.push(`- Essential: £${(data.essentialSpending / 100).toFixed(2)}`)
    parts.push(`- Discretionary: £${(data.discretionarySpending / 100).toFixed(2)}`)
    parts.push(`- Net: £${((data.totalIncome - data.totalSpending) / 100).toFixed(2)}`)
    parts.push(`- Savings Rate: ${data.savingsRate.toFixed(1)}%`)

    if (data.salaryFlow) {
      parts.push('')
      parts.push(`## Salary Flow`)
      parts.push(`- Total Salary: £${(data.salaryFlow.totalSalary / 100).toFixed(2)}`)
      parts.push(`- → Credit Card Payments: £${(data.salaryFlow.creditCardPayments / 100).toFixed(2)}`)
      parts.push(`- → Savings: £${(data.salaryFlow.savingsContributions / 100).toFixed(2)}`)
      parts.push(`- → Direct Debits: £${(data.salaryFlow.directDebits / 100).toFixed(2)}`)
      parts.push(`- → Debit Card Spend: £${(data.salaryFlow.directSpending / 100).toFixed(2)}`)
    }

    parts.push('')
    parts.push(`## Spending by Category`)
    for (const c of data.categories) {
      parts.push(`- ${c.category}: £${(c.amount / 100).toFixed(2)} (${c.txnCount} transactions)`)
    }

    parts.push('')
    parts.push(`## Top Merchants`)
    for (const m of data.merchants.slice(0, 25)) {
      parts.push(`- ${m.merchant}: £${(m.amount / 100).toFixed(2)} (${m.count}x) [${m.category}]`)
    }

    if (data.cardBreakdown.length > 0) {
      parts.push('')
      parts.push(`## Spending by Card`)
      for (const c of data.cardBreakdown) {
        parts.push(`- ${c.card}: £${(c.amount / 100).toFixed(2)} (${c.count} transactions)`)
      }
    }

    if (data.categoryCreep && data.categoryCreep.length > 0) {
      parts.push('')
      parts.push(`## Category Trends (vs 3-month average)`)
      for (const c of data.categoryCreep) {
        parts.push(`- ${c.category}: £${(c.current / 100).toFixed(2)} now vs £${(c.average / 100).toFixed(2)} avg (${c.pctChange > 0 ? '+' : ''}${c.pctChange.toFixed(0)}%)`)
      }
    }

    if (data.convenienceTotal && data.convenienceTotal > 0) {
      parts.push('')
      parts.push(`## Convenience Spending: £${(data.convenienceTotal / 100).toFixed(2)} total`)
      for (const i of (data.convenienceItems || [])) {
        parts.push(`- ${i.merchant}: £${(i.amount / 100).toFixed(2)} (${i.count}x)`)
      }
    }

    if (data.topTransactions && data.topTransactions.length > 0) {
      parts.push('')
      parts.push(`## Largest Transactions`)
      for (const t of data.topTransactions) {
        parts.push(`- ${t.date}: ${t.description} — £${(Math.abs(t.amount) / 100).toFixed(2)} [${t.category}] (${t.account})`)
      }
    }

    if (data.previousSummary) {
      parts.push('')
      parts.push(`## Previous Month Analysis`)
      parts.push(data.previousSummary)
    }

    const openai = getOpenAI()

    const completion = await withRetry(
      () =>
        openai.chat.completions.create({
          model: 'gpt-5.4',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: parts.join('\n') },
          ],
          temperature: 0.4,
          max_completion_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      {
        isRetryable: isRetryableOpenAIError,
        label: 'monthly-analysis',
      }
    )

    const raw = completion.choices[0]?.message?.content || '{}'

    try {
      const analysis = JSON.parse(raw)
      return NextResponse.json({ analysis, model: completion.model })
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
    }
  } catch (error) {
    console.error('[api/analyse]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
