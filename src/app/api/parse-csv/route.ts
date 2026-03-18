import { NextRequest, NextResponse } from 'next/server'
import { parseCSV } from '@/lib/ai/csv-parser'

export async function POST(req: NextRequest) {
  try {
    const { csvText } = await req.json()

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'csvText string required' }, { status: 400 })
    }

    const result = await parseCSV(csvText)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/parse-csv]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'CSV parsing failed' },
      { status: 500 }
    )
  }
}
