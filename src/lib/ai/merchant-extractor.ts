/**
 * Extracts merchant/payee names from UK bank transaction descriptions.
 *
 * UK bank transactions follow predictable patterns like:
 *   "FASTER PAYMENT TO ACME LTD - REF: 12345"
 *   "DIRECT DEBIT - BT GROUP PLC"
 *   "CARD PAYMENT TO TESCO STORES"
 *
 * Extracted from Distil (haisem-app) supplier-extractor.ts — works standalone.
 */

const MERCHANT_PATTERNS: RegExp[] = [
  // Faster Payment / FPO / FP
  /^(?:FASTER\s+PAYMENT|FPO|FP)\s*(?:TO\s+)?(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // Direct Debit / DD
  /^(?:DIRECT\s+DEBIT|DD)\s*[-–]?\s+(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // Standing Order / STO
  /^(?:STANDING\s+ORDER|STO)\s*[-–]?\s+(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // Bank Payment / BP
  /^(?:BANK\s+PAYMENT|BP)\s+TO\s+(.+?)(?:\s+[-–]\s+(?:REF|REFERENCE).*)?$/i,
  // Card Payment / CP
  /^(?:CARD\s+PAYMENT|CP)\s+(?:TO\s+)?(.+?)(?:\s+ON\s+\d.*)?$/i,
  // Card Transaction (NatWest)
  /^CARD\s+TRANSACTION\s+\d+\s+\d+\w+\d+\s+(.+?)(?:\s+\d{5,}.*|\s+INTERNET\s+\w+)?$/i,
  // BACS
  /^BACS\s+(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // CHAPS
  /^CHAPS\s+(?:TO\s+)?(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // Transfer / TFR
  /^(?:TRANSFER|TFR)\s+(?:TO\s+)?(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // Bill Payment / BGC
  /^(?:BILL\s+PAYMENT|BGC)\s+(?:FROM\s+)?(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // "PAYMENT TO" prefix
  /^PAYMENT\s+TO\s+(.+?)(?:\s+(?:REF|REFERENCE).*)?$/i,
  // OnLine Transaction (NatWest)
  /^(?:ON\s*LINE\s+TRANSACTION|ONLINE\s+TXN)\s+(?!(?:FROM|TO)\s+A\/C)(.+?)(?:\s+(?:VIA|TPP|FP)\s.*)?$/i,
  // Automated Credit
  /^AUTOMATED\s+CREDIT\s+(?:\d+\s+)?(.+?)(?:\s+(?:FP|REF|REFERENCE|C[A-Z0-9]{10,}).*)?$/i,
]

const CLEANUP_PATTERNS: RegExp[] = [
  /\s+\d{6,}$/,
  /\s+[A-Z]{2}\d{6,}$/,
  /\s+\d{2}\/\d{2}$/,
  /\s+\d{2}-\d{2}-\d{4}$/,
  /\s*[-–]\s*$/,
  /\s+SPC$/i,
  /\s+CO$/i,
  /\s+[A-F0-9]{16,}.*$/i,
  /\s+\d{4,}\*{4,}\d{4}.*$/i,
  /\s+O\*[\d-]+.*$/i,
  /\s+\d{4}\s+[A-F0-9]{10,}.*$/i,
  /\s+\d{3,4}$/,
  /\s+A\/V$/i,
]

const NAME_CORRECTIONS: Record<string, string> = {
  'AMERICAN EXP': 'AMERICAN EXPRESS',
  'AMERICAN EXPRE': 'AMERICAN EXPRESS',
  'NATIONWIDE B S': 'NATIONWIDE',
  'NATIONWIDE BS': 'NATIONWIDE',
}

/**
 * Extract a merchant/payee name from a bank transaction description.
 * Returns null if no pattern matched.
 */
export function extractMerchantFromDescription(description: string): string | null {
  if (!description || typeof description !== 'string') return null
  const trimmed = description.trim()
  if (!trimmed) return null

  for (const pattern of MERCHANT_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match?.[1]) {
      let name = match[1].trim()

      for (const cleanup of CLEANUP_PATTERNS) {
        name = name.replace(cleanup, '').trim()
      }

      if (name.length < 2) continue
      if (/^\d+$/.test(name)) continue
      if (/^ACC-NWEST/i.test(name)) continue

      name = NAME_CORRECTIONS[name.toUpperCase()] || name
      return name
    }
  }

  return null
}
