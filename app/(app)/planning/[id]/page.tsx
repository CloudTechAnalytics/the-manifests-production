'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ClipboardList,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { PlanStatusCard } from '@/components/planning/plan-status-card';
import { PlanSummaryCard } from '@/components/planning/plan-summary-card';
import { PlanMilestones } from '@/components/planning/plan-milestones';
import { PlanTasksPanel } from '@/components/planning/plan-tasks-panel';
import { PlanDocumentsPanel } from '@/components/planning/plan-documents-panel';
import { ConvertToShipmentDialog } from '@/components/planning/convert-to-shipment-dialog';
import { PlanSectionEditDialog, type SectionFieldDef } from '@/components/planning/plan-section-edit-dialog';
import { EditOverviewDialog } from '@/components/planning/edit-overview-dialog';
import { EditFinancialsDialog } from '@/components/planning/edit-financials-dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  PLAN_STATUS_META,
  PRIORITY_META,
  formatCurrency,
  formatDate,
} from '@/lib/utils/status';
import type { ShipmentPlan, Quotation, Profile } from '@/types';

const CONTAINER_FIELDS: SectionFieldDef[] = [
  { key: 'container_type', label: 'Container Type', type: 'text' },
  { key: 'container_quantity', label: 'Quantity', type: 'number' },
  { key: 'equipment_supplier', label: 'Equipment Supplier', type: 'text' },
  { key: 'container_pickup_date', label: 'Pick Up Date', type: 'date' },
  { key: 'container_return_date', label: 'Return Date', type: 'date' },
];

const VESSEL_FIELDS: SectionFieldDef[] = [
  { key: 'carrier_line', label: 'Carrier / Line', type: 'text' },
  { key: 'vessel_name', label: 'Vessel', type: 'text' },
  { key: 'voyage_number', label: 'Voyage', type: 'text' },
  { key: 'service_route', label: 'Service', type: 'text' },
  { key: 'port_of_loading', label: 'Port of Loading', type: 'text' },
  { key: 'port_of_discharge', label: 'Port of Discharge', type: 'text' },
];

const TRANSPORT_FIELDS: SectionFieldDef[] = [
  { key: 'pre_carriage_mode', label: 'Pre-Carriage', type: 'text' },
  { key: 'transport_carrier', label: 'Carrier / Driver', type: 'text' },
  { key: 'truck_number', label: 'Truck Number', type: 'text' },
  { key: 'estimated_transport_time', label: 'Estimated Time', type: 'text' },
];

const MILESTONE_FIELDS: SectionFieldDef[] = [
  { key: 'booking_confirmed_date', label: 'Booking Confirmed', type: 'date' },
  { key: 'documentation_date', label: 'Documentation', type: 'date' },
  { key: 'cargo_ready_date', label: 'Cargo Ready', type: 'date' },
  { key: 'planned_etd', label: 'Planned ETD', type: 'date' },
  { key: 'planned_eta', label: 'Planned ETA', type: 'date' },
  { key: 'delivery_date', label: 'Delivery', type: 'date' },
];

type PlanDetail = ShipmentPlan & {
  customer: { id: string; company_name: string } | null;
  quotation: Quotation | null;
  planned_by_user: { id: string; full_name: string } | null;
  assigned_user: Profile | null;
  converted_shipment: { id: string; reference_number: string | null } | null;
};

type TabKey = 'overview' | 'financials' | 'tasks' | 'documents' | 'notes';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'financials', label: 'Financials' },
  { key: 'tasks', label: 'Tasks & Milestones' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  );
}

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const planId = params.id;
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [overviewEditOpen, setOverviewEditOpen] = useState(false);
  const [containerEditOpen, setContainerEditOpen] = useState(false);
  const [vesselEditOpen, setVesselEditOpen] = useState(false);
  const [transportEditOpen, setTransportEditOpen] = useState(false);
  const [milestonesEditOpen, setMilestonesEditOpen] = useState(false);
  const [financialsEditOpen, setFinancialsEditOpen] = useState(false);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipment_plans')
        .select(
          '*, customer:customers(id, company_name), quotation:quotations(*), planned_by_user:profiles!shipment_plans_planned_by_fkey(id, full_name), assigned_user:profiles!shipment_plans_assigned_to_fkey(*), converted_shipment:shipments(id, reference_number)'
        )
        .eq('id', planId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) {
        setPlan(null);
        return;
      }
      setPlan(data as unknown as PlanDetail);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (!isAdmin && branchId) query = query.eq('branch_id', branchId);
    query.then(({ data, error }) => {
      if (error) return console.error('Error loading staff:', error);
      setStaff((data as Profile[]) ?? []);
    });
  }, [profile, isAdmin, branchId]);

  const handleSaveNotes = async () => {
    if (!plan || !profile?.id) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({
          notes: notesDraft || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId);
      if (error) throw error;
      toast.success('Notes updated');
      setEditingNotes(false);
      loadPlan();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update notes';
      toast.error(message);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    if (!plan || !profile) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', planId);
      if (error) throw error;
      toast.success('Plan deleted');
      router.push('/planning');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete plan';
      toast.error(message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 w-full lg:col-span-2" />
          <Skeleton className="h-96 w-full lg:col-span-1" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <ClipboardList className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Plan not found</h2>
          <p className="text-sm text-muted-foreground">
            This plan may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/planning">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Planning
          </Button>
        </Link>
      </div>
    );
  }

  const statusMeta = PLAN_STATUS_META[plan.status];
  const priorityMeta = PRIORITY_META[plan.priority];
  const isConverted = !!plan.converted_shipment_id;
  const isCancelled = plan.status === 'cancelled';

  const transitDays =
    plan.planned_etd && plan.planned_eta
      ? Math.round(
          (new Date(plan.planned_eta).getTime() - new Date(plan.planned_etd).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/planning">Planning</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{plan.plan_number ?? 'Plan Details'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/planning">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl font-medium tracking-tight">{plan.plan_number}</h1>
              <Badge variant="secondary" className={statusMeta.color}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {plan.customer?.company_name ?? 'Unknown customer'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isConverted && !isCancelled && (
            <Button size="sm" onClick={() => setConvertOpen(true)}>
              <ArrowRightLeft className="mr-1.5 h-4 w-4" />
              Convert to Shipment
            </Button>
          )}
          {isConverted && plan.converted_shipment && (
            <Link href={`/shipments/${plan.converted_shipment.id}`}>
              <Button size="sm" variant="outline">
                View Shipment {plan.converted_shipment.reference_number}
              </Button>
            </Link>
          )}
          <Link href={`/planning/${planId}/edit`}>
            <Button size="sm" variant="outline">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit All Details
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
                <DialogTitle>Delete plan?</DialogTitle>
                <DialogDescription>
                  This will soft-delete &quot;{plan.plan_number}&quot;. This does not affect any
                  shipment it was already converted to.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between px-4 py-3">
                  <CardTitle className="text-base font-semibold">Plan Overview</CardTitle>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOverviewEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 pb-4 pt-0 sm:grid-cols-3">
                  <InfoRow label="Shipment Type" value={plan.shipment_type} />
                  <InfoRow label="Total Volume" value={plan.total_volume ? `${plan.total_volume} CBM` : null} />
                  <InfoRow label="Planned ETD" value={formatDate(plan.planned_etd)} />
                  <InfoRow label="Incoterm" value={plan.incoterm} />
                  <InfoRow
                    label="Goods Value"
                    value={plan.goods_value ? formatCurrency(plan.goods_value, plan.goods_value_currency) : null}
                  />
                  <InfoRow label="Planned ETA" value={formatDate(plan.planned_eta)} />
                  <InfoRow label="Commodity" value={plan.commodity} />
                  <InfoRow label="Insurance" value={plan.insurance_required ? 'Required' : 'Not Required'} />
                  <InfoRow label="Transit Time" value={transitDays !== null ? `${transitDays} Days` : null} />
                  <InfoRow label="Total Packages" value={plan.total_packages} />
                  <InfoRow
                    label="Priority"
                    value={
                      <Badge variant="secondary" className={`text-[11px] ${priorityMeta.color}`}>
                        {priorityMeta.label}
                      </Badge>
                    }
                  />
                  <InfoRow label="Total Weight" value={plan.total_weight ? `${plan.total_weight} kg` : null} />
                  {plan.special_instructions && (
                    <div className="col-span-full pt-1">
                      <span className="text-sm text-muted-foreground">Special Instructions: </span>
                      <span className="text-sm font-medium">{plan.special_instructions}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <PlanMilestones
                plan={plan}
                quotation={plan.quotation}
                onEdit={() => setMilestonesEditOpen(true)}
              />

              <div>
                <h2 className="mb-3 text-sm font-semibold">Planning Details</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Card>
                    <CardHeader className="flex-row items-center justify-between px-4 py-3">
                      <CardTitle className="text-sm font-semibold">Cargo Information</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOverviewEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4 pb-4 pt-0">
                      <InfoRow label="Commodity" value={plan.commodity} />
                      <InfoRow label="Packages" value={plan.total_packages} />
                      <InfoRow label="Weight" value={plan.total_weight ? `${plan.total_weight} kg` : null} />
                      <InfoRow label="Volume" value={plan.total_volume ? `${plan.total_volume} CBM` : null} />
                      <InfoRow label="HS Code" value={plan.hs_code} />
                      {plan.cargo_description && (
                        <p className="pt-1 text-sm text-muted-foreground">{plan.cargo_description}</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex-row items-center justify-between px-4 py-3">
                      <CardTitle className="text-sm font-semibold">Container Plan</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setContainerEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4 pb-4 pt-0">
                      <InfoRow label="Container Type" value={plan.container_type} />
                      <InfoRow label="Quantity" value={plan.container_quantity} />
                      <InfoRow label="Equipment Supplier" value={plan.equipment_supplier} />
                      <InfoRow label="Pick Up Date" value={formatDate(plan.container_pickup_date)} />
                      <InfoRow label="Return Date" value={formatDate(plan.container_return_date)} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex-row items-center justify-between px-4 py-3">
                      <CardTitle className="text-sm font-semibold">Vessel & Routing</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setVesselEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4 pb-4 pt-0">
                      <InfoRow label="Carrier / Line" value={plan.carrier_line} />
                      <InfoRow label="Vessel" value={plan.vessel_name} />
                      <InfoRow label="Voyage" value={plan.voyage_number} />
                      <InfoRow label="Port of Loading" value={plan.port_of_loading} />
                      <InfoRow label="Port of Discharge" value={plan.port_of_discharge} />
                      <InfoRow label="Service" value={plan.service_route} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex-row items-center justify-between px-4 py-3">
                      <CardTitle className="text-sm font-semibold">Transport Plan</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTransportEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4 pb-4 pt-0">
                      <InfoRow label="Pre-Carriage" value={plan.pre_carriage_mode} />
                      <InfoRow label="Carrier / Driver" value={plan.transport_carrier} />
                      <InfoRow label="Truck Number" value={plan.truck_number} />
                      <InfoRow label="Delivery To Port" value={plan.port_of_loading} />
                      <InfoRow label="Estimated Time" value={plan.estimated_transport_time} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'financials' && (
            <Card>
              <CardHeader className="flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-base font-semibold">Financials</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFinancialsEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4 pt-0">
                <InfoRow
                  label="Estimated Cost"
                  value={plan.estimated_cost !== null ? formatCurrency(plan.estimated_cost, plan.goods_value_currency) : null}
                />
                <InfoRow
                  label="Estimated Revenue"
                  value={
                    plan.estimated_revenue !== null
                      ? formatCurrency(plan.estimated_revenue, plan.goods_value_currency)
                      : null
                  }
                />
                <InfoRow
                  label="Planned Profit"
                  value={
                    plan.estimated_cost !== null && plan.estimated_revenue !== null
                      ? formatCurrency(plan.estimated_revenue - plan.estimated_cost, plan.goods_value_currency)
                      : null
                  }
                />
                <InfoRow
                  label="Risk Level"
                  value={
                    plan.risk_level ? (
                      <Badge variant="secondary" className={`text-[11px] ${PRIORITY_META[plan.risk_level].color}`}>
                        {PRIORITY_META[plan.risk_level].label}
                      </Badge>
                    ) : null
                  }
                />
                {plan.quotation && (
                  <InfoRow
                    label="Linked Quotation"
                    value={
                      <Link href={`/quotations/${plan.quotation.id}`} className="text-primary hover:underline">
                        {plan.quotation.quotation_number}
                      </Link>
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'tasks' && plan.branch_id && (
            <PlanTasksPanel planId={planId} branchId={plan.branch_id} staff={staff} />
          )}

          {activeTab === 'documents' && plan.branch_id && (
            <PlanDocumentsPanel planId={planId} branchId={plan.branch_id} />
          )}

          {activeTab === 'notes' && (
            <Card>
              <CardHeader className="flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-base font-semibold">Notes</CardTitle>
                {!editingNotes && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setNotesDraft(plan.notes ?? '');
                      setEditingNotes(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {editingNotes ? (
                  <div className="space-y-3">
                    <Textarea
                      rows={5}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingNotes(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                        {savingNotes && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : plan.notes ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{plan.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet. Click the pencil to add some.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <PlanStatusCard plan={plan} onUpdated={loadPlan} />
          <PlanSummaryCard plan={plan} onUpdated={loadPlan} />
        </div>
      </div>

      <ConvertToShipmentDialog
        plan={plan}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConverted={loadPlan}
      />

      <EditOverviewDialog
        plan={plan}
        staff={staff}
        open={overviewEditOpen}
        onOpenChange={setOverviewEditOpen}
        onSaved={loadPlan}
      />
      <PlanSectionEditDialog
        planId={planId}
        title="Container Plan"
        fields={CONTAINER_FIELDS}
        initialValues={plan as unknown as Record<string, unknown>}
        open={containerEditOpen}
        onOpenChange={setContainerEditOpen}
        onSaved={loadPlan}
      />
      <PlanSectionEditDialog
        planId={planId}
        title="Vessel & Routing"
        fields={VESSEL_FIELDS}
        initialValues={plan as unknown as Record<string, unknown>}
        open={vesselEditOpen}
        onOpenChange={setVesselEditOpen}
        onSaved={loadPlan}
      />
      <PlanSectionEditDialog
        planId={planId}
        title="Transport Plan"
        fields={TRANSPORT_FIELDS}
        initialValues={plan as unknown as Record<string, unknown>}
        open={transportEditOpen}
        onOpenChange={setTransportEditOpen}
        onSaved={loadPlan}
      />
      <PlanSectionEditDialog
        planId={planId}
        title="Milestones"
        description="Planned dates — fill in as the plan progresses."
        fields={MILESTONE_FIELDS}
        initialValues={plan as unknown as Record<string, unknown>}
        open={milestonesEditOpen}
        onOpenChange={setMilestonesEditOpen}
        onSaved={loadPlan}
      />
      <EditFinancialsDialog
        plan={plan}
        open={financialsEditOpen}
        onOpenChange={setFinancialsEditOpen}
        onSaved={loadPlan}
      />
    </div>
  );
}
