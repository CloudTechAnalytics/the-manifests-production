'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Plus, Search, Filter, Plane, Ship, Truck, Train, Waypoints } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { QUOTATION_STATUS_META, formatDate, formatCurrency } from '@/lib/utils/status';
import type { Quotation, QuotationStatus, ShipmentType, Branch } from '@/types';

type StatusFilter = 'all' | QuotationStatus;
type ShipmentFilter = 'all' | ShipmentType;

const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  air: 'Air',
  sea: 'Sea',
  road: 'Road',
  rail: 'Rail',
  multimodal: 'Multimodal',
};

const SHIPMENT_TYPE_ICONS: Record<ShipmentType, React.ComponentType<{ className?: string }>> = {
  air: Plane,
  sea: Ship,
  road: Truck,
  rail: Train,
  multimodal: Waypoints,
};

// Quotation row joined with customer + branch for the list view
type QuotationRow = Quotation & {
  customer?: { id: string; company_name: string } | null;
  branch?: { id: string; name: string } | null;
};

const VALID_QUOTATION_STATUSES = new Set<string>([
  'draft',
  'sent',
  'approved',
  'rejected',
  'expired',
]);

export default function QuotationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();

  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && VALID_QUOTATION_STATUSES.has(fromUrl)
      ? (fromUrl as StatusFilter)
      : 'all';
  });
  const [shipmentFilter, setShipmentFilter] = useState<ShipmentFilter>('all');
  const [branchIdFilter, setBranchIdFilter] = useState<string>('all');

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  // Debounced search term
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load branches for admin branch filter
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .then(({ data }) => setBranches((data as Branch[]) ?? []));
  }, [isAdmin]);

  const loadQuotations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('quotations')
        .select(
          '*, customer:customers(id, company_name), branch:branches(id, name)'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Branch scoping: non-admins only see their branch
      if (!isAdmin && userBranchId) {
        query = query.eq('branch_id', userBranchId);
      }

      // Admin branch filter dropdown
      if (isAdmin && branchIdFilter !== 'all') {
        query = query.eq('branch_id', branchIdFilter);
      }

      // Status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Shipment type filter
      if (shipmentFilter !== 'all') {
        query = query.eq('shipment_type', shipmentFilter);
      }

      // Search by quotation_number or customer company_name
      if (debouncedSearch) {
        query = query.or(
          `quotation_number.ilike.%${debouncedSearch}%,customer.company_name.ilike.%${debouncedSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading quotations:', error);
        setQuotations([]);
        return;
      }
      setQuotations((data as QuotationRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, userBranchId, statusFilter, shipmentFilter, branchIdFilter, debouncedSearch]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      { value: 'draft', label: 'Draft' },
      { value: 'sent', label: 'Sent' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'expired', label: 'Expired' },
    ],
    []
  );

  const shipmentOptions = useMemo(
    () => [
      { value: 'all', label: 'All Types' },
      { value: 'air', label: 'Air' },
      { value: 'sea', label: 'Sea' },
      { value: 'road', label: 'Road' },
      { value: 'rail', label: 'Rail' },
      { value: 'multimodal', label: 'Multimodal' },
    ],
    []
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <FileText className="h-6 w-6 text-blue-600" />
            Quotations
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage freight quotations for your customers.
          </p>
        </div>
        <Link href="/quotations/new" className="sm:shrink-0">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            New Quotation
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by quotation number or customer name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
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
            <Select
              value={shipmentFilter}
              onValueChange={(v) => setShipmentFilter(v as ShipmentFilter)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Shipment type" />
              </SelectTrigger>
              <SelectContent>
                {shipmentOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select
                value={branchIdFilter}
                onValueChange={(v) => setBranchIdFilter(v)}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All branches" />
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

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            All Quotations
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({quotations.length})
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
          ) : quotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <FileText className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">No quotations found</p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch ||
                  statusFilter !== 'all' ||
                  shipmentFilter !== 'all' ||
                  branchIdFilter !== 'all'
                    ? 'Try adjusting your filters.'
                    : 'Get started by creating a new quotation.'}
                </p>
              </div>
              {!debouncedSearch &&
                statusFilter === 'all' &&
                shipmentFilter === 'all' &&
                branchIdFilter === 'all' && (
                  <Link href="/quotations/new">
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1.5 h-4 w-4" />
                      New Quotation
                    </Button>
                  </Link>
                )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shipment Type</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((q) => {
                  const meta = QUOTATION_STATUS_META[q.status];
                  const ShipmentIcon = q.shipment_type
                    ? SHIPMENT_TYPE_ICONS[q.shipment_type]
                    : null;
                  return (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                      onClick={() => router.push(`/quotations/${q.id}`)}
                    >
                      <TableCell className="font-medium text-primary">
                        {q.quotation_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {q.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {q.shipment_type && ShipmentIcon ? (
                          <div className="flex items-center gap-1.5">
                            <ShipmentIcon className="h-4 w-4 text-blue-500" />
                            <span className="text-muted-foreground">
                              {SHIPMENT_TYPE_LABELS[q.shipment_type]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {q.origin ?? '—'} → {q.destination ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(q.total, q.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(q.valid_until)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(q.created_at)}
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
