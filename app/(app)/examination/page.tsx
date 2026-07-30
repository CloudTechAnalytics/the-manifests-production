'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSearch, Search, ExternalLink, Plus } from 'lucide-react';
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
import { ExaminationFormDialog } from '@/components/examination/examination-form-dialog';
import type { ExaminationResult, ShipmentExamination } from '@/types';

interface Row {
  id: string;
  reference_number: string | null;
  branch_id: string;
  customer: { company_name: string } | null;
  exams: ShipmentExamination[];
}

const RESULT_META: Record<ExaminationResult, { label: string; color: string }> = {
  passed: { label: 'Passed', color: 'bg-emerald-50 text-emerald-700' },
  held: { label: 'Held', color: 'bg-red-50 text-red-700' },
  additional_duty: { label: 'Additional Duty', color: 'bg-amber-50 text-amber-700' },
  further_inspection: { label: 'Further Inspection', color: 'bg-amber-50 text-amber-700' },
};

export default function ExaminationPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addTarget, setAddTarget] = useState<Row | null>(null);
  const [editTarget, setEditTarget] = useState<{ row: Row; exam: ShipmentExamination } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let customsQuery = supabase
        .from('shipment_customs')
        .select('shipment_id, branch_id')
        .eq('inspection_channel', 'red')
        .is('deleted_at', null);
      if (!isAdmin && branchId) customsQuery = customsQuery.eq('branch_id', branchId);

      const { data: redCustoms, error: customsError } = await customsQuery;
      if (customsError) throw customsError;

      const shipmentIds = (redCustoms ?? []).map((c) => c.shipment_id);
      if (shipmentIds.length === 0) {
        setRows([]);
        return;
      }

      const { data: shipmentRows, error } = await supabase
        .from('shipments')
        .select('id, reference_number, branch_id, customer:customers(company_name)')
        .in('id', shipmentIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const { data: examRows } = await supabase
        .from('shipment_examinations')
        .select('*')
        .in('shipment_id', shipmentIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const examsByShipment = new Map<string, ShipmentExamination[]>();
      (examRows as ShipmentExamination[] | null)?.forEach((e) => {
        const list = examsByShipment.get(e.shipment_id) ?? [];
        list.push(e);
        examsByShipment.set(e.shipment_id, list);
      });

      setRows(
        ((shipmentRows as unknown as Omit<Row, 'exams'>[]) ?? []).map((s) => ({
          ...s,
          exams: examsByShipment.get(s.id) ?? [],
        }))
      );
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
          <FileSearch className="h-6 w-6 text-primary" />
          Physical Examination
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shipments Customs flagged for the Red inspection channel.
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
            <EmptyState
              icon={FileSearch}
              title="No shipments awaiting examination"
              message="Shipments appear here once Customs selects the Red inspection channel."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Latest Inspection</TableHead>
                  <TableHead>Officer</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const latest = r.exams[0];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                      <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latest?.inspection_date ? formatDate(latest.inspection_date) : '—'}
                        {r.exams.length > 1 && (
                          <span className="ml-1.5 text-xs">({r.exams.length} exams)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latest?.inspection_officer ?? '—'}
                      </TableCell>
                      <TableCell>
                        {latest?.result ? (
                          <Badge className={RESULT_META[latest.result].color}>
                            {RESULT_META[latest.result].label}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {latest ? 'Pending' : 'Not started'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {latest && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditTarget({ row: r, exam: latest })}
                            >
                              Edit
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setAddTarget(r)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            New
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
        <ExaminationFormDialog
          open={!!addTarget}
          onOpenChange={(open) => !open && setAddTarget(null)}
          shipmentId={addTarget.id}
          branchId={addTarget.branch_id}
          existing={null}
          onSaved={load}
        />
      )}
      {editTarget && (
        <ExaminationFormDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          shipmentId={editTarget.row.id}
          branchId={editTarget.row.branch_id}
          existing={editTarget.exam}
          onSaved={load}
        />
      )}
    </div>
  );
}
