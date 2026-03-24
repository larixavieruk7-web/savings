// One-time migration from localStorage to Supabase.
// Safe to call on every app load — exits immediately if already done.
// On error: logs, reports via callback, returns false (migration_completed_at is NOT set,
// so the user can retry on next load).

import {
  backupLocalStorage,
  getMigrationProgress,
  setMigrationProgress,
  clearMigrationProgress,
  getLocalTransactions,
  getLocalCustomRules,
  getLocalSavingsTargets,
  getLocalKnowledgeEntries,
  getLocalMonthlyAnalyses,
  getLocalCustomColors,
  getLocalAccountNicknames,
  getLocalAccountTypes,
  getLocalDismissedRecommendations,
  getLocalInsightsCache,
} from '@/lib/storage-local'

import {
  isMigrationCompleted,
  markMigrationCompleted,
  updateUserSettings,
  upsertCategoryRules,
  upsertSavingsTargets,
  upsertKnowledgeEntries,
  insertNewTransactions,
  upsertMonthlyAnalysis,
} from './storage'

// ─── Public interface ─────────────────────────────────────────────

export interface MigrationProgress {
  status: 'idle' | 'checking' | 'migrating' | 'complete' | 'error'
  message: string
  current: number
  total: number
}

type ProgressCallback = (progress: MigrationProgress) => void

// ─── Helpers ──────────────────────────────────────────────────────

const TRANSACTION_BATCH_SIZE = 500

function report(
  onProgress: ProgressCallback | undefined,
  status: MigrationProgress['status'],
  message: string,
  current: number,
  total: number
): void {
  onProgress?.({ status, message, current, total })
}

/** Returns true if localStorage has any data worth migrating. */
function hasLocalData(): boolean {
  if (typeof window === 'undefined') return false
  return (
    getLocalTransactions().length > 0 ||
    getLocalCustomRules().length > 0 ||
    getLocalSavingsTargets().length > 0 ||
    getLocalKnowledgeEntries().length > 0 ||
    getLocalMonthlyAnalyses().length > 0
  )
}

// ─── Main export ──────────────────────────────────────────────────

/**
 * Run the one-time localStorage → Supabase migration if needed.
 *
 * Returns true  → migration ran and completed successfully.
 * Returns false → already done, nothing to migrate, or an error occurred.
 *
 * Progress is reported via the optional callback so callers can render a
 * progress bar or status message.
 */
export async function runMigrationIfNeeded(
  onProgress?: ProgressCallback
): Promise<boolean> {
  // 1. Check completion flag in Supabase user_settings
  report(onProgress, 'checking', 'Checking migration status…', 0, 0)

  let completed: boolean
  try {
    completed = await isMigrationCompleted()
  } catch (err) {
    console.error('[migration] isMigrationCompleted error:', err)
    report(onProgress, 'error', 'Could not check migration status.', 0, 0)
    return false
  }

  if (completed) {
    return false
  }

  // 2. Check if there is anything to migrate
  if (!hasLocalData()) {
    // Fresh user — mark completed so we skip this check in future loads
    try {
      await markMigrationCompleted()
    } catch (err) {
      console.error('[migration] markMigrationCompleted (fresh user) error:', err)
    }
    return false
  }

  // ── From here we have real data to migrate ──────────────────────

  // Snapshot totals for progress reporting
  const allTransactions = getLocalTransactions()
  const allRules = getLocalCustomRules()
  const allTargets = getLocalSavingsTargets()
  const allKnowledge = getLocalKnowledgeEntries()
  const allAnalyses = getLocalMonthlyAnalyses()

  const txBatches = Math.ceil(allTransactions.length / TRANSACTION_BATCH_SIZE)

  // Each "unit" of progress:
  //   1  user settings
  //   1  category rules (one call regardless of count)
  //   1  savings targets
  //   1  knowledge entries
  //   N  transaction batches
  //   M  monthly analyses (one call per entry)
  const totalUnits =
    1 + 1 + 1 + 1 + txBatches + allAnalyses.length

  let current = 0

  report(onProgress, 'migrating', 'Backing up local data…', current, totalUnits)

  // 3. Backup before touching anything
  backupLocalStorage()

  try {
    // ── Step 1: User settings ──────────────────────────────────────
    report(onProgress, 'migrating', 'Migrating settings…', current, totalUnits)

    const insightsCache = getLocalInsightsCache()
    const ok1 = await updateUserSettings({
      custom_colors: getLocalCustomColors(),
      account_nicknames: getLocalAccountNicknames(),
      account_types: getLocalAccountTypes(),
      dismissed_recommendations: getLocalDismissedRecommendations(),
      insights_cache: insightsCache ?? null,
    })
    if (!ok1) throw new Error('Failed to migrate user settings')
    current++
    report(onProgress, 'migrating', 'Settings migrated.', current, totalUnits)

    // ── Step 2: Category rules ─────────────────────────────────────
    report(onProgress, 'migrating', 'Migrating category rules…', current, totalUnits)
    if (allRules.length > 0) {
      const ok2 = await upsertCategoryRules(allRules)
      if (!ok2) throw new Error('Failed to migrate category rules')
    }
    current++
    report(onProgress, 'migrating', `${allRules.length} category rules migrated.`, current, totalUnits)

    // ── Step 3: Savings targets ────────────────────────────────────
    report(onProgress, 'migrating', 'Migrating savings targets…', current, totalUnits)
    if (allTargets.length > 0) {
      const ok3 = await upsertSavingsTargets(allTargets)
      if (!ok3) throw new Error('Failed to migrate savings targets')
    }
    current++
    report(onProgress, 'migrating', `${allTargets.length} savings targets migrated.`, current, totalUnits)

    // ── Step 4: Knowledge entries ──────────────────────────────────
    report(onProgress, 'migrating', 'Migrating knowledge entries…', current, totalUnits)
    if (allKnowledge.length > 0) {
      const ok4 = await upsertKnowledgeEntries(allKnowledge)
      if (!ok4) throw new Error('Failed to migrate knowledge entries')
    }
    current++
    report(onProgress, 'migrating', `${allKnowledge.length} knowledge entries migrated.`, current, totalUnits)

    // ── Step 5: Transactions (batched, resumable) ──────────────────
    const savedProgress = getMigrationProgress()
    const startBatch = savedProgress?.batchIndex ?? 0

    if (startBatch > 0) {
      // Resume — advance current to reflect already-done batches
      current += startBatch
      report(
        onProgress,
        'migrating',
        `Resuming transactions from batch ${startBatch + 1} of ${txBatches}…`,
        current,
        totalUnits
      )
    }

    for (let i = startBatch; i < txBatches; i++) {
      const batchStart = i * TRANSACTION_BATCH_SIZE
      const batch = allTransactions.slice(batchStart, batchStart + TRANSACTION_BATCH_SIZE)

      report(
        onProgress,
        'migrating',
        `Uploading transactions… batch ${i + 1} of ${txBatches}`,
        current,
        totalUnits
      )

      const ok5 = await insertNewTransactions(batch)
      if (!ok5) throw new Error(`Failed to migrate transaction batch ${i + 1}`)

      current++
      setMigrationProgress(i + 1) // save next batch index to resume from
      report(
        onProgress,
        'migrating',
        `Transactions: ${Math.min((i + 1) * TRANSACTION_BATCH_SIZE, allTransactions.length)} / ${allTransactions.length}`,
        current,
        totalUnits
      )
    }

    // ── Step 6: Monthly analyses ───────────────────────────────────
    for (let i = 0; i < allAnalyses.length; i++) {
      const entry = allAnalyses[i]
      report(
        onProgress,
        'migrating',
        `Migrating monthly analyses… ${i + 1} of ${allAnalyses.length}`,
        current,
        totalUnits
      )

      const ok6 = await upsertMonthlyAnalysis(entry.cycleId, entry.analysis)
      if (!ok6) throw new Error(`Failed to migrate analysis for cycle ${entry.cycleId}`)

      current++
    }

    // ── Step 7: Mark completed ─────────────────────────────────────
    report(onProgress, 'migrating', 'Finalising migration…', current, totalUnits)
    const markedOk = await markMigrationCompleted()
    if (!markedOk) throw new Error('Failed to mark migration as completed')

    // ── Step 8: Clear resume state ─────────────────────────────────
    clearMigrationProgress()

    report(onProgress, 'complete', 'Migration complete.', totalUnits, totalUnits)
    return true
  } catch (err) {
    console.error('[migration] Migration failed:', err)
    const message = err instanceof Error ? err.message : 'Unknown migration error'
    report(onProgress, 'error', message, current, totalUnits)
    // Do NOT call markMigrationCompleted — allow retry on next load
    return false
  }
}
