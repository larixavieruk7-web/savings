import { NextRequest, NextResponse } from 'next/server'
import {
  computeSpendingSummary,
  detectAnomalies,
  generateSavingsSuggestions,
  type CategorisedTransaction,
} from '@/lib/ai/insights-engine'

export async function POST(req: NextRequest) {
  try {
    const { transactions } = await req.json()

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json({ error: 'transactions array required' }, { status: 400 })
    }

    // Compute statistical insights (no AI needed)
    const summary = computeSpendingSummary(transactions as CategorisedTransaction[])
    const anomalies = detectAnomalies(transactions as CategorisedTransaction[])

    // AI savings suggestions (requires OpenAI key)
    let suggestions: Awaited<ReturnType<typeof generateSavingsSuggestions>> = []
    if (process.env.OPENAI_API_KEY) {
      try {
        suggestions = await generateSavingsSuggestions(
          summary,
          transactions as CategorisedTransaction[]
        )
      } catch (err) {
        console.error('[api/insights] AI suggestions failed:', err)
      }
    }

    return NextResponse.json({ summary, anomalies, suggestions })
  } catch (error) {
    console.error('[api/insights]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Insights generation failed' },
      { status: 500 }
    )
  }
}
