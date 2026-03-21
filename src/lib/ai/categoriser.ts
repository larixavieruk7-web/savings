/**
 * Personal finance AI categorisation engine.
 *
 * Sends transaction descriptions to GPT for category assignment.
 * Batches up to 150 transactions per call, runs batches in parallel.
 *
 * Adapted from Distil (haisem-app) bank-categoriser.ts — categories changed
 * from UK accounting to personal household spending categories.
 */

import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from './retry'

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

export interface TransactionInput {
  id: string
  description: string
  amount: number        // negative = money out, positive = money in
  merchant?: string | null
}

export interface CategorisationResult {
  id: string
  category: string
  isEssential: boolean  // true = need (rent, utilities), false = want (dining, entertainment)
}

const BATCH_SIZE = 150

// ─── Personal finance categories ──────────────────────────────────────────

const PERSONAL_CATEGORIES = `Essential spending:
- Rent / Mortgage: rent payments, mortgage, housing
- Utilities: gas, electric, water, council tax, waste
- Groceries: supermarkets (Tesco, Sainsbury's, Asda, Lidl, Aldi, Waitrose, M&S Food, Co-op, Iceland, Morrisons, Ocado)
- Insurance: home, car, life, health, pet, travel insurance
- Transport: train, bus, Tube/TfL, petrol/fuel, car tax, MOT, car parking
- Phone & Internet: mobile contracts, broadband, landline
- Childcare & Education: nursery, school fees, tutoring, school supplies
- Healthcare: dentist, optician, prescriptions, pharmacy, GP
- Debt Repayments: loan repayments, credit card payments, finance agreements

Discretionary spending:
- Dining Out: restaurants, cafes, coffee shops, pubs, takeaways, Deliveroo, Uber Eats, Just Eat
- Entertainment: cinema, theatre, concerts, Netflix, Spotify, Disney+, Amazon Prime, gaming, hobbies
- Shopping: clothes, shoes, electronics, Amazon, eBay, home furnishings, gifts
- Subscriptions: gym, magazines, apps, SaaS, membership clubs
- Personal Care: hairdresser, beauty, spa, barber
- Holidays & Travel: flights, hotels, Airbnb, holiday spending
- Drinks & Nights Out: bars, clubs, alcohol purchases

Financial:
- Savings & Investments: transfers to savings, ISAs, investments, pensions
- Transfers: inter-account transfers, payments to family
- Cash Withdrawals: ATM withdrawals
- Bank Charges: account fees, overdraft fees, card charges
- Charity: donations, charitable giving

Income:
- Salary: wages, salary, BACS from employer
- Benefits: tax credits, child benefit, universal credit
- Refunds: refunds, cashback, returns
- Other Income: interest, dividends, side income, rental income`

const SYSTEM_PROMPT = `You are a personal finance categorisation engine for UK households.
For each transaction below, assign ONE category and whether it is "essential" (need) or "discretionary" (want).

Categories:
${PERSONAL_CATEGORIES}

Rules:
- Negative amounts = money out (spending), positive = money in (income)
- Supermarket purchases = Groceries (even if they sell non-food items)
- Transfers to own accounts = Savings & Investments OR Transfers (depending on context)
- If genuinely unsure, set category to empty string
- "essential" = true for needs (housing, food, utilities, transport to work, insurance, healthcare, debt)
- "essential" = false for wants (dining out, entertainment, shopping, subscriptions, holidays)
- Income categories are always essential = false

Return JSON: { "categories": [{ "index": 0, "category": "...", "essential": true/false }, ...] }
Match each index to the transaction at that position in the input array.`

// ─── Batch categorisation ───────────────────────────────────────────────────

async function categoriseBatch(
  transactions: { description: string; direction: 'out' | 'in' }[],
): Promise<{ category: string; essential: boolean }[]> {
  const input = transactions.map((t, i) => `${i}. [${t.direction}] ${t.description}`)

  const response = await withRetry(
    () => getOpenAI().chat.completions.create({
      model: 'gpt-5-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Categorise these ${transactions.length} transactions:\n\n${input.join('\n')}` },
      ],
    }),
    { isRetryable: isRetryableOpenAIError, label: 'OpenAI.PersonalCategorise' },
  )

  const content = response.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(content)

  const results: { category: string; essential: boolean }[] = new Array(transactions.length)
    .fill(null)
    .map(() => ({ category: '', essential: false }))

  if (Array.isArray(parsed.categories)) {
    for (const item of parsed.categories) {
      if (typeof item.index === 'number' && item.index >= 0 && item.index < transactions.length) {
        results[item.index] = {
          category: item.category || '',
          essential: item.essential === true,
        }
      }
    }
  }

  return results
}

/**
 * Categorise transactions using GPT.
 * Returns { id, category, isEssential }[] for each input transaction.
 */
export async function categoriseTransactions(
  transactions: TransactionInput[],
): Promise<CategorisationResult[]> {
  if (transactions.length === 0) return []

  // Split into batches
  const batches: TransactionInput[][] = []
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    batches.push(transactions.slice(i, i + BATCH_SIZE))
  }

  console.log(`[categoriser] Categorising ${transactions.length} transactions in ${batches.length} batch(es)`)

  // Run all batches in parallel
  const batchResults = await Promise.all(
    batches.map(batch =>
      categoriseBatch(
        batch.map(t => ({
          description: t.merchant
            ? `${t.merchant} — ${t.description}`
            : t.description,
          direction: t.amount < 0 ? 'out' as const : 'in' as const,
        })),
      )
    ),
  )

  // Flatten results
  const results: CategorisationResult[] = []
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const categories = batchResults[batchIdx]

    for (let i = 0; i < batch.length; i++) {
      results.push({
        id: batch[i].id,
        category: categories[i].category,
        isEssential: categories[i].essential,
      })
    }
  }

  const categorised = results.filter(r => r.category).length
  console.log(`[categoriser] Categorised ${categorised}/${results.length} transactions`)
  return results
}
