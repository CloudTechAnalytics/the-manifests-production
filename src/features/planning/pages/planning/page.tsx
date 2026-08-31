'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Search, Loader2, ArrowRight } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
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
import { PRIORITY_META } from '@/shared/lib/utils/status';
import { ExportButton } from '@/shared/components/ui/export-button';
import { fetchPlanningRows, startPlanning, type PlanningRow } from '@/features/planning/services/planning.service';
import type { ExportColumn } from '@/shared/lib/export';

const EXPORT_COLUMNS: ExportColumn<PlanningRow>[] = [
  { header: 'Shipment', value: (r) => r.shipment.reference_number ?? '' },
  { header: 'Customer', value: (r) => r.shipment.customer?.company_name ?? '' },
  { header: 'Origin', value: (r) => r.shipment.origin ?? '' },
  { header: 'Destination', value: (r) => r.shipment.destination ?? '' },
  { header: 'Priority', value: (r) => r.plan?.priority ?? '' },
  { header: 'Has Plan Record', value: (r) => (r.plan ? 'Yes' : 'No') },
];

export default function PlanningPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [startingShipmentId, setStartingShipmentId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['planning-rows', isAdmin, userBranchId, debouncedSearch],
    queryFn: () => fetchPlanningRows({ isAdmin, branchId: userBranchId, search: debouncedSearch }),
    enabled: !!profile,
  });

  const startPlanningMutation = useMutation({
    mutationFn: (row: PlanningRow) => startPlanning(row, { id: profile!.id }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['planning-rows'] });
      navigate(`/planning/${created.id}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to start planning'));
    },
    onSettled: () => setStartingShipmentId(null),
  });

  const handleStartPlanning = (row: PlanningRow) => {
    if (!profile) return;
    setStartingShipmentId(row.shipment.id);
    startPlanningMutation.mutate(row);
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
                      onClick={() => row.plan && navigate(`/planning/${row.plan.id}`)}
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
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/planning/${row.plan!.id}`)}>
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
