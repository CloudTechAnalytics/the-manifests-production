'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { canDeleteOwnRecord } from '@/lib/utils/ownership';
import { checkStageReadiness } from '@/lib/utils/workflow-rules';
import { getDocumentChecklist } from '@/lib/utils/document-templates';
import { computePlanningMilestones, computePlanningRisks } from '@/lib/utils/planning';
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
import { Textarea } from '@/components/ui/textarea';
import { PlanStatusCard } from '@/components/planning/plan-status-card';
import { PlanSummaryCard } from '@/components/planning/plan-summary-card';
import { PlanTasksPanel } from '@/components/planning/plan-tasks-panel';
import { PlanDocumentsPanel } from '@/components/planning/plan-documents-panel';
import { EditFinancialsDialog } from '@/components/planning/edit-financials-dialog';
import { PlanningShipmentHeader } from '@/components/planning/planning-shipment-header';
import { PlanningRiskBanner } from '@/components/planning/planning-risk-banner';
import { PlanningMilestonesCard } from '@/components/planning/planning-milestones-card';
import { InternalAssignmentsCard } from '@/components/planning/internal-assignments-card';
import { VesselPlanningCard } from '@/components/planning/vessel-planning-card';
import { CustomsPlanningCard } from '@/components/planning/customs-planning-card';
import { TerminalPlanningCard } from '@/components/planning/terminal-planning-card';
import { TransportPlanningCard } from '@/components/planning/transport-planning-card';
import { WarehousePlanningCard } from '@/components/planning/warehouse-planning-card';
import { ShipmentContainersPanel } from '@/components/shipments/shipment-containers-panel';
import { PRIORITY_META, formatCurrency, formatDate } from '@/lib/utils/status';
import type {
  ShipmentPlan,
  Shipment,
  ShipmentContainer,
  ShipmentCustoms,
  TerminalOperation,
  ShipmentTransportation,
  ShipmentWarehouseRecord,
  ShipmentStage,
  Profile,
} from '@/types';

type TabKey = 'execution' | 'assignments' | 'financials' | 'tasks' | 'documents' | 'notes';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'execution', label: 'Execution Plan' },
  { key: 'assignments', label: 'Assignments & Milestones' },
  { key: 'financials', label: 'Financials' },
  { key: 'tasks', label: 'Tasks' },
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
  const { profile, hasRole } = useAuth();
  const planId = params.id;
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [plan, setPlan] = useState<ShipmentPlan | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [containers, setContainers] = useState<ShipmentContainer[]>([]);
  const [customs, setCustoms] = useState<ShipmentCustoms | null>(null);
  const [terminal, setTerminal] = useState<TerminalOperation | null>(null);
  const [transportation, setTransportation] = useState<ShipmentTransportation[]>([]);
  const [warehouseRecord, setWarehouseRecord] = useState<ShipmentWarehouseRecord | null>(null);
  const [stages, setStages] = useState<ShipmentStage[]>([]);
  const [documentsAllSatisfied, setDocumentsAllSatisfied] = useState(false);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('execution');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canDelete = !!plan && canDeleteOwnRecord({ hasRole });

  const [financialsEditOpen, setFinancialsEditOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const [completeBlockers, setCompleteBlockers] = useState<string[]>([]);
  const [checkingComplete, setCheckingComplete] = useState(false);
  const [completing, setCompleting] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const { data: planRow, error: planError } = await supabase
        .from('shipment_plans')
        .select(
          '*, quotation:quotations(*), planned_by_user:profiles!shipment_plans_planned_by_fkey(id, full_name), finance_officer_user:profiles!shipment_plans_finance_officer_id_fkey(id, full_name), supervisor_user:profiles!shipment_plans_supervisor_id_fkey(id, full_name)'
        )
        .eq('id', planId)
        .is('deleted_at', null)
        .maybeSingle();

      if (planError || !planRow) {
        setPlan(null);
        return;
      }
      const p = planRow as unknown as ShipmentPlan;
      setPlan(p);

      if (!p.shipment_id) {
        // Legacy plan predating the Planning Centre redesign — no linked
        // shipment to load operational data from.
        return;
      }

      const [
        { data: shipRow },
        { data: containerRows },
        { data: customsRow },
        { data: terminalRow },
        { data: transportRows },
        { data: warehouseRow },
        { data: stageRows },
      ] = await Promise.all([
        supabase
          .from('shipments')
          .select('*, customer:customers(*), branch:branches(*)')
          .eq('id', p.shipment_id)
          .maybeSingle(),
        supabase
          .from('shipment_containers')
          .select('*')
          .eq('shipment_id', p.shipment_id)
          .is('deleted_at', null),
        supabase.from('shipment_customs').select('*').eq('shipment_id', p.shipment_id).maybeSingle(),
        supabase.from('terminal_operations').select('*').eq('shipment_id', p.shipment_id).maybeSingle(),
        supabase
          .from('shipment_transportation')
          .select('*')
          .eq('shipment_id', p.shipment_id)
          .is('deleted_at', null),
        supabase
          .from('shipment_warehouse_records')
          .select('*, warehouse:warehouses(id, name)')
          .eq('shipment_id', p.shipment_id)
          .maybeSingle(),
        supabase.from('shipment_stages').select('*, assigned_user:profiles!shipment_stages_assigned_to_fkey(id, full_name)').eq('shipment_id', p.shipment_id),
      ]);

      setShipment((shipRow as Shipment) ?? null);
      setContainers((containerRows as ShipmentContainer[]) ?? []);
      setCustoms((customsRow as ShipmentCustoms) ?? null);
      setTerminal((terminalRow as TerminalOperation) ?? null);
      setTransportation((transportRows as ShipmentTransportation[]) ?? []);
      setWarehouseRecord((warehouseRow as ShipmentWarehouseRecord) ?? null);
      setStages((stageRows as ShipmentStage[]) ?? []);

      const checklist = await getDocumentChecklist(p.shipment_id, 'documentation');
      setDocumentsAllSatisfied(checklist.every((item) => item.satisfied));
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
        .update({ notes: notesDraft || null, updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq('id', planId);
      if (error) throw error;
      toast.success('Notes updated');
      setEditingNotes(false);
      loadPlan();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update notes'));
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

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: plan.branch_id,
        action: 'plan.deleted',
        entity_type: 'shipment_plan',
        entity_id: planId,
        description: `Deleted plan ${plan.plan_number ?? ''}`,
      });

      toast.success('Plan deleted');
      router.push('/planning');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete plan'));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const planningStage = stages.find((s) => s.stage_key === 'planning');

  const handleCompletePlanning = async () => {
    if (!shipment || !plan || !profile || !planningStage) return;
    setCheckingComplete(true);
    setCompleteBlockers([]);
    try {
      const readiness = await checkStageReadiness(shipment.id, 'planning');
      if (!readiness.ready) {
        setCompleteBlockers(readiness.blockers);
        return;
      }

      setCompleting(true);
      const { error } = await supabase.rpc('complete_shipment_stage', {
        p_stage_id: planningStage.id,
        p_action: 'complete',
      });
      if (error) throw error;

      await supabase
        .from('shipment_plans')
        .update({ status: 'completed', updated_by: profile.id })
        .eq('id', plan.id);

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: plan.branch_id,
        action: 'plan.completed',
        entity_type: 'shipment_plan',
        entity_id: plan.id,
        description: 'Planning completed — status changed to Documentation',
      });

      toast.success('Planning complete — shipment moved to Documentation');
      loadPlan();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to complete planning'));
    } finally {
      setCheckingComplete(false);
      setCompleting(false);
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

  if (!plan.shipment_id || !shipment) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <ClipboardList className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Historical record only</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            This plan predates the Planning Centre redesign and has no linked shipment — it&apos;s no
            longer editable here.
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

  const risks = computePlanningRisks({ shipment, containers, customs, terminal, transportation });
  const milestones = computePlanningMilestones({
    shipment,
    containers,
    customs,
    terminal,
    transportation,
    documentsAllSatisfied,
  });

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
            <h1 className="page-title">{plan.plan_number}</h1>
            <p className="text-sm text-muted-foreground">Planning Centre</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {plan.status !== 'completed' && plan.status !== 'cancelled' && (
            <Button size="sm" disabled={checkingComplete || completing} onClick={handleCompletePlanning}>
              {(checkingComplete || completing) && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {!checkingComplete && !completing && <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              Complete Planning
            </Button>
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
                  <DialogTitle className="flex items-center gap-2">
                    <Trash2 className="h-5 w-5 text-red-600" />
                    Delete plan?
                  </DialogTitle>
                  <DialogDescription>
                    This will soft-delete &quot;{plan.plan_number}&quot;. It does not affect the linked
                    shipment.
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
          )}
        </div>
      </div>

      {completeBlockers.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-700">Planning isn&apos;t complete yet</p>
          <ul className="ml-5 list-disc text-sm text-amber-700">
            {completeBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <PlanningShipmentHeader shipment={shipment} containers={containers} />
      <PlanningRiskBanner risks={risks} />

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

          {activeTab === 'execution' && (
            <div className="space-y-4">
              <VesselPlanningCard shipment={shipment} onChanged={loadPlan} />
              <ShipmentContainersPanel
                shipmentId={shipment.id}
                branchId={shipment.branch_id}
                containers={containers}
                onReload={loadPlan}
              />
              <TransportPlanningCard
                shipmentId={shipment.id}
                branchId={shipment.branch_id}
                legs={transportation}
                onChanged={loadPlan}
              />
              <CustomsPlanningCard
                shipmentId={shipment.id}
                branchId={shipment.branch_id}
                customs={customs}
                customsOfficerStage={stages.find((s) => s.stage_key === 'customs_clearance')}
                onChanged={loadPlan}
              />
              <TerminalPlanningCard
                shipmentId={shipment.id}
                branchId={shipment.branch_id}
                terminal={terminal}
                onChanged={loadPlan}
              />
              <WarehousePlanningCard
                shipmentId={shipment.id}
                branchId={shipment.branch_id}
                record={warehouseRecord}
                onChanged={loadPlan}
              />
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="space-y-4">
              <InternalAssignmentsCard
                shipmentId={shipment.id}
                branchId={shipment.branch_id}
                plan={plan}
                stages={stages}
                onChanged={loadPlan}
              />
              <PlanningMilestonesCard milestones={milestones} />
            </div>
          )}

          {activeTab === 'financials' && (
            <Card>
              <CardHeader className="flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-lg font-semibold">Financials</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFinancialsEditOpen(true)}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
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
                      <Badge
                        variant="secondary"
                        className={`text-[11px] ${
                          (PRIORITY_META[plan.risk_level] ?? { color: 'bg-muted text-muted-foreground' }).color
                        }`}
                      >
                        {PRIORITY_META[plan.risk_level]?.label ?? plan.risk_level}
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
                <CardTitle className="text-lg font-semibold">Notes</CardTitle>
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
                    <ClipboardList className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {editingNotes ? (
                  <div className="space-y-3">
                    <Textarea rows={5} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} autoFocus />
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
          <PlanStatusCard plan={plan} />
          <PlanSummaryCard plan={plan} onUpdated={loadPlan} />
        </div>
      </div>

      <EditFinancialsDialog
        plan={plan}
        open={financialsEditOpen}
        onOpenChange={setFinancialsEditOpen}
        onSaved={loadPlan}
      />
    </div>
  );
}
