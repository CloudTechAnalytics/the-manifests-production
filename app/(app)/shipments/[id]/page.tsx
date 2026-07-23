'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Package,
  MapPin,
  Calendar,
  User,
  Truck,
  FileText,
  FolderOpen,
  Clock,
  Loader2,
  Plane,
  Ship,
  Train,
  Waypoints,
  Check,
  X,
  Weight,
  Box,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SHIPMENT_STATUS_META,
  SHIPMENT_STATUS_FLOW,
  formatDate,
  formatDateTime,
} from '@/lib/utils/status';
import type {
  Shipment,
  ShipmentStatus,
  ShipmentTimelineEntry,
  ShipmentType,
  Customer,
  Profile,
  DocumentRecord,
  Branch,
} from '@/types';

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

type ShipmentDetail = Shipment & {
  customer: Customer | null;
  branch: Branch | null;
  assigned_user: Profile | null;
};

type TimelineEntry = ShipmentTimelineEntry & {
  user: { id: string; full_name: string } | null;
};

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const shipmentId = params.id;

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Add-to-timeline form state
  const [timelineStatus, setTimelineStatus] = useState<ShipmentStatus>(
    'documentation'
  );
  const [timelineNotes, setTimelineNotes] = useState('');
  const [addingTimeline, setAddingTimeline] = useState(false);

  const loadData = useCallback(async () => {
    if (!shipmentId) return;
    setLoading(true);
    try {
      // Shipment with joins
      const { data: ship, error: shipErr } = await supabase
        .from('shipments')
        .select(
          '*, customer:customers(*), branch:branches(*), assigned_user:profiles!shipments_assigned_to_fkey(*)'
        )
        .eq('id', shipmentId)
        .is('deleted_at', null)
        .maybeSingle();

      if (shipErr) {
        console.error('Error loading shipment:', shipErr);
        setShipment(null);
        return;
      }
      if (!ship) {
        setShipment(null);
        return;
      }
      setShipment(ship as ShipmentDetail);

      // Timeline
      const { data: tl } = await supabase
        .from('shipment_timeline')
        .select('*, user:profiles!shipment_timeline_created_by_fkey(id, full_name)')
        .eq('shipment_id', shipmentId)
        .order('created_at', { ascending: false });
      setTimeline((tl as TimelineEntry[]) ?? []);

      // Documents
      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .eq('shipment_id', shipmentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      setDocuments((docs as DocumentRecord[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Status update handler ------------------------------------------------

  const handleStatusChange = async (target: ShipmentStatus) => {
    if (!shipment || !profile) return;
    setUpdatingStatus(true);
    try {
      // 1. Update shipment status
      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          status: target,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId);

      if (updateError) throw updateError;

      // 2. Insert timeline entry
      const { error: timelineError } = await supabase
        .from('shipment_timeline')
        .insert({
          shipment_id: shipmentId,
          status: target,
          notes: `Status updated to "${SHIPMENT_STATUS_META[target].label}"`,
          created_by: profile.id,
        });

      if (timelineError) {
        console.error('Timeline insert error:', timelineError);
      }

      // 3. Log activity
      const { error: activityError } = await supabase
        .from('activities')
        .insert({
          user_id: profile.id,
          branch_id: shipment.branch_id,
          action: 'shipment.status_changed',
          entity_type: 'shipment',
          entity_id: shipmentId,
          description: `Shipment ${shipment.reference_number ?? ''} status changed from "${SHIPMENT_STATUS_META[shipment.status].label}" to "${SHIPMENT_STATUS_META[target].label}"`,
          metadata: {
            from: shipment.status,
            to: target,
            reference_number: shipment.reference_number,
          },
        });

      if (activityError) {
        console.error('Activity log error:', activityError);
      }

      toast.success(`Shipment marked as ${SHIPMENT_STATUS_META[target].label}`);
      loadData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update status';
      toast.error(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // --- Add timeline entry handler -------------------------------------------

  const handleAddTimeline = async () => {
    if (!shipment || !profile) return;
    setAddingTimeline(true);
    try {
      // 1. Update shipment status
      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          status: timelineStatus,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId);

      if (updateError) throw updateError;

      // 2. Insert timeline entry
      const { error: timelineError } = await supabase
        .from('shipment_timeline')
        .insert({
          shipment_id: shipmentId,
          status: timelineStatus,
          notes: timelineNotes || null,
          created_by: profile.id,
        });

      if (timelineError) throw timelineError;

      // 3. Log activity
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: shipment.branch_id,
        action: 'shipment.timeline_added',
        entity_type: 'shipment',
        entity_id: shipmentId,
        description: `Timeline entry added to shipment ${shipment.reference_number ?? ''}: "${SHIPMENT_STATUS_META[timelineStatus].label}"`,
        metadata: {
          status: timelineStatus,
          reference_number: shipment.reference_number,
        },
      });

      toast.success('Timeline entry added');
      setTimelineNotes('');
      loadData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to add timeline entry';
      toast.error(message);
    } finally {
      setAddingTimeline(false);
    }
  };

  // --- Delete handler -------------------------------------------------------

  const handleDelete = async () => {
    if (!shipment || !profile) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('shipments')
        .update({
          deleted_at: new Date().toISOString(),
          updated_by: profile.id,
        })
        .eq('id', shipmentId);

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: shipment.branch_id,
        action: 'shipment.deleted',
        entity_type: 'shipment',
        entity_id: shipmentId,
        description: `Deleted shipment ${shipment.reference_number ?? ''}`,
        metadata: {
          reference_number: shipment.reference_number,
          customer_id: shipment.customer_id,
        },
      });

      toast.success('Shipment deleted');
      router.push('/shipments');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete shipment';
      toast.error(message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  // --- Loading state --------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-1" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }

  // --- Not found ------------------------------------------------------------

  if (!shipment) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Package className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Shipment not found</h2>
          <p className="text-sm text-muted-foreground">
            This shipment may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/shipments">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Shipments
          </Button>
        </Link>
      </div>
    );
  }

  // --- Derived values -------------------------------------------------------

  const statusMeta = SHIPMENT_STATUS_META[shipment.status];
  const isCancelled = shipment.status === 'cancelled';
  const currentStep = isCancelled ? -1 : SHIPMENT_STATUS_META[shipment.status].step;
  const TypeIcon = shipment.shipment_type
    ? SHIPMENT_TYPE_ICONS[shipment.shipment_type]
    : null;

  // Next status in the flow (for the primary action button)
  const nextStatus: ShipmentStatus | null = (() => {
    if (isCancelled) return null;
    const idx = SHIPMENT_STATUS_FLOW.indexOf(shipment.status);
    if (idx === -1 || idx >= SHIPMENT_STATUS_FLOW.length - 1) return null;
    return SHIPMENT_STATUS_FLOW[idx + 1];
  })();

  // --- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/shipments">Shipments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{shipment.reference_number ?? 'Shipment'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/shipments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">
                {shipment.reference_number ?? 'Shipment'}
              </h1>
              <Badge variant="secondary" className={statusMeta.color}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {shipment.customer?.company_name ?? 'Unknown customer'}
              {shipment.branch && ` · ${shipment.branch.name} branch`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Status update dropdown */}
          {!isCancelled && shipment.status !== 'delivered' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" disabled={updatingStatus}>
                {updatingStatus ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="mr-1.5 h-4 w-4" />
                )}
                Update Status
              </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Advance to…</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SHIPMENT_STATUS_FLOW.map((s) => {
                  const meta = SHIPMENT_STATUS_META[s];
                  const isCurrent = s === shipment.status;
                  const isPast =
                    !isCurrent && meta.step < currentStep;
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={isCurrent}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {isCurrent && (
                          <Check className="h-3.5 w-3.5 text-blue-600" />
                        )}
                        {isPast && (
                          <Check className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {meta.label}
                      </span>
                      {isCurrent && (
                        <span className="text-xs text-muted-foreground">
                          current
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleStatusChange('cancelled')}
                  className="text-destructive focus:text-destructive"
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  Cancel Shipment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Link href={`/shipments/${shipmentId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete shipment?</DialogTitle>
                <DialogDescription>
                  This will soft-delete shipment{' '}
                  &quot;{shipment.reference_number}&quot;. The record is
                  retained but hidden from lists. This action can be undone by
                  an admin.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status Workflow Visualizer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-4 w-4 text-blue-600" />
            Shipment Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isCancelled ? (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 py-6">
              <X className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-700">
                  Shipment Cancelled
                </p>
                <p className="text-sm text-red-600">
                  This shipment has been cancelled and is no longer in active
                  transit.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center overflow-x-auto pb-2">
              {SHIPMENT_STATUS_FLOW.map((status, idx) => {
                const meta = SHIPMENT_STATUS_META[status];
                const isComplete = meta.step <= currentStep;
                const isCurrent = meta.step === currentStep;
                const isLast = idx === SHIPMENT_STATUS_FLOW.length - 1;
                return (
                  <div
                    key={status}
                    className="flex items-center"
                  >
                    <div className="flex flex-col items-center gap-2 min-w-[100px]">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                          isCurrent
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : isComplete
                            ? 'border-blue-300 bg-blue-50 text-blue-600'
                            : 'border-gray-200 bg-white text-gray-400'
                        }`}
                      >
                        {isComplete && !isCurrent ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <span className="text-sm font-semibold">
                            {meta.step + 1}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium text-center ${
                          isCurrent
                            ? 'text-blue-700'
                            : isComplete
                            ? 'text-blue-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    {!isLast && (
                      <div
                        className={`h-0.5 w-12 mx-1 transition-colors ${
                          isComplete
                            ? 'bg-blue-300'
                            : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Overview | Timeline | Documents */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Package className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FolderOpen className="h-4 w-4" />
            Documents
          </TabsTrigger>
        </TabsList>

        {/* --- Overview Tab --- */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left: Shipment Info */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Package className="h-4 w-4 text-blue-600" />
                    Shipment Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <InfoRow
                    icon={User}
                    label="Customer"
                    value={shipment.customer?.company_name ?? null}
                  />
                  <InfoRow
                    icon={Package}
                    label="Type"
                    value={
                      shipment.shipment_type
                        ? SHIPMENT_TYPE_LABELS[shipment.shipment_type]
                        : null
                    }
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Origin"
                    value={shipment.origin}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Destination"
                    value={shipment.destination}
                  />
                  <Separator />
                  <InfoRow
                    icon={Calendar}
                    label="Booking Date"
                    value={formatDate(shipment.booking_date)}
                  />
                  <InfoRow
                    icon={Calendar}
                    label="Est. Departure"
                    value={formatDate(shipment.estimated_departure)}
                  />
                  <InfoRow
                    icon={Calendar}
                    label="Est. Arrival"
                    value={formatDate(shipment.estimated_arrival)}
                  />
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">
                      {formatDate(shipment.created_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Updated</span>
                    <span className="font-medium">
                      {formatDate(shipment.updated_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Assigned Staff */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <User className="h-4 w-4 text-blue-600" />
                    Assigned Staff
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {shipment.assigned_user ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {shipment.assigned_user.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {shipment.assigned_user.role.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No staff assigned to this shipment.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Shipment Details Grid + Notes */}
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Shipment Details
                  </CardTitle>
                  <CardDescription>
                    Carrier, tracking, and cargo information.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      icon={Truck}
                      label="Carrier"
                      value={shipment.carrier}
                    />
                    <DetailItem
                      icon={FileText}
                      label="Tracking Number"
                      value={shipment.tracking_number}
                    />
                    <DetailItem
                      icon={Package}
                      label="Container Number"
                      value={shipment.container_number}
                    />
                    <DetailItem
                      icon={Weight}
                      label="Weight"
                      value={
                        shipment.weight != null
                          ? `${shipment.weight} kg`
                          : null
                      }
                    />
                    <DetailItem
                      icon={Box}
                      label="Volume"
                      value={
                        shipment.volume != null
                          ? `${shipment.volume} m³`
                          : null
                      }
                    />
                    <DetailItem
                      icon={Calendar}
                      label="Actual Departure"
                      value={formatDate(shipment.actual_departure)}
                    />
                    <DetailItem
                      icon={Calendar}
                      label="Actual Arrival"
                      value={formatDate(shipment.actual_arrival)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {shipment.notes ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {shipment.notes}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No notes recorded for this shipment.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* --- Timeline Tab --- */}
        <TabsContent value="timeline" className="space-y-6">
          {/* Add Timeline Entry Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Plus className="h-4 w-4 text-blue-600" />
                Add Timeline Entry
              </CardTitle>
              <CardDescription>
                Update the shipment status and add a note to the timeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="timeline-status">Status</Label>
                  <Select
                    value={timelineStatus}
                    onValueChange={(v) =>
                      setTimelineStatus(v as ShipmentStatus)
                    }
                  >
                    <SelectTrigger id="timeline-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIPMENT_STATUS_FLOW.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SHIPMENT_STATUS_META[s].label}
                        </SelectItem>
                      ))}
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timeline-notes">Notes (optional)</Label>
                  <Textarea
                    id="timeline-notes"
                    rows={2}
                    placeholder="Add a note about this status change…"
                    value={timelineNotes}
                    onChange={(e) => setTimelineNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleAddTimeline}
                  disabled={addingTimeline}
                  size="sm"
                >
                  {addingTimeline && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Add Entry
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Timeline List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-4 w-4 text-blue-600" />
                Status History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No timeline entries yet.
                </p>
              ) : (
                <div className="relative space-y-6 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:bg-blue-100">
                  {timeline.map((entry) => {
                    const meta = SHIPMENT_STATUS_META[entry.status];
                    return (
                      <div
                        key={entry.id}
                        className="relative flex gap-4 pl-0"
                      >
                        <div
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.color} ring-4 ring-white`}
                        >
                          <Check className="h-4 w-4" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`text-[11px] ${meta.color}`}
                            >
                              {meta.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(entry.created_at)}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="mt-1.5 text-sm text-foreground">
                              {entry.notes}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            by {entry.user?.full_name ?? 'System'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Documents Tab --- */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                Shipment Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {documents.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No documents uploaded for this shipment yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            {d.name}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {d.category.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.file_size
                            ? `${(d.file_size / 1024).toFixed(1)} KB`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(d.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Small presentational helpers ----------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          <p className="break-words text-sm font-medium">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-medium">
        {value ?? <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}
