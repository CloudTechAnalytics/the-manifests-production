'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';

/**
 * Live per-department counters (item 18) — how many shipments are
 * currently sitting "in progress" at each stage of the 12-stage
 * lifecycle (migration 053), sourced from shipment_stages rather than
 * inventing a 4th status vocabulary. Delivered/Completed instead count
 * shipments whose overall status has actually reached that milestone
 * (a stage being "in_progress" doesn't apply to a terminal state).
 * Self-contained, same live-query pattern as use-notifications.ts.
 */
export interface ShipmentStageCounts {
  planning: number;
  documentation: number;
  awaitingCustoms: number;
  customsClearance: number;
  terminalProcessing: number;
  cargoExamination: number;
  released: number;
  transport: number;
  delivered: number;
  completed: number;
}

const EMPTY_COUNTS: ShipmentStageCounts = {
  planning: 0,
  documentation: 0,
  awaitingCustoms: 0,
  customsClearance: 0,
  terminalProcessing: 0,
  cargoExamination: 0,
  released: 0,
  transport: 0,
  delivered: 0,
  completed: 0,
};

const STAGE_KEY_MAP: Record<string, keyof ShipmentStageCounts> = {
  planning: 'planning',
  documentation: 'documentation',
  regulatory_compliance: 'awaitingCustoms',
  customs_clearance: 'customsClearance',
  terminal_operations: 'terminalProcessing',
  cargo_examination: 'cargoExamination',
  released: 'released',
  transportation: 'transport',
};

export function useShipmentStageCounts() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;
  const [counts, setCounts] = useState<ShipmentStageCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let stageQuery = supabase
        .from('shipment_stages')
        .select('stage_key, shipments!inner(deleted_at, branch_id, status)')
        .eq('status', 'in_progress')
        .in('stage_key', Object.keys(STAGE_KEY_MAP))
        .is('shipments.deleted_at', null);
      if (!isAdmin && branchId) stageQuery = stageQuery.eq('branch_id', branchId);

      let shipmentQuery = supabase
        .from('shipments')
        .select('status')
        .is('deleted_at', null)
        .in('status', ['delivered', 'completed']);
      if (!isAdmin && branchId) shipmentQuery = shipmentQuery.eq('branch_id', branchId);

      const [{ data: stageRows, error: stageError }, { data: shipmentRows, error: shipmentError }] =
        await Promise.all([stageQuery, shipmentQuery]);

      if (stageError) console.error('Error loading stage counts:', stageError);
      if (shipmentError) console.error('Error loading delivered/completed counts:', shipmentError);

      const next: ShipmentStageCounts = { ...EMPTY_COUNTS };
      (stageRows ?? []).forEach((row: { stage_key: string }) => {
        const key = STAGE_KEY_MAP[row.stage_key];
        if (key) next[key] += 1;
      });
      (shipmentRows ?? []).forEach((row: { status: string }) => {
        if (row.status === 'delivered') next.delivered += 1;
        if (row.status === 'completed') next.completed += 1;
      });
      setCounts(next);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return { counts, loading, refresh: load };
}
