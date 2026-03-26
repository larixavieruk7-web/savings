import { NextRequest, NextResponse } from 'next/server'
import { categoriseTransactions } from '@/lib/ai/categoriser'

export async function POST(req: NextRequest) {
  try {
    const { transactions } = await req.json()

    console.log(`[api/categorize] 📥 Received ${Array.isArray(transactions) ? transactions.length : 'non-array'} transactions`)

    if (!transactions || !Array.isArray(transactions)) {
      console.error('[api/categorize] ❌ transactions is not an array')
      return NextResponse.json({ error: 'transactions array required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('[api/categorize] ❌ OPENAI_API_KEY not set')
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    if (transactions.length > 0) {
      console.log(`[api/categorize] 📋 Sample tx[0]:`, JSON.stringify(transactions[0]))
    }

    const results = await categoriseTransactions(transactions)
    const categorised = results.filter(r => r.category && r.category !== 'Other').length
    const empty = results.filter(r => !r.category).length
    console.log(`[api/categorize] ✅ Done: ${categorised} categorised, ${empty} empty, ${results.length - categorised - empty} other`)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[api/categorize] ❌ CAUGHT ERROR:', error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) console.error('[api/categorize] Stack:', error.stack)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Categorization failed' },
      { status: 500 }
    )
  }
}
