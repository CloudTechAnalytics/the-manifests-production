'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Plus, Search, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
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
  formatDate,
} from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { ShipmentPlan, PlanStatus, PriorityLevel, Branch } from '@/types';

type StatusFilter = 'all' | PlanStatus;
type PriorityFilter = 'all' | PriorityLevel;

type PlanRow = ShipmentPlan & {
  customer?: { id: string; company_name: string } | null;
  branch?: { id: string; name: string } | null;
};

const PLAN_EXPORT_COLUMNS: ExportColumn<PlanRow>[] = [
  { header: 'Plan Number', value: (p) => p.plan_number },
  { header: 'Customer', value: (p) => p.customer?.company_name ?? '' },
  { header: 'Status', value: (p) => p.status },
  { header: 'Priority', value: (p) => p.priority },
  { header: 'Type', value: (p) => p.shipment_type ?? '' },
  { header: 'Origin', value: (p) => p.origin },
  { header: 'Destination', value: (p) => p.destination },
  { header: 'Commodity', value: (p) => p.commodity },
  { header: 'Planned ETD', value: (p) => p.planned_etd },
  { header: 'Planned ETA', value: (p) => p.planned_eta },
  { header: 'Est. Cost', value: (p) => p.estimated_cost },
  { header: 'Est. Revenue', value: (p) => p.estimated_revenue },
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
      let query = supabase
        .from('shipment_plans')
        .select('*, customer:customers(id, company_name), branch:branches(id, name)')
        .is('deleted_at', null)
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
            Draft and prepare shipments before booking.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton data={plans} columns={PLAN_EXPORT_COLUMNS} filename="plans" />
          <Link href="/planning/new">
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              New Plan
            </Button>
          </Link>
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
            All Plans
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
              title="No plans found"
              message={
                debouncedSearch || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Get started by creating a new plan.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Planned ETD</TableHead>
                  <TableHead>Converted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => {
                  const statusMeta = PLAN_STATUS_META[p.status];
                  const priorityMeta = PRIORITY_META[p.priority];
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                      onClick={() => router.push(`/planning/${p.id}`)}
                    >
                      <TableCell className="font-medium text-primary">
                        {p.plan_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.origin ?? '—'} → {p.destination ?? '—'}
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
                        {formatDate(p.planned_etd)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.converted_shipment_id ? (
                          <Badge variant="secondary" className="bg-green-100 text-[11px] text-green-700">
                            Converted
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
