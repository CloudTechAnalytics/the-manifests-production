'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Search, ArrowRight } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { formatCurrency } from '@/shared/lib/utils/status';
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
import type { CustomsInspectionChannel, CustomsStatus, ShipmentCustoms } from '@/shared/types';

/*
 * Customs queue — every department works from the shipment record
 * itself (permissions control what each can see/edit there); this page
 * is a filtered work list for Customs, not a second place to edit
 * customs data. Every row opens the shipment's Customs tab directly.
 */

interface Row {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  customs: ShipmentCustoms | null;
}

const STATUS_META: Record<CustomsStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  submitted: { label: 'Submitted', color: 'bg-blue-50 text-blue-700' },
  awaiting_assessment: { label: 'Awaiting Assessment', color: 'bg-amber-50 text-amber-700' },
  duty_payment: { label: 'Duty Payment', color: 'bg-amber-50 text-amber-700' },
  customs_processing: { label: 'Customs Processing', color: 'bg-purple-50 text-purple-700' },
  released: { label: 'Released', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700' },
};

const CHANNEL_META: Record<CustomsInspectionChannel, { label: string; color: string }> = {
  green: { label: 'Green', color: 'bg-emerald-50 text-emerald-700' },
  yellow: { label: 'Yellow', color: 'bg-amber-50 text-amber-700' },
  red: { label: 'Red', color: 'bg-red-50 text-red-700' },
};

export default function CustomsQueuePage() {
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

      const shipments = (shipmentRows as unknown as (Omit<Row, 'customs'> & { branch_id: string })[]) ?? [];
      const shipmentIds = shipments.map((s) => s.id);

      const { data: customsRows } = shipmentIds.length
        ? await supabase.from('shipment_customs').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
        : { data: [] };

      const customsByShipment = new Map<string, ShipmentCustoms>();
      (customsRows as ShipmentCustoms[] | null)?.forEach((c) => customsByShipment.set(c.shipment_id, c));

      // Outstanding work: no customs record yet, or not released.
      const outstanding = shipments
        .map((s) => ({ ...s, customs: customsByShipment.get(s.id) ?? null }))
        .filter((s) => !s.customs || s.customs.status !== 'released');

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
      r.customs?.declaration_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Landmark className="h-6 w-6 text-primary" />
          Customs Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shipments awaiting customs clearance. Open a shipment to declare, assess, and release it.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, or declaration number…"
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
            <EmptyState icon={Landmark} title="Nothing outstanding" message="Every shipment is cleared through customs." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Declaration #</TableHead>
                  <TableHead>Duty</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-accent/60"
                    onClick={() => navigate(`/shipments/${r.id}?tab=customs`)}
                  >
                    <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.customs?.declaration_number ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.customs ? (
                        <span className={r.customs.duty_paid ? 'text-emerald-700' : 'text-amber-700'}>
                          {formatCurrency(r.customs.duty_amount, 'NGN')}
                          {r.customs.duty_paid ? ' · Paid' : ' · Unpaid'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {r.customs?.inspection_channel ? (
                        <Badge
                          className={
                            (CHANNEL_META[r.customs.inspection_channel] ?? {
                              color: 'bg-muted text-muted-foreground',
                            }).color
                          }
                        >
                          {CHANNEL_META[r.customs.inspection_channel]?.label ?? r.customs.inspection_channel}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (STATUS_META[r.customs?.status ?? 'draft'] ?? {
                            color: 'bg-muted text-muted-foreground',
                          }).color
                        }
                      >
                        {r.customs ? STATUS_META[r.customs.status]?.label ?? r.customs.status : 'Not started'}
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
