'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, Search, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
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
import type { ExaminationResult, ShipmentExamination } from '@/types';

/*
 * Examination queue — a filtered work list for Examination, not a second
 * place to edit examination data. Every row opens the shipment's tab.
 */

interface Row {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  examination: ShipmentExamination | null;
}

const RESULT_META: Record<ExaminationResult, { label: string; color: string }> = {
  passed: { label: 'Passed', color: 'bg-emerald-50 text-emerald-700' },
  held: { label: 'Held', color: 'bg-red-50 text-red-700' },
  additional_duty: { label: 'Additional Duty', color: 'bg-amber-50 text-amber-700' },
  further_inspection: { label: 'Further Inspection', color: 'bg-purple-50 text-purple-700' },
};

export default function ExaminationQueuePage() {
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

      const shipments = (shipmentRows as unknown as (Omit<Row, 'examination'> & { branch_id: string })[]) ?? [];
      const shipmentIds = shipments.map((s) => s.id);

      const { data: examinationRows } = shipmentIds.length
        ? await supabase.from('shipment_examinations').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
        : { data: [] };

      const examinationByShipment = new Map<string, ShipmentExamination>();
      (examinationRows as ShipmentExamination[] | null)?.forEach((e) => examinationByShipment.set(e.shipment_id, e));

      // Outstanding work: no examination record yet, or no result recorded.
      const outstanding = shipments
        .map((s) => ({ ...s, examination: examinationByShipment.get(s.id) ?? null }))
        .filter((s) => !s.examination || !s.examination.result);

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
      r.examination?.inspection_officer?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <FileSearch className="h-6 w-6 text-primary" />
          Examination Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shipments awaiting cargo examination. Open a shipment to schedule or record its inspection.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, or inspecting officer…"
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
            <EmptyState icon={FileSearch} title="Nothing outstanding" message="Every shipment has completed examination." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Inspection Date</TableHead>
                  <TableHead>Inspecting Officer</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-accent/60"
                    onClick={() => navigate(`/shipments/${r.id}?tab=examination`)}
                  >
                    <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.examination?.inspection_date
                        ? new Date(r.examination.inspection_date).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.examination?.inspection_officer ?? '—'}
                    </TableCell>
                    <TableCell>
                      {r.examination?.result ? (
                        <Badge
                          className={
                            (RESULT_META[r.examination.result] ?? {
                              color: 'bg-muted text-muted-foreground',
                            }).color
                          }
                        >
                          {RESULT_META[r.examination.result]?.label ?? r.examination.result}
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">
                          {r.examination ? 'Scheduled' : 'Not started'}
                        </Badge>
                      )}
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
