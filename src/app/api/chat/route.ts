import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

const SYSTEM_PROMPT = `You are the personal financial advisor for Gus and Larissa's household. You have direct access to their real transaction data, health scorecard, spending targets, commitments, and intelligence signals. You are NOT a chatbot — you are their advisor.

PERSONALITY:
- Celebrate wins genuinely. "Groceries down 8% — the meal planning is paying off."
- Push back HARD on bad patterns. No sugarcoating. "Dining out: £480 against a £300 target. Third month in a row. Something needs to change."
- Be specific ALWAYS. Never say "consider reducing spending." Say "Deliveroo 12 times this month, £186. That's £2,232 annualised. Cook twice more per week."
- Reference their targets and commitments. "You committed to renegotiating Sky. Did you?"
- If savings rate is below target, mention it in every interaction until it improves.

ACCOUNTABILITY:
- You know their spending targets. Reference them in answers.
- You know their commitments. Follow up proactively.
- You know their history. Compare this month to last, and to 3 months ago.
- Track patterns over time. "This is the third month dining exceeded target."

PROACTIVE:
- Don't just answer the question. Also flag the most important thing they need to know.
- If category creep is happening, mention it even if they didn't ask.
- If a commitment is overdue, bring it up.
- If there's a quick win they haven't acted on, nudge them.

HARD RULES:
- NEVER suggest external apps or services. You ARE the tool.
- NEVER give generic advice. Every statement must reference their data.
- Format amounts as £X.XX from their actual figures.
- Keep responses under 200 words. Be direct, not thorough.
- Never say "I don't have enough information" if the data contains relevant sections.`

interface RecurringAccountEntry {
  account: string
  monthCount: number
  avgAmountPence: number
}

interface PotentialDuplicate {
  merchant: string
  accounts: RecurringAccountEntry[]
}

interface RecurringMerchant {
  merchant: string
  account: string
  monthCount: number
  avgAmountPence: number
}

interface ChatContext {
  categories?: { category: string; total: number }[]
  merchants?: { merchant: string; total: number; count: number }[]
  monthlyTotals?: { month: string; income: number; spending: number; net: number }[]
  knowledgeEntries?: { date: string; title: string; description: string; type: string; tags?: string[] }[]
  accountNicknames?: Record<string, string>
  totalIncome?: number
  totalSpending?: number
  essentialSpending?: number
  discretionarySpending?: number
  potentialDuplicateSubscriptions?: PotentialDuplicate[]
  recurringMerchants?: RecurringMerchant[]
  // Intelligence layer
  healthScorecard?: {
    overallScore: number
    verdict: string
    highlights: string[]
    warnings: string[]
    metrics: {
      savingsRate: number
      essentialRatio: number
      creepCount: number
      unaccountedPct: number
    }
  }
  categoryCreep?: { category: string; currentCycleSpend: number; rollingAverage: number; percentIncrease: number; trend: string }[]
  recommendations?: { severity: string; title: string; detail: string; potentialSaving: number; actionType: string }[]
  salaryFlow?: {
    totalSalary: number
    creditCardPayments: number
    savingsContributions: number
    directDebits: number
    directSpending: number
    creditCardSpending: number
    unaccounted: number
  }
  // Advisor system
  spendingTargets?: { category: string; targetAmount: number; spent: number; pct: number; status: string }[]
  activeCommitments?: { commitment: string; type: string; status: string; relatedCategory?: string; relatedMerchant?: string; dueCycleId?: string }[]
  overdueCommitments?: { commitment: string; type: string; dueCycleId?: string }[]
  recentBriefingSummary?: string
  savingsTrajectory?: { savedYTD: number; targetAnnual: number; projectedAnnual: number }
}

function buildContextMessage(context: ChatContext): string {
  const parts: string[] = []

  // --- SUBSCRIPTIONS FIRST (most specific, pre-computed) ---
  if (context.potentialDuplicateSubscriptions !== undefined) {
    if (context.potentialDuplicateSubscriptions.length > 0) {
      parts.push('## DUPLICATE SUBSCRIPTIONS DETECTED')
      parts.push('The following merchants are charging on MORE THAN ONE account:')
      for (const d of context.potentialDuplicateSubscriptions) {
        const accountLines = d.accounts.map(
          (a) => `${a.account} (£${(a.avgAmountPence / 100).toFixed(2)}/mo, ${a.monthCount} months)`
        )
        parts.push(`- ${d.merchant}: ${accountLines.join(' AND ')}`)
      }
    } else {
      parts.push('## Duplicate Subscriptions')
      parts.push('CONFIRMED: No merchants found charging on more than one account.')
    }
  }

  if (context.recurringMerchants && context.recurringMerchants.length > 0) {
    parts.push('\n## All Recurring Payments by Account')
    const byAccount: Record<string, RecurringMerchant[]> = {}
    for (const r of context.recurringMerchants) {
      if (!byAccount[r.account]) byAccount[r.account] = []
      byAccount[r.account].push(r)
    }
    for (const [account, merchants] of Object.entries(byAccount)) {
      parts.push(`\n### ${account}`)
      for (const m of merchants) {
        parts.push(`  - ${m.merchant}: £${(m.avgAmountPence / 100).toFixed(2)}/mo (${m.monthCount} months)`)
      }
    }
  }

  // --- INTELLIGENCE LAYER ---
  if (context.healthScorecard) {
    const s = context.healthScorecard
    parts.push('\n## Health Scorecard')
    parts.push(`- Overall Score: ${s.overallScore}/100 — "${s.verdict}"`)
    parts.push(`- Savings Rate: ${s.metrics.savingsRate.toFixed(1)}%`)
    parts.push(`- Essential Ratio: ${s.metrics.essentialRatio.toFixed(1)}%`)
    parts.push(`- Categories Creeping: ${s.metrics.creepCount}`)
    parts.push(`- Unaccounted: ${s.metrics.unaccountedPct.toFixed(1)}%`)
    if (s.highlights.length > 0) {
      parts.push('Highlights: ' + s.highlights.join('; '))
    }
    if (s.warnings.length > 0) {
      parts.push('WARNINGS: ' + s.warnings.join('; '))
    }
  }

  if (context.recommendations && context.recommendations.length > 0) {
    parts.push('\n## Active Recommendations (push back on these)')
    for (const r of context.recommendations) {
      const saving = r.potentialSaving > 0 ? ` (potential saving: £${(r.potentialSaving / 100).toFixed(2)}/cycle)` : ''
      parts.push(`- [${r.severity.toUpperCase()}] ${r.title}: ${r.detail}${saving}`)
    }
  }

  if (context.categoryCreep && context.categoryCreep.length > 0) {
    parts.push('\n## Category Trends (vs 3-cycle average)')
    for (const c of context.categoryCreep) {
      parts.push(`- ${c.category}: £${(c.currentCycleSpend / 100).toFixed(2)} this cycle (avg £${(c.rollingAverage / 100).toFixed(2)}, ${c.percentIncrease > 0 ? '+' : ''}${c.percentIncrease.toFixed(1)}% — ${c.trend})`)
    }
  }

  if (context.salaryFlow) {
    const f = context.salaryFlow
    parts.push('\n## Salary Flow (where salary went)')
    parts.push(`- Total Salary: £${(f.totalSalary / 100).toFixed(2)}`)
    parts.push(`- → Credit Card Payments: £${(f.creditCardPayments / 100).toFixed(2)}`)
    parts.push(`- → Savings: £${(f.savingsContributions / 100).toFixed(2)}`)
    parts.push(`- → Direct Debits: £${(f.directDebits / 100).toFixed(2)}`)
    parts.push(`- → Debit Card Spend: £${(f.directSpending / 100).toFixed(2)}`)
    parts.push(`- → Actual Credit Card Charges: £${(f.creditCardSpending / 100).toFixed(2)}`)
    parts.push(`- Unaccounted: £${(f.unaccounted / 100).toFixed(2)}`)
  }

  // --- SUMMARY ---
  if (context.totalIncome !== undefined || context.totalSpending !== undefined) {
    parts.push('\n## Overall Summary')
    if (context.totalIncome !== undefined) parts.push(`- Total Income: £${(context.totalIncome / 100).toFixed(2)}`)
    if (context.totalSpending !== undefined) parts.push(`- Total Spending: £${(context.totalSpending / 100).toFixed(2)}`)
    if (context.essentialSpending !== undefined) parts.push(`- Essential Spending: £${(context.essentialSpending / 100).toFixed(2)}`)
    if (context.discretionarySpending !== undefined) parts.push(`- Discretionary Spending: £${(context.discretionarySpending / 100).toFixed(2)}`)
  }

  if (context.categories && context.categories.length > 0) {
    parts.push('\n## Top Spending Categories')
    for (const c of context.categories) {
      parts.push(`- ${c.category}: £${(c.total / 100).toFixed(2)}`)
    }
  }

  if (context.merchants && context.merchants.length > 0) {
    parts.push('\n## Top Merchants')
    for (const m of context.merchants) {
      parts.push(`- ${m.merchant}: £${(m.total / 100).toFixed(2)} (${m.count} transactions)`)
    }
  }

  if (context.monthlyTotals && context.monthlyTotals.length > 0) {
    parts.push('\n## Monthly Breakdown')
    for (const m of context.monthlyTotals) {
      parts.push(`- ${m.month}: Income £${(m.income / 100).toFixed(2)}, Spending £${(m.spending / 100).toFixed(2)}, Net £${(m.net / 100).toFixed(2)}`)
    }
  }

  if (context.accountNicknames && Object.keys(context.accountNicknames).length > 0) {
    parts.push('\n## Account Names')
    for (const [raw, nick] of Object.entries(context.accountNicknames)) {
      parts.push(`- ${raw} → "${nick}"`)
    }
  }

  if (context.knowledgeEntries && context.knowledgeEntries.length > 0) {
    parts.push('\n## Knowledge Bank')
    for (const e of context.knowledgeEntries) {
      const tags = e.tags && e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : ''
      parts.push(`- [${e.date}] ${e.title}: ${e.description}${tags}`)
    }
  }

  // --- ADVISOR SYSTEM ---
  if (context.spendingTargets && context.spendingTargets.length > 0) {
    parts.push('\n## Spending Targets (this cycle)')
    for (const t of context.spendingTargets) {
      parts.push(`- ${t.category}: £${(t.spent / 100).toFixed(2)} / £${(t.targetAmount / 100).toFixed(2)} target (${t.pct}%, ${t.status})`)
    }
  }

  if (context.activeCommitments && context.activeCommitments.length > 0) {
    parts.push('\n## Active Commitments')
    const overdueIds = new Set(
      (context.overdueCommitments ?? []).map((c) => c.commitment)
    )
    for (const c of context.activeCommitments) {
      const overdueTag = overdueIds.has(c.commitment) ? '[OVERDUE] ' : ''
      const details: string[] = [`type: ${c.type}`]
      if (c.relatedCategory) details.push(`category: ${c.relatedCategory}`)
      if (c.relatedMerchant) details.push(`merchant: ${c.relatedMerchant}`)
      if (c.dueCycleId) details.push(`due: ${c.dueCycleId}`)
      parts.push(`- ${overdueTag}${c.commitment} (${details.join(', ')})`)
    }
  } else if (context.overdueCommitments && context.overdueCommitments.length > 0) {
    parts.push('\n## Overdue Commitments')
    for (const c of context.overdueCommitments) {
      parts.push(`- [OVERDUE] ${c.commitment} (type: ${c.type}, due: ${c.dueCycleId ?? 'unknown'})`)
    }
  }

  if (context.savingsTrajectory) {
    const s = context.savingsTrajectory
    parts.push('\n## Savings Trajectory')
    parts.push(`- Saved YTD: £${(s.savedYTD / 100).toFixed(2)}`)
    parts.push(`- Target Annual: £${(s.targetAnnual / 100).toFixed(2)}`)
    parts.push(`- Projected Annual: £${(s.projectedAnnual / 100).toFixed(2)} (at current pace)`)
  }

  if (context.recentBriefingSummary) {
    parts.push('\n## Recent Advisor Briefing')
    parts.push(context.recentBriefingSummary)
  }

  return parts.length > 0
    ? `HOUSEHOLD FINANCIAL DATA (answer only from this — do not add generic advice):\n\n${parts.join('\n')}`
    : 'No financial data is currently available. The user may need to upload bank statements first.'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    const { message, context, history } = await req.json() as {
      message: string
      context: ChatContext
      history?: ChatMessage[]
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const contextMessage = buildContextMessage(context || {})

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextMessage },
    ]

    // Add conversation history (last 10 exchanges to keep token usage reasonable)
    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-20) // 10 exchanges = 20 messages
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add the current message
    messages.push({ role: 'user', content: message })

    const openai = getOpenAI()

    const completion = await withRetry(
      () =>
        openai.chat.completions.create({
          model: 'gpt-5',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      {
        isRetryable: isRetryableOpenAIError,
        label: 'chat-completion',
      }
    )

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.'

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('[api/chat]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat request failed' },
      { status: 500 }
    )
  }
}
