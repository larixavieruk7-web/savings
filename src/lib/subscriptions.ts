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

/** Same merchant charged 2+ times in the same month on the same account */
export interface SameAccountDuplicate {
  merchant: string
  account: string
  month: string           // YYYY-MM when doubled
  chargeCount: number     // how many charges in that month
  totalAmount: number     // pence (total for that month)
  avgSingleCharge: number // pence (what one charge usually is)
}

export interface RecurringMerchant {
  merchant: string
  account: string
  monthCount: number
  avgAmountPence: number
}

export interface SubscriptionData {
  potentialDuplicates: PotentialDuplicate[]
  sameAccountDuplicates: SameAccountDuplicate[]
  recurringMerchants: RecurringMerchant[]
}

export function computeSubscriptionData(transactions: Transaction[]): SubscriptionData {
  const outflows = transactions.filter((t) => t.amount < 0)

  // normalised key → account → { months, amounts, displayName, monthCharges }
  const map = new Map<string, Map<string, {
    months: Set<string>;
    amounts: number[];
    displayName: string;
    monthCharges: Map<string, number[]>; // YYYY-MM → list of amounts
  }>>()

  for (const t of outflows) {
    const raw = (t.merchantName || t.description).slice(0, 60)
    const key = normaliseMerchant(raw)
    const account = t.accountName || t.source || 'Unknown'
    const month = t.date.slice(0, 7) // YYYY-MM

    if (!map.has(key)) map.set(key, new Map())
    const acctMap = map.get(key)!
    if (!acctMap.has(account)) {
      acctMap.set(account, {
        months: new Set(),
        amounts: [],
        displayName: raw.trim(),
        monthCharges: new Map(),
      })
    }
    const entry = acctMap.get(account)!
    entry.months.add(month)
    entry.amounts.push(Math.abs(t.amount))
    if (!entry.monthCharges.has(month)) entry.monthCharges.set(month, [])
    entry.monthCharges.get(month)!.push(Math.abs(t.amount))
  }

  const potentialDuplicates: PotentialDuplicate[] = []
  const sameAccountDuplicates: SameAccountDuplicate[] = []
  const recurringMerchants: RecurringMerchant[] = []

  for (const [, acctMap] of map.entries()) {
    const recurringAccounts: RecurringAccountEntry[] = []
    let displayName = ''

    for (const [account, data] of acctMap.entries()) {
      if (!displayName || data.displayName.length < displayName.length) {
        displayName = data.displayName
      }

      // Detect same-account duplicates: subscription merchant charged 2+ times in one month
      if (data.months.size >= 3) { // must be recurring (3+ months)
        const avg = Math.round(data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length)

        // Check each month for multiple charges
        for (const [month, charges] of data.monthCharges) {
          if (charges.length >= 2) {
            // Only flag if the individual charges are similar to the average (not a one-off large purchase)
            const similarCharges = charges.filter(
              (c) => Math.abs(c - avg) <= avg * 0.5
            )
            if (similarCharges.length >= 2) {
              sameAccountDuplicates.push({
                merchant: data.displayName,
                account,
                month,
                chargeCount: similarCharges.length,
                totalAmount: similarCharges.reduce((s, a) => s + a, 0),
                avgSingleCharge: avg,
              })
            }
          }
        }
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
  sameAccountDuplicates.sort((a, b) => b.totalAmount - a.totalAmount)
  recurringMerchants.sort((a, b) => b.avgAmountPence - a.avgAmountPence)

  return {
    potentialDuplicates,
    sameAccountDuplicates,
    recurringMerchants: recurringMerchants.slice(0, 40),
  }
}
