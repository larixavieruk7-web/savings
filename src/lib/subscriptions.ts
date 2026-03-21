import type { Transaction } from '@/types'

// Normalise a merchant name so the same service groups together across accounts.
// e.g. "DISNEY*PLUS GBR", "DISNEY PLUS 000123", "Disney+" all → "disney plus"
function normaliseMerchant(raw: string): string {
  let s = raw.trim()

  // Replace * and · with space (Amex uses * as separator)
  s = s.replace(/[*·]/g, ' ')

  // Replace trailing + with " plus" (Disney+, Apple+, ESPN+, etc.)
  s = s.replace(/\+(\s|$)/g, ' plus ')

  // Strip trailing country codes and locale suffixes
  s = s.replace(/\s+(?:GB|GBR|UK|US|USA|IE|AU|CA)(?:\s|$).*/i, '')

  // Strip trailing .com / .co.uk / .net
  s = s.replace(/\s*\.\s*(?:com|co\.uk|net|org|io).*$/i, '')

  // Strip corporate suffixes
  s = s.replace(/\s+(?:LTD|PLC|INC|LLC|CORP|CO|LIMITED|GROUP)\.?(?:\s|$).*/i, '')

  // Strip trailing reference numbers (6+ digits or hex codes)
  s = s.replace(/\s+[A-F0-9]{6,}\s*$/i, '')
  s = s.replace(/\s+\d{4,}\s*$/g, '')

  // Collapse whitespace and lowercase
  s = s.replace(/\s+/g, ' ').trim().toLowerCase()

  return s || raw.toLowerCase().trim()
}

export interface RecurringAccountEntry {
  account: string
  monthCount: number
  avgAmountPence: number
}

export interface PotentialDuplicate {
  merchant: string
  accounts: RecurringAccountEntry[]
  wastedMonthlyPence: number // min account avg × (n accounts - 1)
}

export interface RecurringMerchant {
  merchant: string
  account: string
  monthCount: number
  avgAmountPence: number
}

export interface SubscriptionData {
  potentialDuplicates: PotentialDuplicate[]
  recurringMerchants: RecurringMerchant[]
}

export function computeSubscriptionData(transactions: Transaction[]): SubscriptionData {
  const outflows = transactions.filter((t) => t.amount < 0)

  // normalised key → account → { months, amounts, displayName }
  const map = new Map<string, Map<string, { months: Set<string>; amounts: number[]; displayName: string }>>()

  for (const t of outflows) {
    const raw = (t.merchantName || t.description).slice(0, 60)
    const key = normaliseMerchant(raw)
    const account = t.accountName || t.source || 'Unknown'
    const month = t.date.slice(0, 7) // YYYY-MM

    if (!map.has(key)) map.set(key, new Map())
    const acctMap = map.get(key)!
    if (!acctMap.has(account)) acctMap.set(account, { months: new Set(), amounts: [], displayName: raw.trim() })
    const entry = acctMap.get(account)!
    entry.months.add(month)
    entry.amounts.push(Math.abs(t.amount))
  }

  const potentialDuplicates: PotentialDuplicate[] = []
  const recurringMerchants: RecurringMerchant[] = []

  for (const [, acctMap] of map.entries()) {
    const recurringAccounts: RecurringAccountEntry[] = []
    // Use the shortest display name as the canonical label (usually the cleaner one)
    let displayName = ''

    for (const [account, data] of acctMap.entries()) {
      if (!displayName || data.displayName.length < displayName.length) {
        displayName = data.displayName
      }
      if (data.months.size >= 2) {
        const avg = Math.round(data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length)
        // < £500/month — filters out loan repayments, rent, etc.
        if (avg < 50000) {
          recurringAccounts.push({ account, monthCount: data.months.size, avgAmountPence: avg })
          recurringMerchants.push({ merchant: displayName, account, monthCount: data.months.size, avgAmountPence: avg })
        }
      }
    }

    if (recurringAccounts.length >= 2) {
      const minAvg = Math.min(...recurringAccounts.map((a) => a.avgAmountPence))
      const wastedMonthlyPence = minAvg * (recurringAccounts.length - 1)
      potentialDuplicates.push({ merchant: displayName, accounts: recurringAccounts, wastedMonthlyPence })
    }
  }

  potentialDuplicates.sort((a, b) => b.wastedMonthlyPence - a.wastedMonthlyPence)
  recurringMerchants.sort((a, b) => b.avgAmountPence - a.avgAmountPence)

  return {
    potentialDuplicates,
    recurringMerchants: recurringMerchants.slice(0, 40),
  }
}
