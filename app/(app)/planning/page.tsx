'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Search, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PLAN_STATUS_META,
  PLAN_STATUS_FLOW,
  PRIORITY_META,
  SHIPMENT_STATUS_META,
} from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { ShipmentPlan, PlanStatus, PriorityLevel, Branch, ShipmentStatus } from '@/types';

type StatusFilter = 'all' | PlanStatus;
type PriorityFilter = 'all' | PriorityLevel;

type PlanRow = ShipmentPlan & {
  customer?: { id: string; company_name: string } | null;
  branch?: { id: string; name: string } | null;
  shipment?: { id: string; reference_number: string | null; origin: string | null; destination: string | null; status: ShipmentStatus } | null;
};

const PLAN_EXPORT_COLUMNS: ExportColumn<PlanRow>[] = [
  { header: 'Plan Number', value: (p) => p.plan_number },
  { header: 'Shipment', value: (p) => p.shipment?.reference_number ?? '' },
  { header: 'Customer', value: (p) => p.customer?.company_name ?? '' },
  { header: 'Status', value: (p) => p.status },
  { header: 'Priority', value: (p) => p.priority },
  { header: 'Origin', value: (p) => p.shipment?.origin ?? '' },
  { header: 'Destination', value: (p) => p.shipment?.destination ?? '' },
  { header: 'Current Stage', value: (p) => p.shipment?.status ?? '' },
  { header: 'Branch', value: (p) => p.branch?.name ?? '' },
  { header: 'Created', value: (p) => p.created_at },
];

const VALID_STATUSES = new Set<string>([...PLAN_STATUS_FLOW, 'cancelled']);

export default function PlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && VALID_STATUSES.has(fromUrl) ? (fromUrl as StatusFilter) : 'all';
  });
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [branchIdFilter, setBranchIdFilter] = useState('all');

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .then(({ data }) => setBranches((data as Branch[]) ?? []));
  }, [isAdmin]);

  const loadPlans = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Only shipments currently in Planning — a plan with no linked
      // shipment predates the Planning Centre redesign (the old "create a
      // plan before a shipment exists" flow) and is a historical record
      // only, reachable by direct URL but not surfaced in this work list.
      let query = supabase
        .from('shipment_plans')
        .select(
          '*, customer:customers(id, company_name), branch:branches(id, name), shipment:shipments(id, reference_number, origin, destination, status)'
        )
        .is('deleted_at', null)
        .not('shipment_id', 'is', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && userBranchId) query = query.eq('branch_id', userBranchId);
      if (isAdmin && branchIdFilter !== 'all') query = query.eq('branch_id', branchIdFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter);
      if (debouncedSearch) {
        const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
        query = query.or(
          `plan_number.ilike.%${sanitized}%,customer.company_name.ilike.%${sanitized}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading plans:', error);
        setPlans([]);
        return;
      }
      setPlans((data as PlanRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, userBranchId, branchIdFilter, statusFilter, priorityFilter, debouncedSearch]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      ...PLAN_STATUS_FLOW.map((s) => ({ value: s, label: PLAN_STATUS_META[s].label })),
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  );

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
          <ExportButton data={plans} columns={PLAN_EXPORT_COLUMNS} filename="plans" />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by plan number or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {(Object.keys(PRIORITY_META) as PriorityLevel[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={branchIdFilter} onValueChange={setBranchIdFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            Shipments in Planning
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({plans.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No shipments in planning"
              message={
                debouncedSearch || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'Try adjusting your filters.'
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
                  <TableHead>Plan Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Current Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => {
                  const statusMeta = PLAN_STATUS_META[p.status] ?? {
                    label: p.status ?? 'Unknown',
                    color: 'bg-muted text-muted-foreground',
                    step: -1,
                  };
                  const priorityMeta = PRIORITY_META[p.priority] ?? {
                    label: p.priority ?? 'Unknown',
                    color: 'bg-muted text-muted-foreground',
                  };
                  const stageMeta = p.shipment
                    ? SHIPMENT_STATUS_META[p.shipment.status] ?? {
                        label: p.shipment.status ?? 'Unknown',
                        color: 'bg-muted text-muted-foreground',
                      }
                    : null;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                      onClick={() => router.push(`/planning/${p.id}`)}
                    >
                      <TableCell className="font-medium text-primary">
                        {p.shipment?.reference_number ?? p.plan_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.shipment?.origin ?? '—'} → {p.shipment?.destination ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                          {statusMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[11px] ${priorityMeta.color}`}>
                          {priorityMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {stageMeta ? (
                          <Badge variant="secondary" className={`text-[11px] ${stageMeta.color}`}>
                            {stageMeta.label}
                          </Badge>
                        ) : (
                          '—'
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
