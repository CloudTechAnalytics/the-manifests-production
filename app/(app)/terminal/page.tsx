'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Search, ExternalLink } from 'lucide-react';
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
import { TerminalFormDialog } from '@/components/terminal/terminal-form-dialog';
import type { TerminalOperation, TerminalStatus } from '@/types';

interface Row {
  id: string;
  reference_number: string | null;
  branch_id: string;
  customer: { company_name: string } | null;
  terminal: TerminalOperation | null;
}

const STATUS_META: Record<TerminalStatus, { label: string; color: string }> = {
  waiting: { label: 'Waiting', color: 'bg-muted text-muted-foreground' },
  positioned: { label: 'Positioned', color: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-amber-50 text-amber-700' },
  examined: { label: 'Examined', color: 'bg-purple-50 text-purple-700' },
  released: { label: 'Released', color: 'bg-emerald-50 text-emerald-700' },
};

export default function TerminalPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogTarget, setDialogTarget] = useState<Row | null>(null);

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

      const shipments = (shipmentRows as unknown as Omit<Row, 'terminal'>[]) ?? [];
      const shipmentIds = shipments.map((s) => s.id);

      const { data: terminalRows } = shipmentIds.length
        ? await supabase
            .from('terminal_operations')
            .select('*')
            .in('shipment_id', shipmentIds)
            .is('deleted_at', null)
        : { data: [] };

      const byShipment = new Map<string, TerminalOperation>();
      (terminalRows as TerminalOperation[] | null)?.forEach((t) => byShipment.set(t.shipment_id, t));

      setRows(shipments.map((s) => ({ ...s, terminal: byShipment.get(s.id) ?? null })));
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
      r.terminal?.terminal_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Building2 className="h-6 w-6 text-primary" />
          Terminal Operations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Container position, holding bay, and release documents at the terminal.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, or terminal…"
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
            <EmptyState icon={Building2} title="No shipments found" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Position / Bay / Stack</TableHead>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.reference_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.customer?.company_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.terminal?.terminal_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[r.terminal?.container_position, r.terminal?.holding_bay, r.terminal?.stack_number]
                        .filter(Boolean)
                        .join(' / ') || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.terminal?.arrival_date ? formatDate(r.terminal.arrival_date) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_META[r.terminal?.status ?? 'waiting'].color}>
                        {r.terminal ? STATUS_META[r.terminal.status].label : 'Not started'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => setDialogTarget(r)}>
                          {r.terminal ? 'Edit' : 'Add Record'}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link href={`/shipments/${r.id}`} title="Open shipment">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogTarget && (
        <TerminalFormDialog
          open={!!dialogTarget}
          onOpenChange={(open) => !open && setDialogTarget(null)}
          shipmentId={dialogTarget.id}
          branchId={dialogTarget.branch_id}
          existing={dialogTarget.terminal}
          onSaved={load}
        />
      )}
    </div>
  );
}
