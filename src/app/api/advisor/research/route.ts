import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

const SYSTEM_PROMPT = `You are a UK financial advisor researching savings opportunities for a specific household expense. The household is based in the UK.

Be SPECIFIC and ACTIONABLE:
- Name real UK providers, comparison sites, and current typical rates where relevant
- Give concrete steps they can take TODAY
- For utilities/energy: reference Ofgem price cap, Uswitch, Compare the Market
- For insurance: reference GoCompare, MoneySupermarket, Compare the Market
- For mortgages: reference mortgage brokers, L&C, Habito, current approximate rates
- For subscriptions: suggest specific alternatives or bundles
- For food delivery: suggest meal planning, batch cooking, or cheaper alternatives

Tone: Direct, practical, no fluff. You're their financially savvy friend who does the research for them.

Format all amounts as £X.XX. Respond in valid JSON matching the schema provided.`

const RESPONSE_SCHEMA = `Respond with JSON matching this schema:
{
  "summary": "string (2-3 sentence overview of the opportunity)",
  "alternatives": [
    {
      "provider": "string (specific UK provider name)",
      "estimatedCost": "string (e.g. '£25/month')",
      "saving": "string (e.g. 'Save £10/month vs current')"
    }
  ],
  "negotiationTips": ["string (specific tactics for getting a better deal)"],
  "actionSteps": ["string (concrete next steps, numbered)"],
  "researchLinks": ["string (specific comparison sites or provider URLs to check)"]
}`

interface ResearchRequest {
  merchant: string
  category?: string
  monthlyAmount: number   // pence
  months?: number
  context?: string        // e.g. "mortgage", "energy", "streaming"
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResearchRequest
    const { merchant, category, monthlyAmount, months, context } = body

    if (!merchant || !monthlyAmount) {
      return NextResponse.json(
        { error: 'merchant and monthlyAmount are required' },
        { status: 400 }
      )
    }

    const monthlyGBP = (monthlyAmount / 100).toFixed(2)
    const totalPaidGBP = months ? ((monthlyAmount * months) / 100).toFixed(2) : undefined

    const userMessage = [
      `Research savings for: ${merchant}`,
      category ? `Category: ${category}` : null,
      `Currently paying: £${monthlyGBP}/month`,
      months ? `Been paying for: ${months} months (total: £${totalPaidGBP})` : null,
      context ? `Context: ${context}` : null,
      '',
      'What alternatives, deals, or negotiation tactics could save money on this?',
      '',
      RESPONSE_SCHEMA,
    ].filter(Boolean).join('\n')

    const openai = getOpenAI()
    const result = await withRetry(
      async () => {
        const completion = await openai.chat.completions.create({
          model: 'gpt-5.4',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_completion_tokens: 800,
          response_format: { type: 'json_object' },
        })
        return completion.choices[0]?.message?.content ?? '{}'
      },
      { isRetryable: isRetryableOpenAIError, label: 'advisor-research' }
    )

    const parsed = JSON.parse(result)
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[advisor/research] error:', err)
    return NextResponse.json(
      { error: 'Failed to research savings' },
      { status: 500 }
    )
  }
}
