/**
 * Chat advisor tool definitions and executor.
 *
 * These tools let GPT take actions during conversation:
 * create knowledge entries, commitments, adjust targets, and record planned expenses.
 *
 * Executed server-side in /api/chat — uses the server Supabase client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI function-calling format)
// ---------------------------------------------------------------------------

export const ADVISOR_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_knowledge_entry',
      description:
        'Record a life event, financial context, goal, or note in the knowledge bank. Use when the user shares information about their life that affects spending (holidays, job changes, birthdays, car problems, etc.).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title, e.g. "Brazil flights booked"' },
          description: {
            type: 'string',
            description: 'Longer description with relevant financial context',
          },
          date: {
            type: 'string',
            description: 'ISO date (YYYY-MM-DD) — when this event is/was. Use today if not specified.',
          },
          type: {
            type: 'string',
            enum: ['event', 'context', 'goal', 'note'],
            description: 'Type of knowledge entry',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lowercase tags for filtering, e.g. ["travel", "larissa", "brazil"]',
          },
        },
        required: ['title', 'description', 'date', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_planned_expense',
      description:
        'Record a known upcoming expense with an expected amount. Use when the user mentions a future expense with a rough or exact amount (flights, car MOT, school fees, etc.). This helps the advisor adjust budget expectations and avoid false overspending alerts.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title, e.g. "Brazil flights"' },
          description: { type: 'string', description: 'Details about the expense' },
          expectedAmount: {
            type: 'number',
            description: 'Expected amount in PENCE (e.g. 150000 for £1,500). Always convert pounds to pence.',
          },
          expectedDate: {
            type: 'string',
            description: 'ISO date (YYYY-MM-DD) when the expense is expected',
          },
          expectedCategory: {
            type: 'string',
            description:
              'Spending category, e.g. "Holidays & Travel", "Transport", "Entertainment", "Healthcare"',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lowercase tags for filtering',
          },
        },
        required: ['title', 'description', 'expectedAmount', 'expectedDate', 'expectedCategory'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_commitment',
      description:
        'Create a tracked commitment/action item for the household. Use when the user agrees to take an action (reduce spending, call a provider, cancel a subscription, investigate an alternative, save a specific amount). The advisor will follow up on this in future briefings.',
      parameters: {
        type: 'object',
        properties: {
          commitment: {
            type: 'string',
            description: 'What the user commits to doing, e.g. "Call Sky to renegotiate broadband"',
          },
          type: {
            type: 'string',
            enum: ['reduce_spending', 'renegotiate', 'cancel', 'investigate', 'save', 'other'],
            description: 'Type of commitment',
          },
          relatedCategory: {
            type: 'string',
            description: 'Spending category this relates to, if applicable',
          },
          relatedMerchant: {
            type: 'string',
            description: 'Merchant this relates to, if applicable (e.g. "SKY")',
          },
          cycleId: {
            type: 'string',
            description: 'Salary cycle this commitment is due in (format: cycle-YYYY-MM). Use current cycle if not specified.',
          },
        },
        required: ['commitment', 'type', 'cycleId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_spending_target',
      description:
        'Adjust a spending target for a specific category in the current cycle. Use when the user asks to change a budget, or when a planned expense means a category needs a higher allowance this month.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Spending category to adjust, e.g. "Dining Out", "Holidays & Travel"',
          },
          targetAmount: {
            type: 'number',
            description: 'New target in PENCE (e.g. 30000 for £300). Always convert pounds to pence.',
          },
          cycleId: {
            type: 'string',
            description: 'Salary cycle ID (format: cycle-YYYY-MM)',
          },
          rationale: {
            type: 'string',
            description: 'Why the target is being adjusted — shown to user',
          },
        },
        required: ['category', 'targetAmount', 'cycleId', 'rationale'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Side effect record returned to client
// ---------------------------------------------------------------------------

export interface SideEffect {
  tool: string
  summary: string
  data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Tool executor — runs server-side in the API route
// ---------------------------------------------------------------------------

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ result: string; sideEffect: SideEffect }> {
  switch (name) {
    case 'add_knowledge_entry': {
      const id = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = new Date().toISOString()
      const { error } = await supabase.from('knowledge_entries').insert({
        id,
        user_id: userId,
        date: args.date as string,
        title: args.title as string,
        description: args.description as string,
        type: args.type as string,
        tags: (args.tags as string[]) || [],
        created_at: now,
      })
      if (error) throw new Error(`Failed to save knowledge entry: ${error.message}`)
      return {
        result: `Knowledge entry "${args.title}" saved successfully.`,
        sideEffect: {
          tool: 'add_knowledge_entry',
          summary: `Recorded: ${args.title}`,
          data: { id, title: args.title, type: args.type },
        },
      }
    }

    case 'add_planned_expense': {
      const id = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = new Date().toISOString()
      const { error } = await supabase.from('knowledge_entries').insert({
        id,
        user_id: userId,
        date: args.expectedDate as string,
        title: args.title as string,
        description: args.description as string,
        type: 'planned_expense',
        tags: (args.tags as string[]) || [],
        expected_amount: args.expectedAmount as number,
        expected_category: args.expectedCategory as string,
        expected_date: args.expectedDate as string,
        created_at: now,
      })
      if (error) throw new Error(`Failed to save planned expense: ${error.message}`)
      const amountGBP = ((args.expectedAmount as number) / 100).toFixed(2)
      return {
        result: `Planned expense "${args.title}" (£${amountGBP}, ${args.expectedCategory}) recorded for ${args.expectedDate}.`,
        sideEffect: {
          tool: 'add_planned_expense',
          summary: `Planned expense: ${args.title} — £${amountGBP}`,
          data: {
            id,
            title: args.title,
            expectedAmount: args.expectedAmount,
            expectedCategory: args.expectedCategory,
            expectedDate: args.expectedDate,
          },
        },
      }
    }

    case 'create_commitment': {
      const id = `commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = new Date().toISOString()
      const { error } = await supabase.from('advisor_commitments').insert({
        id,
        user_id: userId,
        cycle_id: args.cycleId as string,
        commitment: args.commitment as string,
        type: args.type as string,
        status: 'active',
        source: 'ai_suggested',
        related_category: (args.relatedCategory as string) || null,
        related_merchant: (args.relatedMerchant as string) || null,
        due_cycle_id: args.cycleId as string,
        created_at: now,
      })
      if (error) throw new Error(`Failed to save commitment: ${error.message}`)
      return {
        result: `Commitment created: "${args.commitment}" (due ${args.cycleId}).`,
        sideEffect: {
          tool: 'create_commitment',
          summary: `Commitment: ${args.commitment}`,
          data: { id, commitment: args.commitment, type: args.type, cycleId: args.cycleId },
        },
      }
    }

    case 'update_spending_target': {
      const cycleId = args.cycleId as string
      const category = args.category as string
      const targetAmount = args.targetAmount as number

      // Upsert — check if target exists for this cycle+category
      const { data: existing } = await supabase
        .from('spending_targets')
        .select('id')
        .eq('user_id', userId)
        .eq('cycle_id', cycleId)
        .eq('category', category)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('spending_targets')
          .update({ target_amount: targetAmount })
          .eq('id', existing.id)
        if (error) throw new Error(`Failed to update target: ${error.message}`)
      } else {
        const id = `target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const { error } = await supabase.from('spending_targets').insert({
          id,
          user_id: userId,
          cycle_id: cycleId,
          category,
          target_amount: targetAmount,
          ai_suggested: true,
          previous_actual: 0,
          rolling_average: 0,
          created_at: new Date().toISOString(),
        })
        if (error) throw new Error(`Failed to create target: ${error.message}`)
      }

      const amountGBP = (targetAmount / 100).toFixed(2)
      return {
        result: `Spending target for ${category} updated to £${amountGBP} for ${cycleId}. Rationale: ${args.rationale}`,
        sideEffect: {
          tool: 'update_spending_target',
          summary: `Target updated: ${category} → £${amountGBP}`,
          data: { category, targetAmount, cycleId, rationale: args.rationale },
        },
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
