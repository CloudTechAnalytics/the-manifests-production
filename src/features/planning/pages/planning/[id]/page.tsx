'use client';

import { useCallback, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2, Trash2 } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { canDeleteOwnRecord } from '@/shared/lib/utils/ownership';
import { checkStageReadiness } from '@/shared/lib/utils/workflow-rules';
import { computePlanningMilestones, computePlanningRisks } from '@/shared/lib/utils/planning';
import { getPlanningSuggestions } from '@/shared/lib/utils/planning-suggestions';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/shared/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { Textarea } from '@/shared/components/ui/textarea';
import { PlanStatusCard } from '@/features/planning/components/plan-status-card';
import { PlanSummaryCard } from '@/features/planning/components/plan-summary-card';
import { PlanTasksPanel } from '@/features/planning/components/plan-tasks-panel';
import { PlanDocumentsPanel } from '@/features/planning/components/plan-documents-panel';
import { PlanningShipmentHeader } from '@/features/planning/components/planning-shipment-header';
import { PlanningRiskBanner } from '@/features/planning/components/planning-risk-banner';
import { PlanningSuggestionsBanner } from '@/features/planning/components/planning-suggestions-banner';
import { PlanningMilestonesCard } from '@/features/planning/components/planning-milestones-card';
import { InternalAssignmentsCard } from '@/features/planning/components/internal-assignments-card';
import { VesselPlanningCard } from '@/features/planning/components/vessel-planning-card';
import { CustomsPlanningCard } from '@/features/planning/components/customs-planning-card';
import { TerminalPlanningCard } from '@/features/planning/components/terminal-planning-card';
import { TransportPlanningCard } from '@/features/planning/components/transport-planning-card';
import { WarehousePlanningCard } from '@/features/planning/components/warehouse-planning-card';
import { DocumentationPlanningPanel } from '@/features/planning/components/documentation-planning-panel';
import { PlanningTimelineTab } from '@/features/planning/components/planning-timeline-tab';
import { FinancialPlanningTab } from '@/features/planning/components/financial-planning-tab';
import { ShipmentContainersPanel } from '@/features/shipments/components/shipment-containers-panel';
import { formatDate } from '@/shared/lib/utils/status';
import {
  completePlanning,
  deletePlan,
  fetchPlanDetail,
  fetchPlanningStaff,
  savePlanNotes,
} from '@/features/planning/services/planning.service';

type TabKey =
  | 'execution'
  | 'assignments'
  | 'documentation'
  | 'financials'
  | 'tasks'
  | 'documents'
  | 'timeline'
  | 'notes';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'execution', label: 'Execution Plan' },
  { key: 'assignments', label: 'Assignments & Milestones' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'financials', label: 'Financials' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
];

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const planId = params.id!;
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [activeTab, setActiveTab] = useState<TabKey>('execution');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const [completeBlockers, setCompleteBlockers] = useState<string[]>([]);
  const [checkingComplete, setCheckingComplete] = useState(false);

  const { data: detail, isLoading: loading } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => fetchPlanDetail(planId),
    enabled: !!planId,
  });
  const plan = detail?.plan ?? null;
  const shipment = detail?.shipment ?? null;
  const containers = detail?.containers ?? [];
  const customs = detail?.customs ?? null;
  const terminal = detail?.terminal ?? null;
  const transportation = detail?.transportation ?? [];
  const warehouseRecord = detail?.warehouseRecord ?? null;
  const stages = detail?.stages ?? [];
  const documentsAllSatisfied = detail?.documentsAllSatisfied ?? false;
  const completionPercent = detail?.completionPercent ?? null;

  const canDelete = !!plan && canDeleteOwnRecord({ hasRole });

  const loadPlan = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
  }, [queryClient, planId]);

  const { data: staff = [] } = useQuery({
    queryKey: ['planning-staff', isAdmin, branchId],
    queryFn: () => fetchPlanningStaff({ isAdmin, branchId }),
    enabled: !!profile,
  });

  const saveNotesMutation = useMutation({
    mutationFn: () => savePlanNotes(planId, notesDraft, { id: profile!.id }),
    onSuccess: () => {
      toast.success('Notes updated');
      setEditingNotes(false);
      loadPlan();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update notes'));
    },
  });

  const handleSaveNotes = () => {
    if (!plan || !profile?.id) return;
    saveNotesMutation.mutate();
  };
  const savingNotes = saveNotesMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: () => deletePlan(plan!, planId, { id: profile!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-rows'] });
      toast.success('Plan deleted');
      navigate('/planning');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to delete plan'));
    },
    onSettled: () => setDeleteOpen(false),
  });

  const handleDelete = () => {
    if (!plan || !profile) return;
    deleteMutation.mutate();
  };
  const deleting = deleteMutation.isPending;

  const planningStage = stages.find((s) => s.stage_key === 'planning');

  const completeMutation = useMutation({
    mutationFn: () => completePlanning(shipment!, plan!, planningStage!, { id: profile!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
      queryClient.invalidateQueries({ queryKey: ['planning-rows'] });
      toast.success('Planning complete — shipment moved to Documentation');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to complete planning'));
    },
  });
  const completing = completeMutation.isPending;

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
      completeMutation.mutate();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to complete planning'));
    } finally {
      setCheckingComplete(false);
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
        <Link to="/planning">
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
        <Link to="/planning">
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
  const suggestions = getPlanningSuggestions({ shipment, containers, customs, terminal });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/planning">Planning</Link>
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
          <Link to="/planning">
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

      {plan.status !== 'completed' && plan.status !== 'cancelled' && completionPercent !== null && (
        <div className="space-y-1.5 rounded-lg border border-border px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Planning Completion</span>
            <span className="font-semibold">{completionPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      )}

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
              <PlanningSuggestionsBanner suggestions={suggestions} />
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
                stages={stages}
                onChanged={loadPlan}
              />
              <PlanningMilestonesCard milestones={milestones} />
            </div>
          )}

          {activeTab === 'documentation' && (
            <DocumentationPlanningPanel shipmentId={shipment.id} branchId={shipment.branch_id} />
          )}

          {activeTab === 'financials' && (
            <FinancialPlanningTab
              shipmentId={shipment.id}
              branchId={shipment.branch_id}
              plan={plan}
              onChanged={loadPlan}
            />
          )}

          {activeTab === 'tasks' && plan.branch_id && (
            <PlanTasksPanel planId={planId} branchId={plan.branch_id} staff={staff} />
          )}

          {activeTab === 'documents' && plan.branch_id && (
            <PlanDocumentsPanel planId={planId} branchId={plan.branch_id} />
          )}

          {activeTab === 'timeline' && <PlanningTimelineTab shipmentId={shipment.id} />}

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
    </div>
  );
}
