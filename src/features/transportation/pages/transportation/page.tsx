'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Search, ArrowRight } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import type { ShipmentTransportation, TransportationStatus } from '@/shared/types';

/*
 * Transportation queue — a filtered work list for Transport, not a second
 * place to edit transportation legs. Every row opens the shipment's tab.
 */

interface Row {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  transportation: ShipmentTransportation | null;
}

const STATUS_META: Record<TransportationStatus, { label: string; color: string }> = {
  assigned: { label: 'Assigned', color: 'bg-muted text-muted-foreground' },
  loaded: { label: 'Loaded', color: 'bg-blue-50 text-blue-700' },
  in_transit: { label: 'In Transit', color: 'bg-amber-50 text-amber-700' },
  delivered: { label: 'Delivered', color: 'bg-emerald-50 text-emerald-700' },
  failed_delivery: { label: 'Failed Delivery', color: 'bg-red-50 text-red-700' },
};

export default function TransportationQueuePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('shipments')
        .select('id, reference_number, branch_id, customer:customers(company_name)')
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

      const { data: shipmentRows, error } = await query;
      if (error) throw error;

      const shipments = (shipmentRows as unknown as (Omit<Row, 'transportation'> & { branch_id: string })[]) ?? [];
      const shipmentIds = shipments.map((s) => s.id);

      const { data: transportRows } = shipmentIds.length
        ? await supabase.from('shipment_transportation').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
        : { data: [] };

      const transportByShipment = new Map<string, ShipmentTransportation>();
      (transportRows as ShipmentTransportation[] | null)?.forEach((t) => transportByShipment.set(t.shipment_id, t));

      const outstanding = shipments
        .map((s) => ({ ...s, transportation: transportByShipment.get(s.id) ?? null }))
        .filter((s) => !s.transportation || s.transportation.status !== 'delivered');

      setRows(outstanding);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.reference_number?.toLowerCase().includes(q) ||
      r.customer?.company_name.toLowerCase().includes(q) ||
      r.transportation?.truck_number?.toLowerCase().includes(q) ||
      r.transportation?.driver_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Truck className="h-6 w-6 text-primary" />
          Transportation Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shipments awaiting inland transport and delivery. Open a shipment to assign or update its transport leg.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, truck, or driver…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Truck} title="Nothing outstanding" message="Every shipment has been delivered." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-accent/60"
                    onClick={() => navigate(`/shipments/${r.id}?tab=transportation`)}
                  >
                    <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.transportation?.truck_number ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.transportation?.driver_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (STATUS_META[r.transportation?.status ?? 'assigned'] ?? {
                            color: 'bg-muted text-muted-foreground',
                          }).color
                        }
                      >
                        {r.transportation
                          ? STATUS_META[r.transportation.status]?.label ?? r.transportation.status
                          : 'Not started'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
