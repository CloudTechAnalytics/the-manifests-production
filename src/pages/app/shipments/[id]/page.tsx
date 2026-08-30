'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Landmark,
  Building2,
  FileSearch,
  ListChecks,
  AlertTriangle,
  Shield,
  Container as ContainerIcon,
  Banknote,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { cn, getErrorMessage } from '@/lib/utils';
import { adminForceDelete } from '@/lib/utils/admin-delete';
import { canDeleteOwnRecord } from '@/lib/utils/ownership';
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
import { LifecycleTimeline } from '@/components/shipments/lifecycle-timeline';
import { ShipmentWorkflowPanel } from '@/components/shipments/shipment-workflow-panel';
import { ShipmentDocumentsPanel } from '@/components/shipments/shipment-documents-panel';
import { CustomsFormDialog } from '@/components/customs/customs-form-dialog';
import { DutyAssessmentCard } from '@/components/customs/duty-assessment-card';
import { DutyAssessmentDialog } from '@/components/customs/duty-assessment-dialog';
import { TerminalFormDialog } from '@/components/terminal/terminal-form-dialog';
import { ExaminationFormDialog } from '@/components/examination/examination-form-dialog';
import { TransportationFormDialog } from '@/components/transportation/transportation-form-dialog';
import { FinancialExposurePanel } from '@/components/shipments/financial-exposure-panel';
import { checkShipmentStatusReadiness } from '@/lib/utils/workflow-rules';
import { ShipmentDocumentationDialog } from '@/components/shipments/shipment-documentation-dialog';
import { ShipmentPartiesDialog } from '@/components/shipments/shipment-parties-dialog';
import { ShipmentContainersPanel } from '@/components/shipments/shipment-containers-panel';
import { CargoInsurancePanel } from '@/components/shipments/cargo-insurance-panel';
import { CargoClaimsPanel } from '@/components/shipments/cargo-claims-panel';
import { DeliveryOrdersPanel } from '@/components/shipments/delivery-orders-panel';
import { GenerateInvoiceFromExpenses } from '@/components/shipments/generate-invoice-from-expenses';
import { CustomsBondsPanel } from '@/components/customs/customs-bonds-panel';
import {
  SHIPMENT_STATUS_META,
  SHIPMENT_STATUS_FLOW,
  formatDate,
  formatDateTime,
  formatCurrency,
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
  ShipmentCustoms,
  TerminalOperation,
  ShipmentExamination,
  ShipmentTransportation,
  ShipmentContainer,
  CargoInsurancePolicy,
  CargoClaim,
  DeliveryOrder,
  CustomsBond,
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

const KNOWN_TABS = new Set([
  'overview', 'timeline', 'workflow', 'documents', 'cargo', 'customs', 'terminal', 'examination', 'transportation',
  'financial_exposure',
]);

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, hasRole } = useAuth();

  const shipmentId = params.id!;
  // A department queue links straight into the right tab, e.g. ?tab=customs.
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab && KNOWN_TABS.has(requestedTab) ? requestedTab : 'overview';

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [customsRecord, setCustomsRecord] = useState<ShipmentCustoms | null>(null);
  const [terminalRecord, setTerminalRecord] = useState<TerminalOperation | null>(null);
  const [examinations, setExaminations] = useState<ShipmentExamination[]>([]);
  const [transportLegs, setTransportLegs] = useState<ShipmentTransportation[]>([]);
  const [containers, setContainers] = useState<ShipmentContainer[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<CargoInsurancePolicy[]>([]);
  const [claims, setClaims] = useState<CargoClaim[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [customsBonds, setCustomsBonds] = useState<CustomsBond[]>([]);
  const [customsDialogOpen, setCustomsDialogOpen] = useState(false);
  const [dutyAssessmentDialogOpen, setDutyAssessmentDialogOpen] = useState(false);
  const [terminalDialogOpen, setTerminalDialogOpen] = useState(false);
  const [documentationDialogOpen, setDocumentationDialogOpen] = useState(false);
  const [partiesDialogOpen, setPartiesDialogOpen] = useState(false);
  const [examinationDialog, setExaminationDialog] = useState<{ existing: ShipmentExamination | null } | null>(
    null
  );
  const [transportDialog, setTransportDialog] = useState<{ existing: ShipmentTransportation | null } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDelete = !!shipment && canDeleteOwnRecord({ hasRole });
  // Shipment ownership: Operations owns the shipment (mirrors
  // insert/update_shipments_branch RLS's can_manage_operations()).
  // Sales and every other non-operations track can View/Track but not
  // Edit/Assign/Update Status.
  const canManageShipment = hasRole('admin') || hasRole('branch_manager') || hasRole('operations');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [stagesVersion, setStagesVersion] = useState(0);
  const [statusBlockers, setStatusBlockers] = useState<string[]>([]);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

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
      // All nine of these only depend on shipmentId, not on each other —
      // one concurrent batch instead of shipment, then timeline, then
      // documents, then the rest. The (rare) case where shipmentId turns
      // out not to exist just means the other eight resolve to empty/null
      // results that are never rendered — a discarded response, not a
      // wrong one.
      const [
        { data: ship, error: shipErr },
        { data: tl },
        { data: docs },
        { data: customs },
        { data: terminal },
        { data: exams },
        { data: legs },
        { data: containerRows },
        { data: insuranceRows },
        { data: claimRows },
        { data: doRows },
        { data: bondRows },
      ] = await Promise.all([
        supabase
          .from('shipments')
          .select(
            '*, customer:customers(*), branch:branches(*), assigned_user:profiles!shipments_assigned_to_fkey(*)'
          )
          .eq('id', shipmentId)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('shipment_timeline')
          .select('*, user:profiles!shipment_timeline_created_by_fkey(id, full_name)')
          .eq('shipment_id', shipmentId)
          .order('created_at', { ascending: false }),
        supabase
          .from('documents')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('shipment_customs')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('terminal_operations')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('shipment_examinations')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('shipment_transportation')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('shipment_containers')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
        supabase
          .from('cargo_insurance_policies')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('cargo_claims')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('delivery_orders')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('issued_at', { ascending: false }),
        supabase
          .from('customs_bonds')
          .select('*')
          .eq('shipment_id', shipmentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

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
      setTimeline((tl as TimelineEntry[]) ?? []);
      setDocuments((docs as DocumentRecord[]) ?? []);
      setCustomsRecord((customs as ShipmentCustoms) ?? null);
      setTerminalRecord((terminal as TerminalOperation) ?? null);
      setExaminations((exams as ShipmentExamination[]) ?? []);
      setTransportLegs((legs as ShipmentTransportation[]) ?? []);
      setContainers((containerRows as ShipmentContainer[]) ?? []);
      setInsurancePolicies((insuranceRows as CargoInsurancePolicy[]) ?? []);
      setClaims((claimRows as CargoClaim[]) ?? []);
      setDeliveryOrders((doRows as DeliveryOrder[]) ?? []);
      setCustomsBonds((bondRows as CustomsBond[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Next status in the flow — used both to gate what "Update Status" can do
  // and to check readiness for it below.
  const nextStatus: ShipmentStatus | null =
    shipment && shipment.status !== 'cancelled'
      ? SHIPMENT_STATUS_FLOW[SHIPMENT_STATUS_FLOW.indexOf(shipment.status) + 1] ?? null
      : null;

  // Re-checks whenever the shipment's status (or its related records)
  // changes — loadData already reruns on every save elsewhere on this page,
  // and stagesVersion bumps on workflow changes, so this stays current
  // without its own polling.
  useEffect(() => {
    if (!shipmentId || !nextStatus) {
      setStatusBlockers([]);
      return;
    }
    let cancelled = false;
    setCheckingReadiness(true);
    checkShipmentStatusReadiness(shipmentId, nextStatus)
      .then((readiness) => {
        if (!cancelled) setStatusBlockers(readiness.blockers);
      })
      .finally(() => {
        if (!cancelled) setCheckingReadiness(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, nextStatus, stagesVersion, timeline.length, documents.length]);

  // Keep the Timeline tab's status picker defaulted to the next step
  // rather than a fixed value unrelated to where the shipment actually is.
  useEffect(() => {
    if (nextStatus) setTimelineStatus(nextStatus);
    else if (shipment) setTimelineStatus(shipment.status);
  }, [nextStatus, shipment]);

  // --- Status update handler ------------------------------------------------

  const handleStatusChange = async (target: ShipmentStatus) => {
    if (!shipment || !profile) return;

    // Enforced here too, not just in which buttons the UI offers — a
    // direct call can't skip more than one step, and a forward step must
    // pass its readiness check. Backward moves (corrections) and
    // cancellation are never blocked.
    const currentIdx = SHIPMENT_STATUS_FLOW.indexOf(shipment.status);
    const targetIdx = SHIPMENT_STATUS_FLOW.indexOf(target);
    const isForwardAdjacent = targetIdx === currentIdx + 1;
    const isBackwardAdjacent = targetIdx !== -1 && targetIdx === currentIdx - 1;
    if (target !== 'cancelled' && !isForwardAdjacent && !isBackwardAdjacent) {
      toast.error('A shipment can only move one status at a time.');
      return;
    }
    if (isForwardAdjacent) {
      const readiness = await checkShipmentStatusReadiness(shipmentId, target);
      if (!readiness.ready) {
        toast.error(
          `Can't mark as "${SHIPMENT_STATUS_META[target].label}" yet — ${readiness.blockers[0]}`
        );
        setStatusBlockers(readiness.blockers);
        return;
      }
    }

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
          description: `Shipment ${shipment.reference_number ?? ''} status changed from "${SHIPMENT_STATUS_META[shipment.status]?.label ?? shipment.status}" to "${SHIPMENT_STATUS_META[target].label}"`,
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
        getErrorMessage(err, 'Failed to update status');
      toast.error(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // --- Add timeline entry handler -------------------------------------------

  const handleAddTimeline = async () => {
    if (!shipment || !profile) return;

    // Same one-step-at-a-time + readiness gate as the "Update Status"
    // button — this form is another path to the same status field.
    const currentIdx = SHIPMENT_STATUS_FLOW.indexOf(shipment.status);
    const targetIdx = SHIPMENT_STATUS_FLOW.indexOf(timelineStatus);
    const isForwardAdjacent = targetIdx === currentIdx + 1;
    const isBackwardAdjacent = targetIdx !== -1 && targetIdx === currentIdx - 1;
    const isSame = timelineStatus === shipment.status;
    if (timelineStatus !== 'cancelled' && !isForwardAdjacent && !isBackwardAdjacent && !isSame) {
      toast.error('A shipment can only move one status at a time.');
      return;
    }
    if (isForwardAdjacent) {
      const readiness = await checkShipmentStatusReadiness(shipmentId, timelineStatus);
      if (!readiness.ready) {
        toast.error(
          `Can't mark as "${SHIPMENT_STATUS_META[timelineStatus].label}" yet — ${readiness.blockers[0]}`
        );
        setStatusBlockers(readiness.blockers);
        return;
      }
    }

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
        getErrorMessage(err, 'Failed to add timeline entry');
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
      if (hasRole('admin')) {
        const result = await adminForceDelete('shipment', shipmentId);
        if (!result.success) throw new Error(result.error);
        toast.success('Shipment permanently deleted');
        navigate('/shipments');
        return;
      }

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
      navigate('/shipments');
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to delete shipment');
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
        <Link to="/shipments">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Shipments
          </Button>
        </Link>
      </div>
    );
  }

  // --- Derived values -------------------------------------------------------

  const statusMeta = SHIPMENT_STATUS_META[shipment.status] ?? {
    label: shipment.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
    step: -1,
  };
  const isCancelled = shipment.status === 'cancelled';
  const currentStep = isCancelled ? -1 : statusMeta.step;
  const TypeIcon = shipment.shipment_type
    ? SHIPMENT_TYPE_ICONS[shipment.shipment_type]
    : null;

  // Previous status in the flow (for the "move back" correction action).
  const previousStatus: ShipmentStatus | null =
    !isCancelled && SHIPMENT_STATUS_FLOW.indexOf(shipment.status) > 0
      ? SHIPMENT_STATUS_FLOW[SHIPMENT_STATUS_FLOW.indexOf(shipment.status) - 1]
      : null;

  // What the Timeline tab's status picker is allowed to offer — same
  // one-step-at-a-time rule as the header dropdown, plus the current
  // status itself (for a progress note with no status change).
  const allowedTimelineStatuses: ShipmentStatus[] = [
    shipment.status,
    ...(nextStatus ? [nextStatus] : []),
    ...(previousStatus ? [previousStatus] : []),
  ];

  // --- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/shipments">Shipments</Link>
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
          <Link to="/shipments">
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
          {/* Status update dropdown — one step at a time only; advancing
              is gated by checkShipmentStatusReadiness (see handleStatusChange).
              Operations-owned: Sales/other tracks can View/Track but not
              change status (mirrors update_shipments_branch RLS). */}
          {canManageShipment && !isCancelled && shipment.status !== 'delivered' && (
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
              <DropdownMenuContent align="end" className="w-64">
                {nextStatus && (
                  <>
                    <DropdownMenuLabel>Next step</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleStatusChange(nextStatus)}
                      disabled={checkingReadiness || statusBlockers.length > 0}
                      className="flex flex-col items-start gap-1 whitespace-normal"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <ChevronRight className="h-3.5 w-3.5 text-primary" />
                        Mark as {SHIPMENT_STATUS_META[nextStatus].label}
                      </span>
                      {statusBlockers.length > 0 && (
                        <span className="pl-5 text-xs text-muted-foreground">
                          Blocked — see checklist below
                        </span>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
                {previousStatus && (
                  <DropdownMenuItem onClick={() => handleStatusChange(previousStatus)}>
                    Move back to {SHIPMENT_STATUS_META[previousStatus].label}
                  </DropdownMenuItem>
                )}
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

          {canManageShipment && (
            <Link to={`/shipments/${shipmentId}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
          {canDelete && (
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
                  <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete shipment?</DialogTitle>
                  <DialogDescription>
                    {hasRole('admin') ? (
                      <>
                        This permanently deletes shipment{' '}
                        &quot;{shipment.reference_number}&quot; and everything under
                        it — timeline, documents, customs, terminal, examination, and
                        transportation records. This cannot be undone.
                      </>
                    ) : (
                      <>
                        This will soft-delete shipment{' '}
                        &quot;{shipment.reference_number}&quot;. The record is
                        retained but hidden from lists. This action can be undone by
                        an admin.
                      </>
                    )}
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
          )}
        </div>
      </div>

      {/* What's next — always visible so requirements aren't a surprise
          when someone tries (and fails) to advance the status. */}
      {nextStatus && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3',
            checkingReadiness
              ? 'border-border bg-muted/40'
              : statusBlockers.length > 0
                ? 'border-amber-300 bg-amber-50'
                : 'border-emerald-300 bg-emerald-50'
          )}
        >
          {checkingReadiness ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : statusBlockers.length > 0 ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {checkingReadiness
                ? 'Checking what’s needed to advance…'
                : statusBlockers.length > 0
                  ? `Before this can be marked "${SHIPMENT_STATUS_META[nextStatus].label}":`
                  : `Ready to mark as "${SHIPMENT_STATUS_META[nextStatus].label}".`}
            </p>
            {!checkingReadiness && statusBlockers.length > 0 && (
              <ul className="ml-4 mt-1.5 list-disc space-y-0.5 text-sm text-amber-800">
                {statusBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Lifecycle timeline: Booking through Completed, spanning customs,
          terminal, examination, release readiness, and transportation —
          not just the base shipment status. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-4 w-4 text-blue-600" />
            Shipment Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LifecycleTimeline shipment={shipment} refreshToken={stagesVersion} />
        </CardContent>
      </Card>

      {/* Tabs: Overview | Timeline | Workflow | Documents | Customs | Terminal | Examination | Transportation */}
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Package className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5">
            <ListChecks className="h-4 w-4" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FolderOpen className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="cargo" className="gap-1.5">
            <ContainerIcon className="h-4 w-4" />
            Cargo &amp; Docs
          </TabsTrigger>
          <TabsTrigger value="customs" className="gap-1.5">
            <Landmark className="h-4 w-4" />
            Customs
          </TabsTrigger>
          <TabsTrigger value="terminal" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            Terminal
          </TabsTrigger>
          {customsRecord?.inspection_channel === 'red' && (
            <TabsTrigger value="examination" className="gap-1.5">
              <FileSearch className="h-4 w-4" />
              Examination
            </TabsTrigger>
          )}
          <TabsTrigger value="transportation" className="gap-1.5">
            <Truck className="h-4 w-4" />
            Transportation
          </TabsTrigger>
          <TabsTrigger value="financial_exposure" className="gap-1.5">
            <Banknote className="h-4 w-4" />
            Financial Exposure
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
                        ? SHIPMENT_TYPE_LABELS[shipment.shipment_type] ?? shipment.shipment_type
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
          {/* Add Timeline Entry Form — Operations-owned, same rule as
              Update Status above; Sales/other tracks can view history
              below but not add to it. */}
          {canManageShipment && (
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
                      {allowedTimelineStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SHIPMENT_STATUS_META[s]?.label ?? s}
                          {s === shipment.status && ' (current)'}
                        </SelectItem>
                      ))}
                      {!isCancelled && <SelectItem value="cancelled">Cancelled</SelectItem>}
                    </SelectContent>
                  </Select>
                  {timelineStatus === nextStatus && statusBlockers.length > 0 && (
                    <p className="text-xs text-amber-700">
                      Not ready yet — see the checklist near the top of this page.
                    </p>
                  )}
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
          )}

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
                    const meta = SHIPMENT_STATUS_META[entry.status] ?? {
                      label: entry.status ?? 'Unknown',
                      color: 'bg-muted text-muted-foreground',
                      step: -1,
                    };
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

        {/* --- Workflow Tab --- */}
        <TabsContent value="workflow">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Workflow Stages</CardTitle>
              <CardDescription>
                Start, complete, or skip each stage. Completing a stage checks that its
                requirements are met first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShipmentWorkflowPanel
                shipmentId={shipmentId}
                branchId={shipment.branch_id}
                onChanged={() => setStagesVersion((v) => v + 1)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Documents Tab --- */}
        <TabsContent value="documents">
          <ShipmentDocumentsPanel
            shipmentId={shipmentId}
            branchId={shipment.branch_id}
            documents={documents}
            onReload={loadData}
          />
        </TabsContent>

        {/* --- Cargo & Docs Tab --- */}
        <TabsContent value="cargo" className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Trade Documentation</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setDocumentationDialogOpen(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                <InfoRow label="Incoterm" value={shipment.incoterm} />
                <InfoRow label="HS Code" value={shipment.hs_code} />
                <InfoRow label="Commodity" value={shipment.commodity} />
                <InfoRow label="MBL Number" value={shipment.mbl_number} />
                <InfoRow label="HBL Number" value={shipment.hbl_number} />
                <InfoRow label="AWB Number" value={shipment.awb_number} />
                <InfoRow label="Vessel" value={shipment.vessel_name} />
                <InfoRow label="Voyage Number" value={shipment.voyage_number} />
                <InfoRow label="Port of Loading" value={shipment.port_of_loading} />
                <InfoRow label="Port of Discharge" value={shipment.port_of_discharge} />
                <InfoRow
                  label="Goods Value"
                  value={
                    shipment.goods_value != null
                      ? formatCurrency(shipment.goods_value, shipment.goods_value_currency)
                      : null
                  }
                />
                <InfoRow
                  label="Chargeable Weight"
                  value={shipment.chargeable_weight != null ? `${shipment.chargeable_weight} kg` : null}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Cargo Parties</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setPartiesDialogOpen(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Shipper
                  </p>
                  <p className="mt-1 text-sm font-medium">{shipment.shipper_name || '—'}</p>
                  <p className="text-sm text-muted-foreground">{shipment.shipper_address}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Consignee
                  </p>
                  <p className="mt-1 text-sm font-medium">{shipment.consignee_name || '—'}</p>
                  <p className="text-sm text-muted-foreground">{shipment.consignee_address}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notify Party
                  </p>
                  <p className="mt-1 text-sm font-medium">{shipment.notify_party_name || '—'}</p>
                  <p className="text-sm text-muted-foreground">{shipment.notify_party_address}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ShipmentContainersPanel
            shipmentId={shipmentId}
            branchId={shipment.branch_id}
            containers={containers}
            onReload={loadData}
          />

          <CargoInsurancePanel
            shipmentId={shipmentId}
            branchId={shipment.branch_id}
            policies={insurancePolicies}
            onReload={loadData}
          />

          <CargoClaimsPanel
            shipmentId={shipmentId}
            branchId={shipment.branch_id}
            claims={claims}
            insurancePolicies={insurancePolicies}
            onReload={loadData}
          />
        </TabsContent>

        {/* --- Customs Tab --- */}
        <TabsContent value="customs">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Customs</CardTitle>
              <Button size="sm" onClick={() => setCustomsDialogOpen(true)}>
                {customsRecord ? (
                  <>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </>
                ) : (
                  <>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Customs Record
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              {!customsRecord ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  No customs record for this shipment yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <InfoRow label="Declaration Number" value={customsRecord.declaration_number} />
                  <InfoRow label="HS Code" value={customsRecord.hs_code} />
                  <InfoRow label="Customs Office" value={customsRecord.customs_office} />
                  <InfoRow label="Officer" value={customsRecord.officer} />
                  <InfoRow
                    label="Duty Amount"
                    value={formatCurrency(customsRecord.duty_amount, 'NGN')}
                  />
                  <InfoRow
                    label="Duty Paid"
                    value={customsRecord.duty_paid ? `Yes${customsRecord.duty_paid_date ? ` (${formatDate(customsRecord.duty_paid_date)})` : ''}` : 'No'}
                  />
                  <InfoRow
                    label="Inspection Channel"
                    value={customsRecord.inspection_channel ?? 'Not yet assessed'}
                  />
                  <InfoRow label="Status" value={customsRecord.status.replace(/_/g, ' ')} />
                  <InfoRow
                    label="Form M"
                    value={
                      customsRecord.form_m_number
                        ? `${customsRecord.form_m_number}${customsRecord.form_m_date ? ` (${formatDate(customsRecord.form_m_date)})` : ''}`
                        : null
                    }
                  />
                  <InfoRow
                    label="PAAR"
                    value={
                      customsRecord.paar_number
                        ? `${customsRecord.paar_number}${customsRecord.paar_date ? ` (${formatDate(customsRecord.paar_date)})` : ''}`
                        : null
                    }
                  />
                  <InfoRow label="SONCAP Number" value={customsRecord.soncap_number} />
                </div>
              )}
            </CardContent>
          </Card>

          {customsRecord && (
            <div className="mt-4">
              <DutyAssessmentCard
                customsRecord={customsRecord}
                onEdit={() => setDutyAssessmentDialogOpen(true)}
              />
            </div>
          )}

          <div className="mt-4">
            <CustomsBondsPanel
              shipmentId={shipmentId}
              branchId={shipment.branch_id}
              bonds={customsBonds}
              onReload={loadData}
            />
          </div>
        </TabsContent>

        {/* --- Terminal Tab --- */}
        <TabsContent value="terminal">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Terminal Operations</CardTitle>
              <Button size="sm" onClick={() => setTerminalDialogOpen(true)}>
                {terminalRecord ? (
                  <>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </>
                ) : (
                  <>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Terminal Record
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {!terminalRecord ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  No terminal record for this shipment yet.
                </div>
              ) : (
                <>
                  {terminalRecord.free_time_expiry && terminalRecord.status !== 'released' && (
                    <DemurrageAlert expiry={terminalRecord.free_time_expiry} />
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                    <InfoRow label="Terminal Name" value={terminalRecord.terminal_name} />
                    <InfoRow
                      label="Arrival Date"
                      value={terminalRecord.arrival_date ? formatDate(terminalRecord.arrival_date) : null}
                    />
                    <InfoRow label="Container Position" value={terminalRecord.container_position} />
                    <InfoRow label="Holding Bay" value={terminalRecord.holding_bay} />
                    <InfoRow label="Stack Number" value={terminalRecord.stack_number} />
                    <InfoRow label="Gate Pass Number" value={terminalRecord.gate_pass_number} />
                    <InfoRow label="Exit Note Number" value={terminalRecord.exit_note_number} />
                    <InfoRow
                      label="Release Date"
                      value={terminalRecord.release_date ? formatDate(terminalRecord.release_date) : null}
                    />
                    <InfoRow label="Status" value={terminalRecord.status} />
                    <InfoRow
                      label="Free Time"
                      value={
                        terminalRecord.free_time_days != null
                          ? `${terminalRecord.free_time_days} days`
                          : null
                      }
                    />
                    <InfoRow
                      label="Free Time Expires"
                      value={
                        terminalRecord.free_time_expiry
                          ? formatDate(terminalRecord.free_time_expiry)
                          : null
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <DeliveryOrdersPanel
            shipmentId={shipmentId}
            branchId={shipment.branch_id}
            orders={deliveryOrders}
            onReload={loadData}
          />
        </TabsContent>

        {/* --- Examination Tab (only rendered when Customs selected Red channel) --- */}
        {customsRecord?.inspection_channel === 'red' && (
          <TabsContent value="examination">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold">Physical Examination</CardTitle>
                <Button size="sm" onClick={() => setExaminationDialog({ existing: null })}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Log Examination
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {examinations.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    No examinations logged yet.
                  </div>
                ) : (
                  examinations.map((exam) => (
                    <div
                      key={exam.id}
                      className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:border-primary/40"
                      onClick={() => setExaminationDialog({ existing: exam })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {exam.inspection_date ? formatDate(exam.inspection_date) : 'Date not set'}
                        </span>
                        {exam.result && (
                          <Badge variant="secondary" className="capitalize">
                            {exam.result.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <span>Inspection Officer: {exam.inspection_officer ?? '—'}</span>
                        <span>Terminal Officer: {exam.terminal_officer ?? '—'}</span>
                        <span>Shipping Line Rep: {exam.shipping_line_representative ?? '—'}</span>
                        <span>Freight Forwarder: {exam.freight_forwarder_representative ?? '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* --- Transportation Tab --- */}
        <TabsContent value="transportation">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Transportation</CardTitle>
              <Button size="sm" onClick={() => setTransportDialog({ existing: null })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Leg
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {transportLegs.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  No transportation legs yet.
                </div>
              ) : (
                transportLegs.map((leg) => (
                  <div
                    key={leg.id}
                    className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:border-primary/40"
                    onClick={() => setTransportDialog({ existing: leg })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {[leg.truck_number, leg.driver_name].filter(Boolean).join(' · ') || 'Leg details pending'}
                      </span>
                      <Badge variant="secondary" className="capitalize">
                        {leg.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                      <span>Pickup: {leg.pickup_date ? formatDate(leg.pickup_date) : '—'}</span>
                      <span>Departure: {leg.departure_date ? formatDate(leg.departure_date) : '—'}</span>
                      <span>Arrival: {leg.arrival_date ? formatDate(leg.arrival_date) : '—'}</span>
                      <span>Delivery: {leg.delivery_date ? formatDate(leg.delivery_date) : '—'}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Financial Exposure Tab --- */}
        <TabsContent value="financial_exposure" className="space-y-6">
          <FinancialExposurePanel
            shipmentId={shipment.id}
            branchId={shipment.branch_id}
            shipmentStatus={shipment.status}
            defaultCurrency={shipment.goods_value_currency || 'NGN'}
            onChanged={loadData}
          />

          <GenerateInvoiceFromExpenses
            shipmentId={shipment.id}
            branchId={shipment.branch_id}
            customerId={shipment.customer_id}
          />
        </TabsContent>
      </Tabs>

      {shipment && (
        <>
          <ShipmentDocumentationDialog
            open={documentationDialogOpen}
            onOpenChange={setDocumentationDialogOpen}
            shipment={shipment}
            onSaved={loadData}
          />
          <ShipmentPartiesDialog
            open={partiesDialogOpen}
            onOpenChange={setPartiesDialogOpen}
            shipment={shipment}
            onSaved={loadData}
          />
          <CustomsFormDialog
            open={customsDialogOpen}
            onOpenChange={setCustomsDialogOpen}
            shipmentId={shipment.id}
            branchId={shipment.branch_id}
            existing={customsRecord}
            onSaved={loadData}
          />
          {customsRecord && (
            <DutyAssessmentDialog
              open={dutyAssessmentDialogOpen}
              onOpenChange={setDutyAssessmentDialogOpen}
              shipmentId={shipment.id}
              branchId={shipment.branch_id}
              existing={customsRecord}
              onSaved={loadData}
            />
          )}
          <TerminalFormDialog
            open={terminalDialogOpen}
            onOpenChange={setTerminalDialogOpen}
            shipmentId={shipment.id}
            branchId={shipment.branch_id}
            existing={terminalRecord}
            onSaved={loadData}
          />
          {examinationDialog && (
            <ExaminationFormDialog
              open={!!examinationDialog}
              onOpenChange={(open) => !open && setExaminationDialog(null)}
              shipmentId={shipment.id}
              branchId={shipment.branch_id}
              existing={examinationDialog.existing}
              onSaved={loadData}
            />
          )}
          {transportDialog && (
            <TransportationFormDialog
              open={!!transportDialog}
              onOpenChange={(open) => !open && setTransportDialog(null)}
              shipmentId={shipment.id}
              branchId={shipment.branch_id}
              existing={transportDialog.existing}
              onSaved={loadData}
            />
          )}
        </>
      )}
    </div>
  );
}

// --- Small presentational helpers ----------------------------------------

function DemurrageAlert({ expiry }: { expiry: string }) {
  const daysLeft = Math.ceil(
    (new Date(expiry).getTime() - new Date(new Date().toDateString()).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  if (daysLeft > 3) return null;

  const overdue = daysLeft < 0;
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm',
        overdue
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning-foreground'
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="font-medium">
        {overdue
          ? `Free time expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago — demurrage is accruing.`
          : `Free time expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — arrange release or gate-out soon.`}
      </p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
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
