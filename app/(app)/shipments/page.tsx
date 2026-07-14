'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Package,
  Plus,
  Search,
  Filter,
  Plane,
  Ship,
  Truck,
  Train,
  Waypoints,
} from 'lucide-react';
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
import {
  SHIPMENT_STATUS_META,
  SHIPMENT_STATUS_FLOW,
  formatDate,
} from '@/lib/utils/status';
import type {
  Shipment,
  ShipmentStatus,
  ShipmentType,
  Branch,
} from '@/types';

type StatusFilter = 'all' | ShipmentStatus;
type TypeFilter = 'all' | ShipmentType;

const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  air: 'Air',
  sea: 'Sea',
  road: 'Road',
  rail: 'Rail',
  multimodal: 'Multimodal',
};

const SHIPMENT_TYPE_ICONS: Record<
  ShipmentType,
  React.ComponentType<{ className?: string }>
> = {
  air: Plane,
  sea: Ship,
  road: Truck,
  rail: Train,
  multimodal: Waypoints,
};

// Shipment row joined with customer, assigned user, and branch for the list view
type ShipmentRow = Shipment & {
  customer?: { id: string; company_name: string } | null;
  assigned_user?: { id: string; full_name: string } | null;
  branch?: { id: string; name: string } | null;
};

const VALID_SHIPMENT_STATUSES = new Set<string>([
  'booking_received',
  'documentation',
  'processing',
  'in_transit',
  'arrived',
  'delivered',
  'cancelled',
]);

export default function ShipmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && VALID_SHIPMENT_STATUSES.has(fromUrl)
      ? (fromUrl as StatusFilter)
      : 'all';
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
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

  const loadShipments = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('shipments')
        .select(
          '*, customer:customers(id, company_name), assigned_user:profiles!shipments_assigned_to_fkey(id, full_name), branch:branches(id, name)'
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
      if (typeFilter !== 'all') {
        query = query.eq('shipment_type', typeFilter);
      }

      // Search by reference_number, customer name, or tracking_number
      if (debouncedSearch) {
        query = query.or(
          `reference_number.ilike.%${debouncedSearch}%,customer.company_name.ilike.%${debouncedSearch}%,tracking_number.ilike.%${debouncedSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading shipments:', error);
        setShipments([]);
        return;
      }
      setShipments((data as ShipmentRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [
    profile,
    isAdmin,
    userBranchId,
    statusFilter,
    typeFilter,
    branchIdFilter,
    debouncedSearch,
  ]);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      ...SHIPMENT_STATUS_FLOW.map((s) => ({
        value: s,
        label: SHIPMENT_STATUS_META[s].label,
      })),
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  );

  const typeOptions = useMemo(
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
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Package className="h-6 w-6 text-blue-600" />
            Shipments
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage freight shipments across all branches.
          </p>
        </div>
        <Link href="/shipments/new" className="sm:shrink-0">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            New Shipment
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, or tracking number…"
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
              <SelectTrigger className="w-[170px]">
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
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as TypeFilter)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Shipment type" />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
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
          <CardTitle className="text-base font-semibold">
            All Shipments
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({shipments.length})
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
          ) : shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Package className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">No shipments found</p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch ||
                  statusFilter !== 'all' ||
                  typeFilter !== 'all' ||
                  branchIdFilter !== 'all'
                    ? 'Try adjusting your filters.'
                    : 'Get started by creating a new shipment.'}
                </p>
              </div>
              {!debouncedSearch &&
                statusFilter === 'all' &&
                typeFilter === 'all' &&
                branchIdFilter === 'all' && (
                  <Link href="/shipments/new">
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1.5 h-4 w-4" />
                      New Shipment
                    </Button>
                  </Link>
                )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Booking Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s) => {
                  const meta = SHIPMENT_STATUS_META[s.status];
                  const TypeIcon = s.shipment_type
                    ? SHIPMENT_TYPE_ICONS[s.shipment_type]
                    : null;
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                      onClick={() => router.push(`/shipments/${s.id}`)}
                    >
                      <TableCell className="font-medium text-primary">
                        {s.reference_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell>
                        {s.shipment_type && TypeIcon ? (
                          <div className="flex items-center gap-1.5">
                            <TypeIcon className="h-4 w-4 text-blue-500" />
                            <span className="text-muted-foreground">
                              {SHIPMENT_TYPE_LABELS[s.shipment_type]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.origin ?? '—'} → {s.destination ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.assigned_user?.full_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(s.booking_date)}
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
