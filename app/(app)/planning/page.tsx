'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardList, Search, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PRIORITY_META } from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { Shipment, ShipmentPlan } from '@/types';

type PlanningRow = {
  shipment: Pick<Shipment, 'id' | 'reference_number' | 'origin' | 'destination' | 'branch_id'> & {
    customer: { company_name: string } | null;
  };
  plan: Pick<ShipmentPlan, 'id' | 'priority'> | null;
};

const EXPORT_COLUMNS: ExportColumn<PlanningRow>[] = [
  { header: 'Shipment', value: (r) => r.shipment.reference_number ?? '' },
  { header: 'Customer', value: (r) => r.shipment.customer?.company_name ?? '' },
  { header: 'Origin', value: (r) => r.shipment.origin ?? '' },
  { header: 'Destination', value: (r) => r.shipment.destination ?? '' },
  { header: 'Priority', value: (r) => r.plan?.priority ?? '' },
  { header: 'Has Plan Record', value: (r) => (r.plan ? 'Yes' : 'No') },
];

export default function PlanningPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startingShipmentId, setStartingShipmentId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadRows = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Work-queue pattern, same as Customs/Terminal/Transportation: the
      // shipment's own status is the source of truth for "is this in
      // Planning", not whether a shipment_plans row happens to exist yet
      // — every shipment currently in the planning stage shows up here,
      // even one from before shipment_plans auto-creation existed.
      let shipQuery = supabase
        .from('shipments')
        .select('id, reference_number, origin, destination, branch_id, customer:customers(company_name)')
        .eq('status', 'planning')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (!isAdmin && userBranchId) shipQuery = shipQuery.eq('branch_id', userBranchId);
      if (debouncedSearch) {
        const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
        shipQuery = shipQuery.or(
          `reference_number.ilike.%${sanitized}%,customer.company_name.ilike.%${sanitized}%`
        );
      }

      const { data: shipmentRows, error: shipError } = await shipQuery;
      if (shipError) {
        console.error('Error loading shipments in planning:', shipError);
        setRows([]);
        return;
      }
      const shipments = (shipmentRows as unknown as PlanningRow['shipment'][]) ?? [];
      if (shipments.length === 0) {
        setRows([]);
        return;
      }

      const { data: planRows } = await supabase
        .from('shipment_plans')
        .select('id, shipment_id, priority')
        .in(
          'shipment_id',
          shipments.map((s) => s.id)
        )
        .is('deleted_at', null);
      const planByShipmentId = new Map((planRows ?? []).map((p) => [p.shipment_id, p]));

      setRows(
        shipments.map((s) => ({
          shipment: s,
          plan: (planByShipmentId.get(s.id) as PlanningRow['plan']) ?? null,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, userBranchId, debouncedSearch]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const handleStartPlanning = async (row: PlanningRow) => {
    if (!profile) return;
    setStartingShipmentId(row.shipment.id);
    try {
      // Customer is required on shipment_plans — look it up from the
      // shipment rather than asking the user to pick it again.
      const { data: fullShipment, error: shipmentError } = await supabase
        .from('shipments')
        .select('customer_id')
        .eq('id', row.shipment.id)
        .single();
      if (shipmentError || !fullShipment) throw new Error('Could not load shipment details');

      const { data: created, error } = await supabase
        .from('shipment_plans')
        .insert({
          shipment_id: row.shipment.id,
          customer_id: fullShipment.customer_id,
          branch_id: row.shipment.branch_id,
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: row.shipment.branch_id,
        action: 'plan.created',
        entity_type: 'shipment_plan',
        entity_id: created.id,
        description: `Started planning for shipment ${row.shipment.reference_number ?? ''}`,
        metadata: { shipment_id: row.shipment.id },
      });

      router.push(`/planning/${created.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to start planning'));
    } finally {
      setStartingShipmentId(null);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            Planning
          </h1>
          <p className="text-sm text-muted-foreground">
            Shipments currently in Planning — coordinate vessel, container, customs, terminal, and
            transport execution.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton data={rows} columns={EXPORT_COLUMNS} filename="planning" />
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by shipment reference or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            Shipments in Planning
            {!loading && <span className="ml-2 text-sm font-normal text-muted-foreground">({rows.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No shipments in planning"
              message={
                debouncedSearch
                  ? 'Try a different search.'
                  : 'Shipments enter Planning automatically once Operations accepts them.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const priorityMeta = row.plan?.priority
                    ? PRIORITY_META[row.plan.priority] ?? { label: row.plan.priority, color: 'bg-muted text-muted-foreground' }
                    : null;
                  return (
                    <TableRow
                      key={row.shipment.id}
                      className={row.plan ? 'cursor-pointer transition-colors hover:bg-accent/60' : undefined}
                      onClick={() => row.plan && router.push(`/planning/${row.plan.id}`)}
                    >
                      <TableCell className="font-medium text-primary">
                        {row.shipment.reference_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.shipment.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.shipment.origin ?? '—'} → {row.shipment.destination ?? '—'}
                      </TableCell>
                      <TableCell>
                        {priorityMeta ? (
                          <Badge variant="secondary" className={`text-[11px] ${priorityMeta.color}`}>
                            {priorityMeta.label}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {row.plan ? (
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/planning/${row.plan!.id}`)}>
                            Open
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={startingShipmentId === row.shipment.id}
                            onClick={() => handleStartPlanning(row)}
                          >
                            {startingShipmentId === row.shipment.id && (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            )}
                            Start Planning
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
