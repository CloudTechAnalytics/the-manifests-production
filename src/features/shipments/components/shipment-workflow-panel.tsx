'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ListChecks, Loader2, MessageSquare, Plus, SkipForward } from 'lucide-react';
import {
  fetchShipmentWorkflowData,
  fetchBranchStaff,
  startWorkflowStage,
  runWorkflowStageAction,
  reassignWorkflowStage,
  updateWorkflowStageDueDate,
  cycleWorkflowTaskStatus,
  addWorkflowTask,
  addWorkflowStageComment,
} from '@/features/shipments/services/shipments.service';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { checkStageReadiness } from '@/shared/lib/utils/workflow-rules';
import { ROLE_LABELS } from '@/shared/hooks/use-role';
import { WORKFLOW_STAGE_STATUS_META, PLAN_TASK_STATUS_META, PRIORITY_META, formatDate } from '@/shared/lib/utils/status';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/shared/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import type { PlanTaskStatus, Profile, ShipmentStage, ShipmentStageComment, ShipmentTask } from '@/shared/types';

interface ShipmentWorkflowPanelProps {
  shipmentId: string;
  branchId: string;
  onChanged: () => void;
}

export function ShipmentWorkflowPanel({ shipmentId, branchId, onChanged }: ShipmentWorkflowPanelProps) {
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [busyStageId, setBusyStageId] = useState<string | null>(null);
  const [blockersByStage, setBlockersByStage] = useState<Record<string, string[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});

  const workflowQueryKey = ['shipment-workflow', shipmentId];
  const invalidateWorkflow = () => queryClient.invalidateQueries({ queryKey: workflowQueryKey });

  const { data: workflowData, isLoading: loading } = useQuery({
    queryKey: workflowQueryKey,
    queryFn: () => fetchShipmentWorkflowData(shipmentId),
  });

  const stages = workflowData?.stages ?? [];

  const tasksByStage = (workflowData?.tasks ?? []).reduce<Record<string, ShipmentTask[]>>((acc, t) => {
    if (!t.stage_id) return acc;
    (acc[t.stage_id] ??= []).push(t);
    return acc;
  }, {});

  const commentsByStage = (workflowData?.comments ?? []).reduce<Record<string, ShipmentStageComment[]>>((acc, c) => {
    (acc[c.stage_id] ??= []).push(c);
    return acc;
  }, {});

  const { data: staff = [] } = useQuery({
    queryKey: ['branch-staff', branchId],
    queryFn: () => fetchBranchStaff(branchId),
  });

  const canActOnStage = useCallback(
    (stage: ShipmentStage) => hasRole('admin') || hasRole('branch_manager') || hasRole(stage.assigned_department),
    [hasRole]
  );

  /**
   * "Cannot skip stages": the earliest not-yet-done, non-optional stage
   * with a lower sequence than the one being started, if any. Optional
   * stages (cargo_examination, warehouse) never block — they're either
   * done or explicitly skipped, never a mandatory gate for what follows.
   */
  const getBlockingPriorStage = useCallback(
    (stage: ShipmentStage): ShipmentStage | null =>
      stages.find(
        (s) => s.sequence < stage.sequence && !s.is_optional && s.status !== 'completed' && s.status !== 'skipped'
      ) ?? null,
    [stages]
  );

  const startMutation = useMutation({
    mutationFn: (stage: ShipmentStage) => {
      if (!profile) throw new Error('Not ready');
      return startWorkflowStage({ shipmentId, branchId, stage, updatedBy: profile.id });
    },
    onSuccess: (_data, stage) => {
      invalidateWorkflow();
      toast.success(`${stage.label} started`);
      onChanged();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to start stage'));
    },
    onSettled: () => {
      setBusyStageId(null);
    },
  });

  const handleStart = (stage: ShipmentStage) => {
    const blocker = getBlockingPriorStage(stage);
    if (blocker) {
      toast.error(`Complete or skip "${blocker.label}" first — stages can't be started out of order.`);
      return;
    }
    setBusyStageId(stage.id);
    startMutation.mutate(stage);
  };

  /**
   * Both Complete and Skip go through complete_shipment_stage() (migration
   * 056) rather than a direct table update — that RPC is what advances
   * shipments.status to the next value, auto-starts the next stage, and
   * notifies the newly-responsible department, none of which a plain
   * client-side UPDATE can do (notifications has no client INSERT policy
   * by design). It also re-checks the department/sequence rules
   * server-side, so the client-side checks below are UX-only.
   */
  const stageActionMutation = useMutation({
    mutationFn: (params: { stage: ShipmentStage; action: 'complete' | 'skip' }) =>
      runWorkflowStageAction({ stageId: params.stage.id, action: params.action }),
    onSuccess: (result, params) => {
      const { stage, action } = params;
      toast.success(
        action === 'complete'
          ? `${stage.label} completed${result.new_status ? ` — shipment moved to ${result.new_status}` : ''}`
          : `${stage.label} skipped${result.new_status ? ` — shipment moved to ${result.new_status}` : ''}`
      );
      setBlockersByStage((prev) => ({ ...prev, [stage.id]: [] }));
      invalidateWorkflow();
      onChanged();
    },
    onError: (err, params) => {
      toast.error(getErrorMessage(err, `Failed to ${params.action} stage`));
    },
    onSettled: () => {
      setBusyStageId(null);
    },
  });

  const runStageAction = (stage: ShipmentStage, action: 'complete' | 'skip') => {
    setBusyStageId(stage.id);
    stageActionMutation.mutate({ stage, action });
  };

  const handleSkip = (stage: ShipmentStage) => runStageAction(stage, 'skip');

  const handleComplete = async (stage: ShipmentStage) => {
    const readiness = await checkStageReadiness(shipmentId, stage.stage_key);
    if (!readiness.ready) {
      setBlockersByStage((prev) => ({ ...prev, [stage.id]: readiness.blockers }));
      return;
    }
    runStageAction(stage, 'complete');
  };

  const reassignMutation = useMutation({
    mutationFn: (params: { stage: ShipmentStage; userId: string }) =>
      reassignWorkflowStage({ stageId: params.stage.id, userId: params.userId, updatedBy: profile?.id }),
    onSuccess: () => invalidateWorkflow(),
    onError: () => toast.error('Failed to reassign stage'),
  });
  const handleReassign = (stage: ShipmentStage, userId: string) => {
    reassignMutation.mutate({ stage, userId });
  };

  const dueDateMutation = useMutation({
    mutationFn: (params: { stage: ShipmentStage; date: string }) =>
      updateWorkflowStageDueDate({ stageId: params.stage.id, date: params.date, updatedBy: profile?.id }),
    onSuccess: () => invalidateWorkflow(),
    onError: () => toast.error('Failed to update due date'),
  });
  const handleDueDateChange = (stage: ShipmentStage, date: string) => {
    dueDateMutation.mutate({ stage, date });
  };

  const cycleTaskMutation = useMutation({
    mutationFn: (params: { task: ShipmentTask; nextStatus: PlanTaskStatus }) =>
      cycleWorkflowTaskStatus({ taskId: params.task.id, nextStatus: params.nextStatus }),
    onSuccess: () => invalidateWorkflow(),
    onError: () => toast.error('Failed to update task'),
  });
  const cycleTaskStatus = (task: ShipmentTask) => {
    const next: Record<PlanTaskStatus, PlanTaskStatus> = {
      pending: 'in_progress',
      in_progress: 'done',
      done: 'pending',
      cancelled: 'pending',
    };
    cycleTaskMutation.mutate({ task, nextStatus: next[task.status] });
  };

  const addTaskMutation = useMutation({
    mutationFn: (stage: ShipmentStage) => {
      if (!profile) throw new Error('Not ready');
      const title = (newTaskTitle[stage.id] ?? '').trim();
      return addWorkflowTask({ shipmentId, branchId, stage, title, createdBy: profile.id });
    },
    onSuccess: (_data, stage) => {
      setNewTaskTitle((prev) => ({ ...prev, [stage.id]: '' }));
      invalidateWorkflow();
    },
    onError: () => toast.error('Failed to add task'),
  });
  const handleAddTask = (stage: ShipmentStage) => {
    const title = (newTaskTitle[stage.id] ?? '').trim();
    if (!title || !profile) return;
    addTaskMutation.mutate(stage);
  };

  const addCommentMutation = useMutation({
    mutationFn: (stage: ShipmentStage) => {
      if (!profile) throw new Error('Not ready');
      const comment = (newComment[stage.id] ?? '').trim();
      return addWorkflowStageComment({ shipmentId, branchId, stageId: stage.id, comment, createdBy: profile.id });
    },
    onSuccess: (_data, stage) => {
      setNewComment((prev) => ({ ...prev, [stage.id]: '' }));
      invalidateWorkflow();
    },
    onError: () => toast.error('Failed to add comment'),
  });
  const handleAddComment = (stage: ShipmentStage) => {
    const comment = (newComment[stage.id] ?? '').trim();
    if (!comment || !profile) return;
    addCommentMutation.mutate(stage);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No workflow stages yet"
        message="Workflow stages are created automatically for new shipments."
      />
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {stages.map((stage) => {
        const statusMeta = WORKFLOW_STAGE_STATUS_META[stage.status] ?? {
          label: stage.status ?? 'Unknown',
          color: 'bg-muted text-muted-foreground',
        };
        const tasks = tasksByStage[stage.id] ?? [];
        const comments = commentsByStage[stage.id] ?? [];
        const blockers = blockersByStage[stage.id] ?? [];
        const canAct = canActOnStage(stage);
        const busy = busyStageId === stage.id;
        const blockingStage = stage.status === 'pending' ? getBlockingPriorStage(stage) : null;

        return (
          <AccordionItem key={stage.id} value={stage.id}>
            <AccordionTrigger className="px-1 hover:no-underline">
              <div className="flex flex-1 flex-wrap items-center gap-3 pr-2 text-left">
                <span className="font-medium">{stage.label}</span>
                <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                  {statusMeta.label}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {ROLE_LABELS[stage.assigned_department]}
                </Badge>
                {stage.is_optional && (
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    Optional
                  </Badge>
                )}
                {tasks.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {tasks.filter((t) => t.status === 'done').length}/{tasks.length} tasks
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {stage.assigned_user?.full_name ?? 'Unassigned'}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-1">
              <div className="space-y-4">
                {blockingStage && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    &quot;{blockingStage.label}&quot; must be completed or skipped before this stage can start.
                  </div>
                )}

                {blockers.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      This stage isn&apos;t ready to complete yet
                    </p>
                    <ul className="ml-5 list-disc text-xs text-red-700">
                      {blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Assigned To</p>
                    <Select
                      value={stage.assigned_to ?? ''}
                      onValueChange={(v) => handleReassign(stage, v)}
                      disabled={!canAct}
                    >
                      <SelectTrigger className="h-8 w-[180px] text-xs">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <Input
                      type="date"
                      className="h-8 w-[150px] text-xs"
                      value={stage.due_date ?? ''}
                      onChange={(e) => handleDueDateChange(stage, e.target.value)}
                      disabled={!canAct}
                    />
                  </div>
                  <div className="ml-auto flex items-center gap-2 self-end">
                    {stage.status === 'pending' && (
                      <>
                        {stage.is_optional && (
                          <Button size="sm" variant="outline" disabled={!canAct || busy} onClick={() => handleSkip(stage)}>
                            <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                            Skip
                          </Button>
                        )}
                        <Button size="sm" disabled={!canAct || busy || !!blockingStage} onClick={() => handleStart(stage)}>
                          {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                          Start
                        </Button>
                      </>
                    )}
                    {stage.status === 'in_progress' && (
                      <Button size="sm" disabled={!canAct || busy} onClick={() => handleComplete(stage)}>
                        {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Complete
                      </Button>
                    )}
                  </div>
                </div>

                {tasks.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((t) => {
                        const taskStatusMeta = PLAN_TASK_STATUS_META[t.status] ?? {
                          label: t.status ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                        };
                        const priorityMeta = PRIORITY_META[t.priority] ?? {
                          label: t.priority ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                        };
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="text-sm font-medium">{t.title}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {t.assigned_user?.full_name ?? '—'}
                            </TableCell>
                            <TableCell>
                              <button onClick={() => cycleTaskStatus(t)}>
                                <Badge variant="secondary" className={`cursor-pointer text-[11px] ${taskStatusMeta.color}`}>
                                  {taskStatusMeta.label}
                                </Badge>
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={`text-[11px] ${priorityMeta.color}`}>
                                {priorityMeta.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add a task…"
                    className="h-8 text-xs"
                    value={newTaskTitle[stage.id] ?? ''}
                    onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => handleAddTask(stage)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Comments
                  </p>
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md bg-muted/50 p-2 text-xs">
                      <span className="font-medium">{c.created_by_user?.full_name ?? 'Unknown'}</span>{' '}
                      <span className="text-muted-foreground">· {formatDate(c.created_at)}</span>
                      <p className="mt-0.5">{c.comment}</p>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Textarea
                      placeholder="Add a comment…"
                      className="h-16 text-xs"
                      value={newComment[stage.id] ?? ''}
                      onChange={(e) => setNewComment((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" onClick={() => handleAddComment(stage)}>
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
