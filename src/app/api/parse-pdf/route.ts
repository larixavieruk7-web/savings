import { NextRequest, NextResponse } from 'next/server'
// Import the lib directly to avoid pdf-parse's index.js which tries to load a test PDF
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse/lib/pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
import type { Transaction } from '@/types'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const PDF_MAGIC = '%PDF'

// ─── Shared helpers ─────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

/** Convert "DD MMM" or "DD MMM YYYY" to ISO date, using fallback year */
function toIsoDate(day: string, mon: string, year?: string, fallbackYear?: string): string {
  const mm = MONTH_MAP[mon.toUpperCase()]
  if (!mm) return ''
  const yyyy = year ?? fallbackYear ?? String(new Date().getFullYear())
  return `${yyyy}-${mm}-${day.padStart(2, '0')}`
}

function parsePence(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, '')) * 100)
}

// ─── NatWest PDF parsing ────────────────────────────────────────
//
// NatWest statement PDF format (current, savings, Mastercard):
//
//   Statement header contains:  "Period Covered DD MMM YYYY to DD MMM YYYY"
//   Column headers:             "Date Description Paid In(£) Withdrawn(£) Balance(£)"
//
//   Transaction lines:
//     DD MMM YYYY  BROUGHT FORWARD                               balance
//     DD MMM       description text              amount           balance
//     DD MMM       description text    amount                     balance
//
//   Credits (Paid In) show amount followed by " -" suffix
//   Multi-line descriptions are common (continuation lines have no date)
//   Date has year only on BROUGHT FORWARD line; subsequent lines use DD MMM only
//
// Mastercard variant:
//   Columns: "Trans Date | Post Date | Description | Amount"
//   Credits have trailing " -"
//   No Balance column

// Date at start of line: "DD MMM" or "DD MMM YYYY"
const DATE_RE = /^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{4}))?/i


function parseNatWestPdf(text: string): { transactions: Transaction[]; errors: string[]; accountName: string } {
  const errors: string[] = []
  const transactions: Transaction[] = []

  // Extract statement year from "Period Covered" header
  const periodMatch = text.match(/Period\s+Covered\s+\d{1,2}\s+\w{3}\s+(\d{4})\s+to\s+\d{1,2}\s+\w{3}\s+(\d{4})/i)
  const statementYear = periodMatch?.[2] ?? periodMatch?.[1] ?? String(new Date().getFullYear())

  // Detect account type from header
  let accountName = 'NatWest'
  const isMastercard = /MasterCard\s+Number/i.test(text)
  const isSavings = /FLEXIBLE SAVER|FIRST RESERVE|Savings/i.test(text)

  if (isMastercard) {
    const cardMatch = text.match(/MasterCard\s+Number\s+([\d\s]+)/i)
    const lastFour = cardMatch?.[1]?.replace(/\s/g, '').slice(-4) ?? ''
    accountName = lastFour ? `NatWest Mastercard (${lastFour})` : 'NatWest Mastercard'
  } else if (isSavings) {
    accountName = 'NatWest Savings'
  } else {
    accountName = 'NatWest Current'
  }

  const hasBalanceColumn = /Balance\(£\)/i.test(text)

  // NatWest PDF v1 text format:
  //   "DD MMM" starts a new date group
  //   " Description text  amount balance" — continuation with leading space
  //   Amounts appear at end of line: "8.00 168.68" or "3,555.13  3,608.81"
  //   Credits in Paid In column → balance increases
  //   For Mastercard: amounts have trailing " -" for credits

  const lines = text.split('\n')
  let currentDate = ''
  let inTransactionArea = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (!line) continue

    // Detect transaction area start
    if (/^Date\s+Description\s+/i.test(line)) {
      inTransactionArea = true
      continue
    }

    // Detect transaction area end
    if (/^RETSTMT/i.test(line) || /^National Westminster Bank/i.test(line)) {
      inTransactionArea = false
      continue
    }

    if (!inTransactionArea) continue

    // Capture BROUGHT FORWARD balance as starting point
    if (/BROUGHT FORWARD/i.test(line)) {
      const bfAmounts = [...line.matchAll(/([\d,]+\.\d{2})/g)]
      if (bfAmounts.length > 0) {
        const bfBalance = parsePence(bfAmounts[bfAmounts.length - 1][1])
        // Push a synthetic "opening balance" so sign detection works for first real txn
        if (transactions.length === 0) {
          transactions.push({
            id: '__bf__', date: currentDate || toIsoDate('01', 'JAN', undefined, statementYear),
            type: '', description: '__OPENING_BALANCE__', rawDescription: '',
            amount: 0, balance: bfBalance, category: 'Other',
            isRecurring: false, accountName, source: 'natwest', categorySource: 'rule',
          })
        }
      }
      continue
    }
    if (/^(Sub-Total|NEW BALANCE|Account Name|Page |Cardholder|MasterCard Number)/i.test(line)) continue
    if (/^(Trans\s|Post\s|Description\s|Date\s|Amount\s)/i.test(line)) continue

    // Check if line starts with a date
    const dateMatch = line.match(DATE_RE)
    if (dateMatch) {
      const day = dateMatch[1]
      const mon = dateMatch[2]
      const explicitYear = dateMatch[3]
      currentDate = toIsoDate(day, mon, explicitYear, statementYear)
    }

    if (!currentDate) continue

    // For Mastercard: line format is "DD MMM DD MMM refnum DESCRIPTION amount[-]"
    // For Current/Savings: line format is "DD MMM description paid_in withdrawn balance"
    // Continuation lines (no date) also contain descriptions + amounts

    // Collect the full text of this transaction (may span multiple lines)
    let fullText = dateMatch ? line.slice(dateMatch[0].length).trim() : line.trim()

    // For Mastercard, skip the post date if present
    if (isMastercard && dateMatch) {
      const postMatch = fullText.match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+/i)
      if (postMatch) fullText = fullText.slice(postMatch[0].length)
    }

    // Absorb continuation lines that are part of this transaction's description
    // (lines that don't have amounts and don't start with a date)
    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim()
      if (!next) break
      if (DATE_RE.test(next)) break
      // If next line has amounts at the end, it's likely a new transaction or the amount line
      if (/\d[\d,]*\.\d{2}\s*-?\s*$/.test(next)) {
        // This continuation line HAS amounts — absorb it (it's the amounts for our description)
        fullText += ' ' + next
        i++
        break
      }
      // Skip boilerplate
      if (/^(RETSTMT|National Westminster|Cardholder|BROUGHT|Sub-Total|NEW BALANCE|Account Name|Page )/i.test(next)) break
      // Skip currency conversion lines
      if (/^\d[\d,]*\.\d{2}\s+(INR|USD|EUR|AUD|CAD|CHF)\s/i.test(next)) {
        i++
        continue
      }
      // Absorb description continuation
      fullText += ' ' + next
      i++
    }

    // Extract amounts from the end of the combined text
    // Pattern: one or more amounts at the end, possibly with trailing " -" for credits
    const endAmounts = [...fullText.matchAll(/([\d,]+\.\d{2})\s*(-)?/g)]
    if (endAmounts.length === 0) continue

    // Description is everything before the first amount
    const firstAmtIdx = endAmounts[0].index ?? 0
    let description = fullText.slice(0, firstAmtIdx).trim()

    // For Mastercard: strip leading reference numbers
    if (isMastercard) {
      description = description.replace(/^\d{8,}\s+/, '')
    }

    if (!description || /^BROUGHT FORWARD$/i.test(description)) continue
    // Skip interest calculation/overdraft summary lines
    if (/^(Over £|Up to your|Overdraft Arrangements|Interest Rate|For charging)/i.test(description)) continue

    // Parse amounts
    let amountPence: number
    let balancePence: number

    if (hasBalanceColumn && endAmounts.length >= 2) {
      // Current/Savings: amounts are [txn_amount, balance] or [paid_in, withdrawn, balance]
      // The LAST amount is always the balance
      const balanceAmt = endAmounts[endAmounts.length - 1]
      balancePence = parsePence(balanceAmt[1])

      // The transaction amount is the first amount
      const txnAmt = endAmounts[0]
      const txnValue = parsePence(txnAmt[1])

      // Determine sign: compare balance with previous transaction's balance
      // If balance increased → credit (positive), if decreased → debit (negative)
      const prevBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0
      if (balancePence > prevBalance) {
        amountPence = txnValue // paid in (positive)
      } else {
        amountPence = -txnValue // withdrawn (negative)
      }
    } else if (isMastercard || !hasBalanceColumn) {
      // Mastercard: single amount, trailing " -" means credit
      const txnAmt = endAmounts[0]
      const txnValue = parsePence(txnAmt[1])
      const isCredit = txnAmt[2] === '-'
      amountPence = isCredit ? txnValue : -txnValue
      balancePence = 0
    } else {
      // Single amount with balance column — skip (likely a header/summary line)
      continue
    }

    if (amountPence === 0) continue

    const id = `natwest-pdf-${currentDate}-${amountPence}-${accountName}-${description.slice(0, 30)}`

    transactions.push({
      id,
      date: currentDate,
      type: '',
      description,
      rawDescription: description,
      amount: amountPence,
      balance: balancePence,
      category: 'Other',
      isRecurring: false,
      accountName,
      source: 'natwest',
      categorySource: 'rule',
    })
  }

  // Remove the synthetic opening balance entry
  const filtered = transactions.filter(t => t.id !== '__bf__')
  return { transactions: filtered, errors, accountName }
}

// ─── Amex PDF parsing ───────────────────────────────────────────
// (Kept for future use — no Amex PDFs seen yet in real data)

function parseAmexPdf(text: string): { transactions: Transaction[]; errors: string[]; accountName: string } {
  const errors: string[] = []
  const transactions: Transaction[] = []

  let cardMember = ''
  if (text.includes('MRS LARISSA') || text.includes('LARISSA DA SILVA')) cardMember = 'MRS LARISSA DA SILVA'
  else if (text.includes('G XAVIER') || text.includes('XAVIER DA SILVA')) cardMember = 'G XAVIER DA SILVA'

  let memberShort = 'Unknown'
  if (/LARISSA/i.test(cardMember)) memberShort = 'LARISSA'
  else if (/XAVIER|GUS/i.test(cardMember)) memberShort = 'GUS'
  const accountName = `Amex ${memberShort} (PDF)`

  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Match DD/MM/YYYY or DD MMM YYYY
    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
      || line.match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i)
    if (!dateMatch) continue

    let isoDate: string
    if (dateMatch[0].includes('/')) {
      isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    } else {
      isoDate = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3])
    }
    if (!isoDate) continue

    let rest = line.slice(dateMatch[0].length).trim()

    // Absorb continuation lines
    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim()
      if (!next || /^\d{2}[/\s]/.test(next)) break
      if (/^(Page|Statement|American Express|Total)/i.test(next)) break
      rest += ' ' + next
      i++
    }

    // Last amount in line
    const amountMatches = [...rest.matchAll(/-?([\d,]+\.\d{2})/g)]
    if (amountMatches.length === 0) continue

    const lastMatch = amountMatches[amountMatches.length - 1]
    const rawStr = lastMatch[0]
    const amountPounds = parseFloat(rawStr.replace(/,/g, ''))
    if (isNaN(amountPounds)) continue

    const lastIdx = lastMatch.index ?? 0
    const description = rest.slice(0, lastIdx).trim()
    if (!description) continue

    // FLIP sign: Amex positive = charge (money out) → negative
    const amountPence = Math.round(-amountPounds * 100)
    const id = `amex-pdf-${isoDate}-${amountPence}-${memberShort}-${description.slice(0, 25)}`

    transactions.push({
      id,
      date: isoDate,
      type: 'AMEX',
      description,
      rawDescription: description,
      amount: amountPence,
      balance: 0,
      category: 'Other',
      isRecurring: false,
      accountName,
      source: 'amex',
      categorySource: 'rule',
    })
  }

  return { transactions, errors, accountName }
}

// ─── Deterministic ID dedup ─────────────────────────────────────

function deduplicateIds(transactions: Transaction[]): Transaction[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const group = groups.get(t.id)
    if (group) group.push(t)
    else groups.set(t.id, [t])
  }

  const result: Transaction[] = []
  for (const [baseId, group] of groups) {
    if (group.length === 1) {
      result.push(group[0])
    } else {
      const sorted = [...group].sort((a, b) => a.description.localeCompare(b.description))
      for (let i = 0; i < sorted.length; i++) {
        result.push({ ...sorted[i], id: `${baseId}-${i + 1}` })
      }
    }
  }
  return result
}

// ─── Extract text from PDF using pdf-parse v1 ───────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdf(buffer)
  return result.text
}

// ─── Route handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const filename = (formData.get('filename') as string) ?? ''

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Validate PDF magic bytes
    const header = buffer.slice(0, 5).toString('ascii')
    if (!header.startsWith(PDF_MAGIC)) {
      return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 })
    }

    const text = await extractPdfText(buffer)

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'PDF appears to contain no readable text — try CSV export instead' },
        { status: 400 }
      )
    }

    // Detect bank format — filename is primary signal, text content is fallback
    // All NatWest statement PDFs (current, savings, Mastercard) contain "Natwest" or "NatWest"
    // Statement-- files from NatWest online banking are also NatWest, not Amex
    const fnLower = filename.toLowerCase()
    const textHasNatWest = /NatWest|National Westminster|Natwest/i.test(text)
    const textHasAmex = /American Express/i.test(text)

    const isNatWest = fnLower.includes('statementarchive')
      || fnLower.includes('statement--')
      || textHasNatWest
    const isAmex = !isNatWest && textHasAmex

    const detectedFormat = isNatWest ? 'natwest' : isAmex ? 'amex' : 'unknown'
    console.log('=== DETECTED FORMAT ===', detectedFormat, '| filename:', filename)

    let transactions: Transaction[]
    let errors: string[]
    let source: 'natwest' | 'amex'

    if (isNatWest) {
      const result = parseNatWestPdf(text)
      transactions = result.transactions
      errors = result.errors
      source = 'natwest'
      console.log(`=== NATWEST PARSED: ${transactions.length} transactions, ${errors.length} errors ===`)
      if (transactions.length > 0) {
        console.log('=== FIRST 3 TRANSACTIONS ===')
        transactions.slice(0, 3).forEach(t => console.log(`  ${t.date} | ${t.amount} | ${t.balance} | ${t.description.slice(0, 50)}`))
      }
    } else if (isAmex) {
      const result = parseAmexPdf(text)
      transactions = result.transactions
      errors = result.errors
      source = 'amex'
      console.log(`=== AMEX PARSED: ${transactions.length} transactions, ${errors.length} errors ===`)
    } else {
      return NextResponse.json(
        { error: 'Unrecognised PDF format — please use CSV export instead' },
        { status: 400 }
      )
    }

    // Deduplicate IDs within the parsed set
    transactions = deduplicateIds(transactions)

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: 'No transactions found in this PDF — the format may not be supported', errors },
        { status: 400 }
      )
    }

    return NextResponse.json({ transactions, errors, source })
  } catch (error) {
    console.error('[api/parse-pdf]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF parsing failed' },
      { status: 500 }
    )
  }
}
