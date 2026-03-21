import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

const SYSTEM_PROMPT = `You are a personal finance assistant built into Larissa and Gus's savings dashboard. You have direct access to their real transaction data — every answer must come from that data.

HARD RULES — never break these:
- NEVER suggest external apps, tools, or services (no Truebill, YNAB, Monzo, etc.) — you ARE the tool
- NEVER give generic financial advice — every statement must reference specific numbers, merchants, or accounts from the data
- NEVER say "I don't have enough information" if the data contains a relevant section — read the full context
- If a question is about subscriptions or duplicates, check the "Potential Duplicate Subscriptions" and "All Recurring Payments" sections — they are pre-computed from all transactions
- If data shows no duplicates, say exactly that: "I checked your transactions and found no merchants charging from multiple accounts"
- Format all amounts as £X.XX using the exact figures from the data
- Keep responses under 200 words — be direct, not thorough
- Never pad with suggestions that aren't grounded in the actual data shown

Context you have access to:
- Pre-computed duplicate subscription detection (merchants recurring on 2+ accounts)
- All recurring payments grouped by account
- Top spending categories and merchants
- Monthly income/spending/net breakdown
- Knowledge bank (life events, goals, context)`

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
