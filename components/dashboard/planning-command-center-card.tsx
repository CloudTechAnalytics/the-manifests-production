'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { computeDemurrageRisk, computePlanningRisks } from '@/lib/utils/planning';
import type { Shipment, ShipmentCustoms, ShipmentTransportation, TerminalOperation } from '@/types';

interface StatTile {
  label: string;
  value: string | number;
}

function StatBlock({ label, value }: StatTile) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-serif text-xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Dashboard Integration (§15) — self-contained (own query, not threaded
 * through useDashboardData), same precedent as AwaitingOperationsCard /
 * FinancialExposureAlertCard, since none of these 10 metrics exist in
 * that shared hook today.
 */
export function PlanningCommandCenterCard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatTile[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let plansQuery = supabase
        .from('shipment_plans')
        .select('id, status, created_at, updated_at')
        .is('deleted_at', null);
      // estimated_departure is included even though only the second
      // (risk-computing) pass reads it — so this one fetch can serve
      // both passes and the card never needs a second, wider fetch of
      // the same shipment rows just to add that column.
      let shipmentsQuery = supabase
        .from('shipments')
        .select('id, branch_id, estimated_arrival, estimated_departure, booking_status')
        .eq('status', 'planning');
      if (!isAdmin && branchId) {
        plansQuery = plansQuery.eq('branch_id', branchId);
        shipmentsQuery = shipmentsQuery.eq('branch_id', branchId);
      }

      const [{ data: plans }, { data: planningShipments }] = await Promise.all([plansQuery, shipmentsQuery]);

      const planRows = plans ?? [];
      const shipmentRows =
        (planningShipments as Pick<
          Shipment,
          'id' | 'branch_id' | 'estimated_arrival' | 'estimated_departure' | 'booking_status'
        >[]) ?? [];
      const shipmentIds = shipmentRows.map((s) => s.id);

      const plansWaiting = planRows.filter((p) => p.status === 'planned').length;
      const plansInProgress = planRows.filter((p) => p.status === 'approved' || p.status === 'in_progress').length;
      const plansCompletedToday = planRows.filter(
        (p) => p.status === 'completed' && p.updated_at?.slice(0, 10) === today
      ).length;
      const upcomingEta = shipmentRows.filter(
        (s) => s.estimated_arrival && s.estimated_arrival >= today && s.estimated_arrival <= in7Days
      ).length;
      const bookingsPending = shipmentRows.filter((s) => (s.booking_status ?? 'pending') === 'pending').length;

      const completedLast30d = planRows.filter(
        (p) => p.status === 'completed' && p.updated_at && p.updated_at >= thirtyDaysAgo
      );
      const avgPlanningDays =
        completedLast30d.length > 0
          ? completedLast30d.reduce((sum, p) => {
              const days = (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
              return sum + days;
            }, 0) / completedLast30d.length
          : null;

      let containersAtRisk = 0;
      let documentsMissing = 0;
      let highRiskShipments = 0;
      let officerWorkloadPeak = 0;

      if (shipmentIds.length > 0) {
        const [{ data: containers }, { data: customsRows }, { data: terminalRows }, {
          data: transportRows,
        }, { data: checklistRows }, { data: assignmentRows }] = await Promise.all([
          supabase.from('shipment_containers').select('shipment_id').in('shipment_id', shipmentIds).is('deleted_at', null),
          supabase.from('shipment_customs').select('*').in('shipment_id', shipmentIds),
          supabase.from('terminal_operations').select('*').in('shipment_id', shipmentIds),
          supabase.from('shipment_transportation').select('*').in('shipment_id', shipmentIds).is('deleted_at', null),
          supabase.from('plan_document_checklist').select('status').in('shipment_id', shipmentIds).eq('status', 'not_received'),
          supabase.from('plan_assignments').select('assigned_to, status').in('shipment_id', shipmentIds).neq('status', 'completed'),
        ]);

        documentsMissing = checklistRows?.length ?? 0;

        const workloadByOfficer = new Map<string, number>();
        (assignmentRows ?? []).forEach((a) => {
          if (!a.assigned_to) return;
          workloadByOfficer.set(a.assigned_to, (workloadByOfficer.get(a.assigned_to) ?? 0) + 1);
        });
        officerWorkloadPeak = Math.max(0, ...Array.from(workloadByOfficer.values()));

        const terminalByShipment = new Map<string, TerminalOperation>();
        (terminalRows as TerminalOperation[] | null)?.forEach((t) => terminalByShipment.set(t.shipment_id, t));
        containersAtRisk = Array.from(terminalByShipment.values()).filter(
          (t) => computeDemurrageRisk(t.free_time_expiry) !== 'green'
        ).length;

        const customsByShipment = new Map<string, ShipmentCustoms>();
        (customsRows as ShipmentCustoms[] | null)?.forEach((c) => customsByShipment.set(c.shipment_id, c));
        const transportByShipment = new Map<string, ShipmentTransportation[]>();
        (transportRows as ShipmentTransportation[] | null)?.forEach((t) => {
          const list = transportByShipment.get(t.shipment_id) ?? [];
          list.push(t);
          transportByShipment.set(t.shipment_id, list);
        });
        const containersByShipment = new Map<string, number>();
        (containers ?? []).forEach((c) => {
          containersByShipment.set(c.shipment_id, (containersByShipment.get(c.shipment_id) ?? 0) + 1);
        });

        shipmentRows.forEach((shipment) => {
          const risks = computePlanningRisks({
            shipment,
            containers: [],
            customs: customsByShipment.get(shipment.id) ?? null,
            terminal: terminalByShipment.get(shipment.id) ?? null,
            transportation: transportByShipment.get(shipment.id) ?? [],
          });
          if (risks.some((r) => r.severity === 'critical')) highRiskShipments += 1;
        });
      }

      setStats([
        { label: 'Plans Waiting', value: plansWaiting },
        { label: 'Plans In Progress', value: plansInProgress },
        { label: 'Completed Today', value: plansCompletedToday },
        { label: 'Upcoming ETA (7d)', value: upcomingEta },
        { label: 'Bookings Pending', value: bookingsPending },
        { label: 'Containers at Risk', value: containersAtRisk },
        { label: 'Documents Missing', value: documentsMissing },
        { label: 'Avg. Planning Time', value: avgPlanningDays !== null ? `${avgPlanningDays.toFixed(1)}d` : '—' },
        { label: 'Peak Officer Workload', value: officerWorkloadPeak },
        { label: 'High Risk Shipments', value: highRiskShipments },
      ]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Planning Command Center</CardTitle>
        <Link href="/planning">
          <Button variant="ghost" size="sm">
            View all
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : stats.every((s) => s.value === 0 || s.value === '—') ? (
          <div className="flex items-center justify-center gap-2.5 py-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No shipments currently in planning.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((s) => (
              <StatBlock key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
