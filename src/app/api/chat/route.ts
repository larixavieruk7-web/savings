import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

const SYSTEM_PROMPT = `You are a personal finance advisor for a UK household (Larissa and Gus). You have access to their transaction data, spending patterns, and life events. Be specific with £ amounts. Give actionable advice. Be conversational and supportive.

Guidelines:
- Always reference actual numbers from the data provided
- Format currency as £X,XXX.XX
- Use bullet points and bold text for clarity
- When suggesting savings, be specific about which merchants or categories to target
- Consider the knowledge bank entries for context about their life events and goals
- If the data doesn't contain enough information to answer, say so honestly
- Keep responses concise but thorough — aim for 150-300 words unless more detail is needed`

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
}

function buildContextMessage(context: ChatContext): string {
  const parts: string[] = []

  if (context.totalIncome !== undefined || context.totalSpending !== undefined) {
    parts.push('## Overall Summary')
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
    parts.push('\n## Knowledge Bank (Life Events & Context)')
    for (const e of context.knowledgeEntries) {
      const tags = e.tags && e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : ''
      parts.push(`- [${e.date}] ${e.title}: ${e.description}${tags}`)
    }
  }

  return parts.length > 0
    ? `Here is the household's financial data:\n\n${parts.join('\n')}`
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
          model: 'gpt-4o',
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
