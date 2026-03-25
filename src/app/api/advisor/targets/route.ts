import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

const SYSTEM_PROMPT = `You are a financial advisor setting realistic spending targets for a UK household.

For each category, suggest a target that is 5-10% below the 3-cycle average. Be realistic \u2014 aggressive targets fail.

Rate each target's difficulty: 'easy' (5% cut), 'moderate' (5-10%), 'stretch' (>10%).

Give a brief rationale for each. Calculate an overall monthly savings target.

Format all amounts as pence (integers). Respond in valid JSON matching the schema provided.`

const RESPONSE_SCHEMA = `Respond with JSON matching this schema:
{
  "suggestions": [{ "category": "string", "suggestedTarget": "number (pence)", "rationale": "string", "difficulty": "easy|moderate|stretch" }],
  "overallSavingsTarget": "number (pence)",
  "message": "string"
}`

interface HistoricalCategory {
  category: string
  last3Cycles: number[]
  average: number
}

interface TargetSuggestRequest {
  action: 'suggest'
  cycleId: string
  historicalSpending: HistoricalCategory[]
}

function buildUserMessage(data: TargetSuggestRequest): string {
  const parts: string[] = []

  parts.push(`# Target Suggestions \u2014 Cycle ${data.cycleId}`)
  parts.push('')
  parts.push('## Historical Spending (last 3 cycles)')
  parts.push('')

  for (const cat of data.historicalSpending) {
    const cycleLabels = cat.last3Cycles
      .map((v, i) => `Cycle ${i + 1}: \u00a3${(v / 100).toFixed(2)}`)
      .join(', ')
    parts.push(`- ${cat.category}: ${cycleLabels} \u2014 Average: \u00a3${(cat.average / 100).toFixed(2)}`)
  }

  parts.push('')
  parts.push('---')
  parts.push(RESPONSE_SCHEMA)

  return parts.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    const data: TargetSuggestRequest = await req.json()

    if (data.action !== 'suggest') {
      return NextResponse.json(
        { error: `Invalid action: ${data.action}. Must be 'suggest'.` },
        { status: 400 },
      )
    }

    if (!data.cycleId || !data.historicalSpending || data.historicalSpending.length === 0) {
      return NextResponse.json(
        { error: 'cycleId and historicalSpending are required' },
        { status: 400 },
      )
    }

    const userMessage = buildUserMessage(data)
    const openai = getOpenAI()

    const completion = await withRetry(
      () =>
        openai.chat.completions.create({
          model: 'gpt-5',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      {
        isRetryable: isRetryableOpenAIError,
        label: 'advisor-targets-suggest',
      },
    )

    const raw = completion.choices[0]?.message?.content || '{}'

    try {
      const targets = JSON.parse(raw)
      return NextResponse.json({ targets, model: completion.model })
    } catch {
      // JSON parse failed — return raw text in wrapper
      return NextResponse.json({ rawText: raw, model: completion.model })
    }
  } catch (error) {
    console.error('[api/advisor/targets]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Target suggestion failed' },
      { status: 500 },
    )
  }
}
