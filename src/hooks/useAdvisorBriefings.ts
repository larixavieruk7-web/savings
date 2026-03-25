'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAdvisorBriefings, saveAdvisorBriefing, dismissAdvisorBriefing as dismissBriefingStorage } from '@/lib/storage';
import type { AdvisorBriefing } from '@/types';

export function useAdvisorBriefings(cycleId: string) {
  const [briefings, setBriefings] = useState<AdvisorBriefing[]>([]);
  const [loading, setLoading] = useState(true);

  // Load briefings for this cycle on mount / cycle change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getAdvisorBriefings(cycleId);
        if (!cancelled) setBriefings(data);
      } catch (e) {
        console.error('Failed to load advisor briefings:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [cycleId]);

  // Generate a new briefing by calling the API
  const generateBriefing = useCallback(
    async (
      type: AdvisorBriefing['type'],
      context: Record<string, unknown>
    ): Promise<AdvisorBriefing | null> => {
      try {
        const res = await fetch('/api/advisor/briefing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, cycleId, context }),
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();

        const newBriefing: AdvisorBriefing = {
          id: data.id ?? `briefing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId: data.userId ?? '',
          type,
          cycleId,
          briefing: data.briefing ?? data,
          dismissed: false,
          createdAt: data.createdAt ?? new Date().toISOString(),
        };

        // Save to storage
        await saveAdvisorBriefing(newBriefing);

        // Update local state
        setBriefings((prev) => [newBriefing, ...prev]);
        return newBriefing;
      } catch (e) {
        console.error('Failed to generate briefing:', e);
        return null;
      }
    },
    [cycleId]
  );

  // Dismiss a briefing
  const dismissBriefing = useCallback(
    async (id: string) => {
      try {
        await dismissBriefingStorage(id);

        setBriefings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, dismissed: true } : b))
        );
      } catch (e) {
        console.error('Failed to dismiss briefing:', e);
      }
    },
    []
  );

  // Check if a weekly check-in should be shown (last weekly > 5 days ago)
  const shouldShowWeeklyCheckin = useCallback((): boolean => {
    const weeklyBriefings = briefings
      .filter((b) => b.type === 'weekly' && !b.dismissed)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (weeklyBriefings.length === 0) return true;

    const lastWeekly = new Date(weeklyBriefings[0].createdAt);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    return lastWeekly < fiveDaysAgo;
  }, [briefings]);

  // Most recent non-dismissed briefing
  const latestBriefing = useMemo(() => {
    const active = briefings
      .filter((b) => !b.dismissed)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return active[0] ?? null;
  }, [briefings]);

  // Latest briefing by type
  const latestByType = useMemo(() => {
    const result: {
      upload?: AdvisorBriefing;
      weekly?: AdvisorBriefing;
      monthly?: AdvisorBriefing;
    } = {};

    const sorted = [...briefings].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );

    for (const b of sorted) {
      if (!b.dismissed && !result[b.type]) {
        result[b.type] = b;
      }
    }

    return result;
  }, [briefings]);

  return {
    briefings,
    loading,
    latestBriefing,
    latestByType,
    generateBriefing,
    dismissBriefing,
    shouldShowWeeklyCheckin,
  };
}
