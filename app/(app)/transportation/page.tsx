'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Search, ExternalLink, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { formatDate } from '@/lib/utils/status';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { TransportationFormDialog } from '@/components/transportation/transportation-form-dialog';
import type { ShipmentTransportation, TransportationStatus } from '@/types';

interface Row {
  id: string;
  reference_number: string | null;
  branch_id: string;
  customer: { company_name: string } | null;
  legs: ShipmentTransportation[];
}

const STATUS_META: Record<TransportationStatus, { label: string; color: string }> = {
  assigned: { label: 'Assigned', color: 'bg-muted text-muted-foreground' },
  loaded: { label: 'Loaded', color: 'bg-blue-50 text-blue-700' },
  in_transit: { label: 'In Transit', color: 'bg-purple-50 text-purple-700' },
  delivered: { label: 'Delivered', color: 'bg-emerald-50 text-emerald-700' },
  failed_delivery: { label: 'Failed Delivery', color: 'bg-red-50 text-red-700' },
};

export default function TransportationPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addTarget, setAddTarget] = useState<Row | null>(null);
  const [editTarget, setEditTarget] = useState<{ row: Row; leg: ShipmentTransportation } | null>(null);

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

      const shipments = (shipmentRows as unknown as Omit<Row, 'legs'>[]) ?? [];
      const shipmentIds = shipments.map((s) => s.id);

      const { data: legRows } = shipmentIds.length
        ? await supabase
            .from('shipment_transportation')
            .select('*')
            .in('shipment_id', shipmentIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        : { data: [] };

      const legsByShipment = new Map<string, ShipmentTransportation[]>();
      (legRows as ShipmentTransportation[] | null)?.forEach((l) => {
        const list = legsByShipment.get(l.shipment_id) ?? [];
        list.push(l);
        legsByShipment.set(l.shipment_id, list);
      });

      setRows(shipments.map((s) => ({ ...s, legs: legsByShipment.get(s.id) ?? [] })));
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
    return r.reference_number?.toLowerCase().includes(q) || r.customer?.company_name.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Truck className="h-6 w-6 text-primary" />
          Transportation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Truck, driver, and delivery status for every transportation leg.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference or customer…"
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
            <EmptyState icon={Truck} title="No shipments found" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Truck / Driver</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const latest: ShipmentTransportation | undefined = r.legs[0];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                      <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latest
                          ? [latest.truck_number, latest.driver_name].filter(Boolean).join(' · ') || '—'
                          : '—'}
                        {r.legs.length > 1 && <span className="ml-1.5 text-xs">({r.legs.length} legs)</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latest?.delivery_date ? formatDate(latest.delivery_date) : '—'}
                      </TableCell>
                      <TableCell>
                        {latest ? (
                          <Badge className={STATUS_META[latest.status].color}>
                            {STATUS_META[latest.status].label}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not started</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {latest && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditTarget({ row: r, leg: latest })}
                            >
                              Edit
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setAddTarget(r)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            New Leg
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link href={`/shipments/${r.id}`} title="Open shipment">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {addTarget && (
        <TransportationFormDialog
          open={!!addTarget}
          onOpenChange={(open) => !open && setAddTarget(null)}
          shipmentId={addTarget.id}
          branchId={addTarget.branch_id}
          existing={null}
          onSaved={load}
        />
      )}
      {editTarget && (
        <TransportationFormDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          shipmentId={editTarget.row.id}
          branchId={editTarget.row.branch_id}
          existing={editTarget.leg}
          onSaved={load}
        />
      )}
    </div>
  );
}
