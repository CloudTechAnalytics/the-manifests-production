'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Radar,
  Search,
  Package,
  MapPin,
  Truck,
  Weight,
  Box,
  User,
  Clock,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { cn } from '@/shared/lib/utils';
import {
  SHIPMENT_STATUS_META,
  SHIPMENT_STATUS_FLOW,
  formatDate,
  formatDateTime,
} from '@/shared/lib/utils/status';
import {
  fetchBranchesForTracking,
  fetchShipmentTimeline,
  fetchTrackingShipments,
} from '@/features/tracking/services/tracking.service';
import type { ShipmentStatus, ShipmentType } from '@/shared/types';

type StatusTab = 'all' | 'at_origin' | 'in_transit' | 'at_destination' | 'delivered';

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All Shipments' },
  { value: 'at_origin', label: 'At Origin' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'at_destination', label: 'At Destination' },
  { value: 'delivered', label: 'Delivered' },
];

// Customer-facing 4-bucket simplification of the real 11-stage flow —
// same idea as PIPELINE_STAGES in lib/utils/status.ts, kept separate
// since this page's buckets don't line up 1:1 with that one.
const AT_ORIGIN_STATUSES: ShipmentStatus[] = [
  'planning',
  'documentation',
  'awaiting_customs',
  'customs_clearance',
  'terminal_processing',
  'cargo_examination',
];
const IN_TRANSIT_STATUSES: ShipmentStatus[] = ['released', 'transport'];

const TYPE_OPTIONS: { value: 'all' | ShipmentType; label: string }[] = [
  { value: 'all', label: 'All Modes' },
  { value: 'air', label: 'Air' },
  { value: 'sea', label: 'Sea' },
  { value: 'road', label: 'Road' },
  { value: 'rail', label: 'Rail' },
  { value: 'multimodal', label: 'Multimodal' },
];

export default function TrackingPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ShipmentType>('all');
  const [branchIdFilter, setBranchIdFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: branches = [] } = useQuery({
    queryKey: ['tracking-branches'],
    queryFn: fetchBranchesForTracking,
    enabled: isAdmin,
  });

  const { data: shipments = [], isLoading: loading } = useQuery({
    queryKey: ['tracking-shipments', isAdmin, userBranchId, branchIdFilter, typeFilter, debouncedSearch],
    queryFn: () =>
      fetchTrackingShipments({
        isAdmin,
        userBranchId,
        branchIdFilter,
        typeFilter,
        search: debouncedSearch,
      }),
    enabled: !!profile,
  });

  useEffect(() => {
    setSelectedId((current) => {
      if (current && shipments.some((r) => r.id === current)) return current;
      return shipments[0]?.id ?? null;
    });
  }, [shipments]);

  const visibleShipments = useMemo(() => {
    if (statusTab === 'all') return shipments;
    if (statusTab === 'at_origin') {
      return shipments.filter((s) => AT_ORIGIN_STATUSES.includes(s.status));
    }
    if (statusTab === 'in_transit') {
      return shipments.filter((s) => IN_TRANSIT_STATUSES.includes(s.status));
    }
    if (statusTab === 'at_destination') {
      return shipments.filter((s) => s.status === 'delivered');
    }
    return shipments.filter((s) => s.status === 'completed' || s.status === 'archived');
  }, [shipments, statusTab]);

  useEffect(() => {
    if (visibleShipments.length === 0) return;
    if (!selectedId || !visibleShipments.some((s) => s.id === selectedId)) {
      setSelectedId(visibleShipments[0].id);
    }
  }, [visibleShipments, selectedId]);

  const selected = shipments.find((s) => s.id === selectedId) ?? null;
  const selectedStatusMeta = selected
    ? SHIPMENT_STATUS_META[selected.status] ?? {
        label: selected.status ?? 'Unknown',
        color: 'bg-muted text-muted-foreground',
        step: -1,
      }
    : null;

  // Load timeline for the selected shipment
  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ['shipment-timeline', selectedId],
    queryFn: () => fetchShipmentTimeline(selectedId!),
    enabled: !!selectedId,
  });

  const isCancelled = selected?.status === 'cancelled';
  const currentStep = selected ? (isCancelled ? -1 : selectedStatusMeta!.step) : -1;
  const progressPct =
    selected && !isCancelled
      ? (currentStep / (SHIPMENT_STATUS_FLOW.length - 1)) * 100
      : 0;

  return (
    <div className="space-y-4 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Radar className="h-6 w-6 text-blue-600" />
          Tracking
        </h1>
        <p className="text-sm text-muted-foreground">
          Real-time visibility of your shipments, status, and updates.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              statusTab === tab.value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, tracking, or container number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as 'all' | ShipmentType)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Modes" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
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

      {/* Main split view */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Shipment list */}
        <Card className="lg:h-[calc(100vh-22rem)]">
          <CardContent className="flex h-full flex-col p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">
                {loading ? '—' : visibleShipments.length} Shipment
                {visibleShipments.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : visibleShipments.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No shipments found"
                  message="Try adjusting your filters."
                />
              ) : (
                <div className="space-y-1 p-2">
                  {visibleShipments.map((s) => {
                    const meta = SHIPMENT_STATUS_META[s.status] ?? {
                      label: s.status ?? 'Unknown',
                      color: 'bg-muted text-muted-foreground',
                      step: -1,
                    };
                    const active = s.id === selectedId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className={cn(
                          'w-full rounded-lg border p-3 text-left transition-colors',
                          active
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent hover:bg-accent'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">
                            {s.reference_number ?? '—'}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`shrink-0 text-[10px] ${meta.color}`}
                          >
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {s.customer?.company_name ?? '—'}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {s.origin ?? '—'} → {s.destination ?? '—'}
                        </p>
                        {s.estimated_arrival && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            ETA: {formatDate(s.estimated_arrival)}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ) : !selected ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Radar}
                  title="No shipment selected"
                  message="Choose a shipment from the list to see its live status."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Overview */}
              <Card>
                <CardContent className="space-y-5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight">
                          {selected.reference_number ?? 'Shipment'}
                        </h2>
                        <Badge
                          variant="secondary"
                          className={selectedStatusMeta!.color}
                        >
                          {selectedStatusMeta!.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selected.customer?.company_name ?? 'Unknown customer'}
                      </p>
                    </div>
                    <Link to={`/shipments/${selected.id}`}>
                      <Button variant="outline" size="sm">
                        Full Details
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    {selected.carrier && <span>Carrier: {selected.carrier}</span>}
                    {selected.tracking_number && (
                      <span>Tracking: {selected.tracking_number}</span>
                    )}
                    {selected.container_number && (
                      <span>Container: {selected.container_number}</span>
                    )}
                  </div>

                  {/* Progress stepper */}
                  {isCancelled ? (
                    <div className="flex items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 py-4">
                      <p className="text-sm font-medium text-red-700">
                        This shipment has been cancelled.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center overflow-x-auto pb-1">
                      {SHIPMENT_STATUS_FLOW.map((status, idx) => {
                        const meta = SHIPMENT_STATUS_META[status] ?? {
                          label: status ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                          step: -1,
                        };
                        const isComplete = meta.step <= currentStep;
                        const isCurrent = meta.step === currentStep;
                        const isLast = idx === SHIPMENT_STATUS_FLOW.length - 1;
                        return (
                          <div key={status} className="flex items-center">
                            <div className="flex flex-col items-center gap-1.5 min-w-[84px]">
                              <div
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-full border-2',
                                  isCurrent
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : isComplete
                                      ? 'border-primary/30 bg-primary/10 text-primary'
                                      : 'border-border bg-background text-muted-foreground'
                                )}
                              >
                                {isComplete && !isCurrent ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <span className="text-xs font-semibold">
                                    {meta.step + 1}
                                  </span>
                                )}
                              </div>
                              <span
                                className={cn(
                                  'text-[11px] font-medium text-center',
                                  isCurrent
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {meta.label}
                              </span>
                            </div>
                            {!isLast && (
                              <div
                                className={cn(
                                  'mx-1 h-0.5 w-8 sm:w-12',
                                  isComplete ? 'bg-primary/40' : 'bg-border'
                                )}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Route progress (no live map — origin/destination + status-based progress) */}
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 font-medium">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {selected.origin ?? '—'}
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        {selected.destination ?? '—'}
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.max(progressPct, 4)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {isCancelled
                        ? 'Route progress unavailable'
                        : `${selectedStatusMeta!.label} · ETA ${formatDate(selected.estimated_arrival)}`}
                    </p>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <InfoItem icon={User} label="Assigned" value={selected.assigned_user?.full_name} />
                    <InfoItem icon={Truck} label="Branch" value={selected.branch?.name} />
                    <InfoItem
                      icon={Weight}
                      label="Weight"
                      value={selected.weight != null ? `${selected.weight} kg` : undefined}
                    />
                    <InfoItem
                      icon={Box}
                      label="Volume"
                      value={selected.volume != null ? `${selected.volume} m³` : undefined}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Latest updates */}
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Latest Updates</h3>
                  </div>
                  {timelineLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : timeline.length === 0 ? (
                    <EmptyState icon={Clock} title="No updates yet" compact />
                  ) : (
                    <div className="relative space-y-4 before:absolute before:left-[3px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
                      {timeline.map((entry) => {
                        const meta = SHIPMENT_STATUS_META[entry.status] ?? {
                          label: entry.status ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                          step: -1,
                        };
                        return (
                          <div key={entry.id} className="relative flex gap-3 pl-5">
                            <div className="absolute left-0 top-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-primary ring-4 ring-card" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                {meta.label}
                                {entry.notes ? ` — ${entry.notes}` : ''}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entry.user?.full_name ?? 'System'} ·{' '}
                                {formatDateTime(entry.created_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-0.5 truncate text-sm font-medium">{value ?? '—'}</p>
    </div>
  );
}
