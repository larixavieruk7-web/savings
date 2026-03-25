'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAdvisorCommitments, saveAdvisorCommitment, updateAdvisorCommitment as updateCommitmentStorage } from '@/lib/storage';
import type { AdvisorCommitment } from '@/types';

export function useCommitments(cycleId?: string) {
  const [commitments, setCommitments] = useState<AdvisorCommitment[]>([]);
  const [loading, setLoading] = useState(true);

  // Load commitments on mount / cycle change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getAdvisorCommitments(cycleId);
        const filtered = data;
        if (!cancelled) setCommitments(filtered);
      } catch (e) {
        console.error('Failed to load commitments:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [cycleId]);

  // Add a new commitment
  const addCommitment = useCallback(
    async (
      commitment: Omit<AdvisorCommitment, 'id' | 'userId' | 'createdAt'>
    ) => {
      const newCommitment: AdvisorCommitment = {
        ...commitment,
        id: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: '', // will be set by storage layer / Supabase RLS
        createdAt: new Date().toISOString(),
      };

      try {
        await saveAdvisorCommitment(newCommitment);

        setCommitments((prev) => [newCommitment, ...prev]);
        return newCommitment;
      } catch (e) {
        console.error('Failed to add commitment:', e);
        return null;
      }
    },
    []
  );

  // Update fields on an existing commitment
  const updateCommitment = useCallback(
    async (id: string, fields: Partial<AdvisorCommitment>) => {
      try {
        await updateCommitmentStorage(id, fields);

        setCommitments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...fields } : c))
        );
      } catch (e) {
        console.error('Failed to update commitment:', e);
      }
    },
    []
  );

  // Mark a commitment as completed
  const completeCommitment = useCallback(
    async (id: string, outcome?: string) => {
      await updateCommitment(id, {
        status: 'completed',
        ...(outcome !== undefined ? { outcome } : {}),
      });
    },
    [updateCommitment]
  );

  // Defer a commitment to the next cycle
  const deferCommitment = useCallback(
    async (id: string) => {
      await updateCommitment(id, { status: 'deferred' });
    },
    [updateCommitment]
  );

  // Active commitments (status = 'active')
  const activeCommitments = useMemo(
    () => commitments.filter((c) => c.status === 'active'),
    [commitments]
  );

  // Overdue commitments: active commitments whose dueCycleId is before current cycleId
  // Cycle IDs are formatted 'cycle-YYYY-MM' so string comparison works for ordering
  const overdueCommitments = useMemo(() => {
    if (!cycleId) return [];
    return commitments.filter(
      (c) =>
        c.status === 'active' &&
        c.dueCycleId !== undefined &&
        c.dueCycleId < cycleId
    );
  }, [commitments, cycleId]);

  return {
    commitments,
    loading,
    activeCommitments,
    overdueCommitments,
    addCommitment,
    updateCommitment,
    completeCommitment,
    deferCommitment,
  };
}
