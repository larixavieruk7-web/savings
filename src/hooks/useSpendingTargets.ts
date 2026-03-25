'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSpendingTargets, saveSpendingTargets } from '@/lib/storage';
import type { SpendingTarget } from '@/types';

export interface TargetProgress {
  spent: number;      // pence (absolute value)
  target: number;     // pence
  remaining: number;  // pence (positive = under budget, negative = over)
  pct: number;        // 0-100+
  status: 'on_track' | 'approaching' | 'exceeded';
}

export function useSpendingTargets(cycleId: string) {
  const [targets, setTargets] = useState<SpendingTarget[]>([]);
  const [loading, setLoading] = useState(true);

  // Load targets for the given cycle on mount / cycle change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getSpendingTargets(cycleId);
        if (!cancelled) setTargets(data);
      } catch (e) {
        console.error('Failed to load spending targets:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [cycleId]);

  // Save / upsert targets to storage
  const saveTargets = useCallback(
    async (incoming: SpendingTarget[]) => {
      try {
        await saveSpendingTargets(incoming);
        setTargets(incoming.filter((t) => t.cycleId === cycleId));
      } catch (e) {
        console.error('Failed to save spending targets:', e);
      }
    },
    [cycleId]
  );

  // Ask the AI to suggest targets for the current cycle
  const suggestTargets = useCallback(async () => {
    try {
      const res = await fetch('/api/advisor/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', cycleId }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const suggested: SpendingTarget[] = data.targets ?? [];
      if (suggested.length > 0) {
        // Merge AI suggestions with any existing user-set targets
        const userSet = targets.filter((t) => !t.aiSuggested);
        const userCategories = new Set(userSet.map((t) => t.category));
        const newSuggestions = suggested.filter((t) => !userCategories.has(t.category));
        const merged = [...userSet, ...newSuggestions];
        await saveTargets(merged);
        return merged;
      }
      return targets;
    } catch (e) {
      console.error('Failed to suggest targets:', e);
      return targets;
    }
  }, [cycleId, targets, saveTargets]);

  // Compute progress for a given category and current spend
  const getProgress = useCallback(
    (category: string, currentSpend: number): TargetProgress => {
      const target = targets.find((t) => t.category === category);
      const targetAmount = target?.targetAmount ?? 0;
      const spent = Math.abs(currentSpend); // ensure positive
      const remaining = targetAmount - spent;
      const pct = targetAmount > 0 ? Math.round((spent / targetAmount) * 100) : 0;

      let status: TargetProgress['status'] = 'on_track';
      if (pct > 100) {
        status = 'exceeded';
      } else if (pct > 80) {
        status = 'approaching';
      }

      return { spent, target: targetAmount, remaining, pct, status };
    },
    [targets]
  );

  // Quick-lookup map: category → SpendingTarget
  const targetMap = useMemo(() => {
    const map: Record<string, SpendingTarget> = {};
    for (const t of targets) {
      map[t.category] = t;
    }
    return map;
  }, [targets]);

  return { targets, loading, saveTargets, suggestTargets, getProgress, targetMap };
}
