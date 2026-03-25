import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withRetry, isRetryableOpenAIError } from '@/lib/ai/retry'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

// ---------------------------------------------------------------------------
// System prompts by briefing type
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<string, string> = {
  upload: `You are reviewing a fresh batch of transactions just uploaded to a UK household's financial dashboard. Compare against their spending targets and previous cycle data.

Be IMMEDIATE and SPECIFIC:
- How much new spending was added
- Which categories are over/approaching target
- Any suspicious patterns (duplicates, unusual merchants, high single transactions)
- How this changes the month's trajectory

Tone: Direct. Celebrate if things look good. Push back if they don't.
Reference specific merchants and amounts. No hand-waving.
Format all amounts as \u00a3X.XX. Respond in valid JSON matching the schema provided.`,

  weekly: `You are doing a mid-week financial check-in for a UK household. This is NOT a full review \u2014 it's a quick status update to keep them on track.

Focus on:
- Spending velocity: are they on pace for their targets?
- Any notable transactions this week (high amounts, new merchants, patterns)
- One specific thing to watch for the rest of the week
- One positive if there is one

Keep it SHORT \u2014 100 words max. Think of it as a text from their accountant friend.
Tone: Casual but data-backed. No fluff.
Format all amounts as \u00a3X.XX. Respond in valid JSON matching the schema provided.`,

  monthly: `You are a prescriptive financial advisor delivering the monthly deep review for a UK household.

For each category target:
- Compare actual vs target. "Dining Out: \u00a3480 spent, \u00a3300 target, \u00a3180 over."
- If exceeded 2+ months running, escalate: "This is a pattern, not a one-off."
- If met or under, celebrate: "Transport: \u00a3185 vs \u00a3200. Well managed."

For each commitment:
- Follow up: "Last month I suggested renegotiating Sky. Did you call?"

Include:
- Overall month grade (A+ to F)
- Savings trajectory: YTD saved, projected annual, target annual
- Contract alerts: merchants charging 12+ months, suggest renegotiation
- Suggested targets for next cycle (5-10% below 3-month average)

Tone: Direct, accountable, data-grounded. Celebrate wins, push back hard on failures.
Format all amounts as \u00a3X.XX. Respond in valid JSON matching the schema provided.`,
}

// ---------------------------------------------------------------------------
// Response schemas appended to user message so GPT knows the expected format
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMAS: Record<string, string> = {
  upload: `Respond with JSON matching this schema:
{
  "headline": "string",
  "newSpendTotal": "number (pence)",
  "targetAlerts": [{ "category": "string", "spent": "number", "target": "number", "status": "on_track|approaching|exceeded", "message": "string" }],
  "suspiciousItems": [{ "description": "string", "amount": "number", "reason": "string" }],
  "quickWins": ["string"],
  "moodEmoji": "string"
}`,

  weekly: `Respond with JSON matching this schema:
{
  "headline": "string",
  "weekSpend": "number (pence)",
  "paceStatus": [{ "category": "string", "spent": "number", "target": "number", "projection": "number", "status": "on_track|watch|over" }],
  "notable": ["string"],
  "encouragement": "string",
  "watchItem": "string"
}`,

  monthly: `Respond with JSON matching this schema:
{
  "headline": "string",
  "monthGrade": "string (A+ to F)",
  "targetReport": [{ "category": "string", "target": "number", "actual": "number", "variance": "number", "verdict": "string", "trend": "string" }],
  "commitmentReview": [{ "commitment": "string", "status": "completed|missed|unknown", "followUp": "string" }],
  "savingsTrajectory": { "savedThisCycle": "number", "savedYTD": "number", "projectedAnnual": "number", "targetAnnual": "number", "message": "string" },
  "contractAlerts": [{ "merchant": "string", "monthlyAmount": "number", "months": "number", "suggestion": "string", "estimatedSaving": "string" }],
  "suggestedTargets": [{ "category": "string", "suggestedAmount": "number", "rationale": "string" }],
  "quickWins": ["string"],
  "warnings": ["string"]
}`,
}

// ---------------------------------------------------------------------------
// Build spending-summary context for GPT (never send raw transactions)
// ---------------------------------------------------------------------------

interface CategoryData {
  spent: number
  target: number
  txnCount: number
}

interface MerchantData {
  merchant: string
  amount: number
  count: number
}

interface TargetData {
  category: string
  targetAmount: number
  spent: number
}

interface CommitmentData {
  commitment: string
  status: string
  type: string
}

interface CategoryCreepItem {
  category: string
  currentCycleSpend: number
  rollingAverage: number
  percentIncrease: number
}

interface HealthScorecard {
  overallScore: number
  verdict: string
  highlights: string[]
  warnings: string[]
}

interface SavingsTrajectory {
  savedYTD: number
  targetAnnual: number
}

interface ContractAlertData {
  merchant: string
  monthlyAmount: number
  months: number
  totalPaid: number
  suggestion: string
  estimatedSaving: string
}

interface OverlappingServiceData {
  serviceType: string
  services: { merchant: string; monthlyAmount: number; account: string }[]
  totalMonthly: number
  suggestion: string
}

interface CategoryTrajectoryData {
  category: string
  spent: number
  projected: number
  target: number
  paceStatus: string
  message: string
}

interface YoYData {
  headline: string
  categoryChanges: { category: string; current: number; previous: number; difference: number; percentChange: number }[]
}

interface BriefingRequest {
  type: 'upload' | 'weekly' | 'monthly'
  cycleId: string
  currentCycleData: {
    totalIncome: number
    totalSpending: number
    byCategory: Record<string, CategoryData>
    topMerchants: MerchantData[]
  }
  targets?: TargetData[]
  commitments?: CommitmentData[]
  previousBriefing?: Record<string, unknown>
  categoryCreep?: CategoryCreepItem[]
  healthScorecard?: HealthScorecard
  savingsTrajectory?: SavingsTrajectory
  contractAlerts?: ContractAlertData[]
  overlappingServices?: OverlappingServiceData[]
  categoryTrajectory?: CategoryTrajectoryData[]
  yoyComparison?: YoYData
}

function buildUserMessage(data: BriefingRequest): string {
  const parts: string[] = []

  parts.push(`# ${data.type.toUpperCase()} Briefing — Cycle ${data.cycleId}`)
  parts.push('')

  // Overview
  const cd = data.currentCycleData
  parts.push('## Current Cycle Overview')
  parts.push(`- Total Income: \u00a3${(cd.totalIncome / 100).toFixed(2)}`)
  parts.push(`- Total Spending: \u00a3${(cd.totalSpending / 100).toFixed(2)}`)
  parts.push(`- Net: \u00a3${((cd.totalIncome + cd.totalSpending) / 100).toFixed(2)}`)
  parts.push('')

  // Category breakdown with targets
  parts.push('## Spending by Category')
  for (const [category, info] of Object.entries(cd.byCategory)) {
    const targetLine = info.target > 0
      ? ` (target: \u00a3${(info.target / 100).toFixed(2)}, ${Math.abs(info.spent) > info.target ? 'OVER' : 'under'})`
      : ''
    parts.push(`- ${category}: \u00a3${(Math.abs(info.spent) / 100).toFixed(2)} (${info.txnCount} txns)${targetLine}`)
  }
  parts.push('')

  // Top merchants
  if (cd.topMerchants.length > 0) {
    parts.push('## Top Merchants')
    for (const m of cd.topMerchants.slice(0, 15)) {
      parts.push(`- ${m.merchant}: \u00a3${(Math.abs(m.amount) / 100).toFixed(2)} (${m.count}x)`)
    }
    parts.push('')
  }

  // Targets
  if (data.targets && data.targets.length > 0) {
    parts.push('## Spending Targets')
    for (const t of data.targets) {
      const pct = t.targetAmount > 0 ? ((t.spent / t.targetAmount) * 100).toFixed(0) : 'N/A'
      parts.push(`- ${t.category}: \u00a3${(t.spent / 100).toFixed(2)} / \u00a3${(t.targetAmount / 100).toFixed(2)} (${pct}%)`)
    }
    parts.push('')
  }

  // Commitments (monthly type)
  if (data.commitments && data.commitments.length > 0) {
    parts.push('## Active Commitments')
    for (const c of data.commitments) {
      parts.push(`- [${c.status}] ${c.commitment} (${c.type})`)
    }
    parts.push('')
  }

  // Category creep
  if (data.categoryCreep && data.categoryCreep.length > 0) {
    parts.push('## Category Creep (vs rolling average)')
    for (const c of data.categoryCreep) {
      parts.push(`- ${c.category}: \u00a3${(c.currentCycleSpend / 100).toFixed(2)} now vs \u00a3${(c.rollingAverage / 100).toFixed(2)} avg (${c.percentIncrease > 0 ? '+' : ''}${c.percentIncrease.toFixed(1)}%)`)
    }
    parts.push('')
  }

  // Health scorecard
  if (data.healthScorecard) {
    const hs = data.healthScorecard
    parts.push('## Health Scorecard')
    parts.push(`- Score: ${hs.overallScore}/100 \u2014 "${hs.verdict}"`)
    if (hs.highlights.length > 0) parts.push(`- Highlights: ${hs.highlights.join('; ')}`)
    if (hs.warnings.length > 0) parts.push(`- Warnings: ${hs.warnings.join('; ')}`)
    parts.push('')
  }

  // Savings trajectory
  if (data.savingsTrajectory) {
    const st = data.savingsTrajectory
    parts.push('## Savings Trajectory')
    parts.push(`- Saved YTD: \u00a3${(st.savedYTD / 100).toFixed(2)}`)
    parts.push(`- Target Annual: \u00a3${(st.targetAnnual / 100).toFixed(2)}`)
    parts.push('')
  }

  // Contract alerts
  if (data.contractAlerts && data.contractAlerts.length > 0) {
    parts.push('## Contract Alerts (12+ month recurring charges)')
    for (const a of data.contractAlerts.slice(0, 5)) {
      parts.push(`- ${a.merchant}: \u00a3${(a.monthlyAmount / 100).toFixed(2)}/month for ${a.months} months (total paid: \u00a3${(a.totalPaid / 100).toFixed(2)}). ${a.suggestion} ${a.estimatedSaving}`)
    }
    parts.push('')
  }

  // Overlapping services
  if (data.overlappingServices && data.overlappingServices.length > 0) {
    parts.push('## Overlapping Services')
    for (const o of data.overlappingServices) {
      const svcs = o.services.map((s) => `${s.merchant} (\u00a3${(s.monthlyAmount / 100).toFixed(2)}/mo)`).join(', ')
      parts.push(`- ${o.serviceType}: ${svcs} — total \u00a3${(o.totalMonthly / 100).toFixed(2)}/month. ${o.suggestion}`)
    }
    parts.push('')
  }

  // Spending trajectory
  if (data.categoryTrajectory && data.categoryTrajectory.length > 0) {
    const alerts = data.categoryTrajectory.filter((t) => t.paceStatus === 'over' || t.paceStatus === 'watch')
    if (alerts.length > 0) {
      parts.push('## Spending Trajectory Alerts')
      for (const t of alerts) {
        parts.push(`- [${t.paceStatus.toUpperCase()}] ${t.message}`)
      }
      parts.push('')
    }
  }

  // Year-over-year comparison
  if (data.yoyComparison) {
    parts.push('## Year-over-Year Comparison')
    parts.push(data.yoyComparison.headline)
    if (data.yoyComparison.categoryChanges && data.yoyComparison.categoryChanges.length > 0) {
      parts.push('Biggest changes:')
      for (const c of data.yoyComparison.categoryChanges.slice(0, 5)) {
        const dir = c.difference > 0 ? '+' : ''
        parts.push(`- ${c.category}: \u00a3${(c.current / 100).toFixed(2)} vs \u00a3${(c.previous / 100).toFixed(2)} (${dir}${c.percentChange}%)`)
      }
    }
    parts.push('')
  }

  // Previous briefing summary
  if (data.previousBriefing) {
    parts.push('## Previous Briefing Summary')
    parts.push(JSON.stringify(data.previousBriefing, null, 2))
    parts.push('')
  }

  // Append response schema
  parts.push('---')
  parts.push(RESPONSE_SCHEMAS[data.type])

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    const data: BriefingRequest = await req.json()

    if (!data.type || !SYSTEM_PROMPTS[data.type]) {
      return NextResponse.json(
        { error: `Invalid briefing type: ${data.type}. Must be upload, weekly, or monthly.` },
        { status: 400 },
      )
    }

    if (!data.cycleId || !data.currentCycleData) {
      return NextResponse.json(
        { error: 'cycleId and currentCycleData are required' },
        { status: 400 },
      )
    }

    const systemPrompt = SYSTEM_PROMPTS[data.type]
    const userMessage = buildUserMessage(data)
    const openai = getOpenAI()

    const completion = await withRetry(
      () =>
        openai.chat.completions.create({
          model: 'gpt-5',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.5,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      {
        isRetryable: isRetryableOpenAIError,
        label: `advisor-briefing-${data.type}`,
      },
    )

    const raw = completion.choices[0]?.message?.content || '{}'

    try {
      const briefing = JSON.parse(raw)
      return NextResponse.json({ briefing, type: data.type, model: completion.model })
    } catch {
      // JSON parse failed — return raw text in wrapper
      return NextResponse.json({ rawText: raw, type: data.type, model: completion.model })
    }
  } catch (error) {
    console.error('[api/advisor/briefing]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Briefing generation failed' },
      { status: 500 },
    )
  }
}
