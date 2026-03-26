/**
 * Bank CSV/XLSX parser with GPT-based column detection.
 *
 * UK banks export CSVs in wildly different formats (Monzo, Starling, HSBC,
 * Barclays, NatWest, etc.). Instead of rigid column matching, we:
 *   1. Try rule-based detection for common header patterns
 *   2. Fall back to GPT to detect which columns map to date/description/amount
 *
 * Extracted from Distil (haisem-app) bank-csv-parser.ts — adapted for
 * personal finance use. Shares the same OPENAI_API_KEY.
 */

import OpenAI from 'openai'
import Papa from 'papaparse'
import { withRetry, isRetryableOpenAIError } from './retry'
import { extractMerchantFromDescription } from './merchant-extractor'

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

export interface ParsedTransaction {
  date: string | null
  description: string
  amount: number          // negative = money out, positive = money in
  balance: number | null
  merchant: string | null // extracted merchant/payee name
  lineIndex: number
}

export interface CSVParseResult {
  transactions: ParsedTransaction[]
  startDate: string | null
  endDate: string | null
  openingBalance: number | null
  closingBalance: number | null
}

interface ColumnMapping {
  dateCol: string
  descriptionCol: string
  debitCol: string | null
  creditCol: string | null
  amountCol: string | null
  balanceCol: string | null
}

// ─── File parsing ───────────────────────────────────────────────────────────

function parseCSVToRows(text: string): { headers: string[]; rows: string[][] } {
  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  const allRows = result.data as string[][]
  if (allRows.length < 2) return { headers: [], rows: [] }

  return { headers: allRows[0].map(h => String(h || '').trim()), rows: allRows.slice(1) }
}

// ─── GPT column detection ───────────────────────────────────────────────────

async function detectColumns(headers: string[], sampleRows: string[][]): Promise<ColumnMapping> {
  // Try rule-based detection first (fast, no API call)
  const ruleBased = tryRuleBasedDetection(headers)
  if (ruleBased) return ruleBased

  // Fall back to GPT
  const sampleData = [headers, ...sampleRows.slice(0, 5)]
    .map((row, i) => `${i === 0 ? 'Headers' : `Row ${i}`}: ${row.join(' | ')}`)
    .join('\n')

  const response = await withRetry(
    () => getOpenAI().chat.completions.create({
      model: 'gpt-5.4-nano',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a bank CSV format detector. Given column headers and sample data from a bank statement CSV, identify which columns contain:
- dateCol: the transaction date column (REQUIRED)
- descriptionCol: the transaction description/narrative column (REQUIRED)
- debitCol: money out column (null if combined amount column)
- creditCol: money in column (null if combined amount column)
- amountCol: combined amount column where negative=debit, positive=credit (null if separate debit/credit columns)
- balanceCol: running balance column (null if not present)

Return exact column header names as they appear. Return JSON: { "dateCol": "...", "descriptionCol": "...", "debitCol": "..." or null, "creditCol": "..." or null, "amountCol": "..." or null, "balanceCol": "..." or null }`
        },
        { role: 'user', content: sampleData },
      ],
    }),
    { isRetryable: isRetryableOpenAIError, label: 'OpenAI.CSVDetect' },
  )

  const content = response.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(content) as ColumnMapping

  if (!parsed.dateCol || !parsed.descriptionCol) {
    throw new Error('Could not detect required columns (date, description) in this CSV format')
  }
  if (!parsed.debitCol && !parsed.creditCol && !parsed.amountCol) {
    throw new Error('Could not detect amount columns (debit/credit or combined amount) in this CSV format')
  }

  return parsed
}

function tryRuleBasedDetection(headers: string[]): ColumnMapping | null {
  const h = headers.map(s => s.toLowerCase().trim())

  const dateIdx = h.findIndex(c =>
    /^(date|transaction date|trans\.?\s*date|posting date|value date)$/i.test(c)
  )
  if (dateIdx === -1) return null

  const descIdx = h.findIndex(c =>
    /^(description|narrative|details|transaction description|particulars|reference|memo|name)$/i.test(c)
  )
  if (descIdx === -1) return null

  const debitIdx = h.findIndex(c => /^(debit|money out|paid out|withdrawals?|payments?)$/i.test(c))
  const creditIdx = h.findIndex(c => /^(credit|money in|paid in|deposits?|receipts?)$/i.test(c))
  const amountIdx = h.findIndex(c => /^(amount|value)$/i.test(c))
  const balanceIdx = h.findIndex(c => /^(balance|running balance|available balance)$/i.test(c))

  if (debitIdx === -1 && creditIdx === -1 && amountIdx === -1) return null

  return {
    dateCol: headers[dateIdx],
    descriptionCol: headers[descIdx],
    debitCol: debitIdx >= 0 ? headers[debitIdx] : null,
    creditCol: creditIdx >= 0 ? headers[creditIdx] : null,
    amountCol: (debitIdx === -1 && creditIdx === -1 && amountIdx >= 0) ? headers[amountIdx] : null,
    balanceCol: balanceIdx >= 0 ? headers[balanceIdx] : null,
  }
}

// ─── Amount & date parsing ──────────────────────────────────────────────────

function parseAmount(val: string): number {
  if (!val || val.trim() === '' || val.trim() === '-') return 0
  const cleaned = val.replace(/[£$,\s]/g, '').trim()
  const parenMatch = cleaned.match(/^\((.+)\)$/)
  const numStr = parenMatch ? `-${parenMatch[1]}` : cleaned
  const n = parseFloat(numStr)
  return isNaN(n) ? 0 : n
}

function parseDate(val: string): string | null {
  if (!val || val.trim() === '') return null
  const s = val.trim()

  // DD/MM/YYYY or DD-MM-YYYY
  const ukDate = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (ukDate) {
    const d = parseInt(ukDate[1], 10)
    const m = parseInt(ukDate[2], 10)
    const y = parseInt(ukDate[3], 10)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // DD Mon YYYY (e.g., 15 Jan 2026)
  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const textDate = s.match(/^(\d{1,2})[\s\-.]?([a-z]{3})[\s\-.]?(\d{4})$/i)
  if (textDate) {
    const mon = monthNames[textDate[2].toLowerCase()]
    if (mon) return `${textDate[3]}-${mon}-${String(parseInt(textDate[1], 10)).padStart(2, '0')}`
  }

  // YYYY-MM-DD (ISO)
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`

  // Fallback: JS Date parse
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]

  return null
}

// ─── Transaction extraction ─────────────────────────────────────────────────

function extractTransactions(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
): ParsedTransaction[] {
  const colIndex = (name: string | null) => {
    if (!name) return -1
    return headers.findIndex(h => h === name)
  }

  const dateIdx = colIndex(mapping.dateCol)
  const descIdx = colIndex(mapping.descriptionCol)
  const debitIdx = colIndex(mapping.debitCol)
  const creditIdx = colIndex(mapping.creditCol)
  const amountIdx = colIndex(mapping.amountCol)
  const balanceIdx = colIndex(mapping.balanceCol)

  const transactions: ParsedTransaction[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(cell => !cell || cell.trim() === '')) continue

    const txnDate = parseDate(row[dateIdx] || '')
    if (!txnDate) continue

    const description = (row[descIdx] || '').trim()
    if (!description) continue

    let amount: number

    if (amountIdx >= 0) {
      // Combined amount column: negative = money out, positive = money in
      amount = parseAmount(row[amountIdx] || '')
    } else {
      const debit = Math.abs(parseAmount(row[debitIdx] || ''))
      const credit = Math.abs(parseAmount(row[creditIdx] || ''))
      // Money out is negative, money in is positive
      amount = credit > 0 ? credit : -debit
    }

    const balance = balanceIdx >= 0 ? parseAmount(row[balanceIdx] || '') : null
    const merchant = extractMerchantFromDescription(description)

    transactions.push({
      date: txnDate,
      description,
      amount,
      balance,
      merchant,
      lineIndex: i,
    })
  }

  return transactions
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Parse a bank CSV file into normalised transactions.
 *
 * 1. Parse CSV into headers + rows
 * 2. Detect column mapping (rule-based first, GPT fallback)
 * 3. Extract and normalise transactions
 * 4. Extract merchant names from descriptions
 */
export async function parseCSV(csvText: string): Promise<CSVParseResult> {
  const { headers, rows } = parseCSVToRows(csvText)

  if (headers.length === 0 || rows.length === 0) {
    throw new Error('No data found. Ensure the CSV has headers and at least one transaction row.')
  }

  console.log(`[csv-parser] Parsed ${rows.length} rows with ${headers.length} columns`)

  const mapping = await detectColumns(headers, rows)
  const transactions = extractTransactions(headers, rows, mapping)

  if (transactions.length === 0) {
    throw new Error('No valid transactions found. Check that the file contains transaction data with dates and amounts.')
  }

  const sorted = [...transactions]
    .filter(t => t.date)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const startDate = sorted.length > 0 ? sorted[0].date : null
  const endDate = sorted.length > 0 ? sorted[sorted.length - 1].date : null

  const withBalance = transactions.filter(t => t.balance !== null && t.balance !== 0)
  const openingBalance = withBalance.length > 0 ? withBalance[0].balance : null
  const closingBalance = withBalance.length > 0 ? withBalance[withBalance.length - 1].balance : null

  console.log(`[csv-parser] Extracted ${transactions.length} transactions (${startDate} to ${endDate})`)

  return { transactions, startDate, endDate, openingBalance, closingBalance }
}
