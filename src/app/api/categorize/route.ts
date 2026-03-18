import { NextRequest, NextResponse } from 'next/server'
import { categoriseTransactions } from '@/lib/ai/categoriser'

export async function POST(req: NextRequest) {
  try {
    const { transactions } = await req.json()

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json({ error: 'transactions array required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    const results = await categoriseTransactions(transactions)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('[api/categorize]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Categorization failed' },
      { status: 500 }
    )
  }
}
