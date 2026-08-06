'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ListChecks, Loader2, MessageSquare, Plus, SkipForward } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { checkStageReadiness } from '@/lib/utils/workflow-rules';
import { ROLE_LABELS } from '@/hooks/use-role';
import { WORKFLOW_STAGE_STATUS_META, PLAN_TASK_STATUS_META, PRIORITY_META, formatDate } from '@/lib/utils/status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PlanTaskStatus, Profile, ShipmentStage, ShipmentStageComment, ShipmentTask } from '@/types';

interface ShipmentWorkflowPanelProps {
  shipmentId: string;
  branchId: string;
  onChanged: () => void;
}

export function ShipmentWorkflowPanel({ shipmentId, branchId, onChanged }: ShipmentWorkflowPanelProps) {
  const { profile, hasRole } = useAuth();
  const [stages, setStages] = useState<ShipmentStage[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [tasksByStage, setTasksByStage] = useState<Record<string, ShipmentTask[]>>({});
  const [commentsByStage, setCommentsByStage] = useState<Record<string, ShipmentStageComment[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyStageId, setBusyStageId] = useState<string | null>(null);
  const [blockersByStage, setBlockersByStage] = useState<Record<string, string[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: stageRows, error: stageError }, { data: taskRows }, { data: commentRows }] = await Promise.all([
        supabase
          .from('shipment_stages')
          .select('*, assigned_user:profiles!shipment_stages_assigned_to_fkey(id, full_name)')
          .eq('shipment_id', shipmentId)
          .order('sequence', { ascending: true }),
        supabase
          .from('shipment_tasks')
          .select('*, assigned_user:profiles!shipment_tasks_assigned_to_fkey(id, full_name)')
          .eq('shipment_id', shipmentId)
          .order('created_at', { ascending: true }),
        supabase
          .from('shipment_stage_comments')
          .select('*, created_by_user:profiles!shipment_stage_comments_created_by_fkey(id, full_name)')
          .eq('shipment_id', shipmentId)
          .order('created_at', { ascending: false }),
      ]);

      if (stageError) throw stageError;

      setStages((stageRows as unknown as ShipmentStage[]) ?? []);

      const tasksGrouped: Record<string, ShipmentTask[]> = {};
      ((taskRows as unknown as ShipmentTask[]) ?? []).forEach((t) => {
        if (!t.stage_id) return;
        (tasksGrouped[t.stage_id] ??= []).push(t);
      });
      setTasksByStage(tasksGrouped);

      const commentsGrouped: Record<string, ShipmentStageComment[]> = {};
      ((commentRows as unknown as ShipmentStageComment[]) ?? []).forEach((c) => {
        (commentsGrouped[c.stage_id] ??= []).push(c);
      });
      setCommentsByStage(commentsGrouped);
    } catch (err) {
      console.error('Error loading workflow data:', err);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) return console.error('Error loading staff:', error);
        setStaff((data as Profile[]) ?? []);
      });
  }, [branchId]);

  const logActivity = async (action: string, description: string, stage: ShipmentStage) => {
    if (!profile) return;
    await supabase.from('activities').insert({
      user_id: profile.id,
      branch_id: branchId,
      action,
      entity_type: 'shipment_stage',
      entity_id: stage.id,
      description,
      metadata: { shipment_id: shipmentId, stage_key: stage.stage_key },
    });
  };

  const handleStart = async (stage: ShipmentStage) => {
    if (!profile) return;
    const blocker = getBlockingPriorStage(stage);
    if (blocker) {
      toast.error(`Complete or skip "${blocker.label}" first — stages can't be started out of order.`);
      return;
    }
    setBusyStageId(stage.id);
    try {
      const { error } = await supabase
        .from('shipment_stages')
        .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', stage.id);
      if (error) throw error;

      const { count } = await supabase
        .from('shipment_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('stage_id', stage.id);

      if (!count) {
        const { data: templates } = await supabase
          .from('stage_task_templates')
          .select('*')
          .eq('stage_key', stage.stage_key)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (templates && templates.length > 0) {
          await supabase.from('shipment_tasks').insert(
            templates.map((t) => ({
              shipment_id: shipmentId,
              stage_id: stage.id,
              template_id: t.id,
              branch_id: branchId,
              title: t.title,
              assigned_department: t.default_department ?? stage.assigned_department,
              priority: t.default_priority,
              created_by: profile.id,
            }))
          );
        }
      }

      await logActivity('workflow_stage.started', `Started "${stage.label}" for this shipment`, stage);
      toast.success(`${stage.label} started`);
      await loadAll();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to start stage'));
    } finally {
      setBusyStageId(null);
    }
  };

  const handleSkip = async (stage: ShipmentStage) => {
    if (!profile) return;
    setBusyStageId(stage.id);
    try {
      const { error } = await supabase
        .from('shipment_stages')
        .update({ status: 'skipped', updated_by: profile.id })
        .eq('id', stage.id);
      if (error) throw error;
      await logActivity('workflow_stage.skipped', `Skipped "${stage.label}" for this shipment`, stage);
      toast.success(`${stage.label} skipped`);
      await loadAll();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to skip stage'));
    } finally {
      setBusyStageId(null);
    }
  };

  const handleComplete = async (stage: ShipmentStage) => {
    if (!profile) return;
    setBusyStageId(stage.id);
    try {
      const readiness = await checkStageReadiness(shipmentId, stage.stage_key);
      if (!readiness.ready) {
        setBlockersByStage((prev) => ({ ...prev, [stage.id]: readiness.blockers }));
        return;
      }
      setBlockersByStage((prev) => ({ ...prev, [stage.id]: [] }));

      const { error } = await supabase
        .from('shipment_stages')
        .update({ status: 'completed', completed_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', stage.id);
      if (error) throw error;
      await logActivity('workflow_stage.completed', `Completed "${stage.label}" for this shipment`, stage);
      toast.success(`${stage.label} completed`);
      await loadAll();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to complete stage'));
    } finally {
      setBusyStageId(null);
    }
  };

  const handleReassign = async (stage: ShipmentStage, userId: string) => {
    const { error } = await supabase
      .from('shipment_stages')
      .update({ assigned_to: userId || null, updated_by: profile?.id })
      .eq('id', stage.id);
    if (error) {
      toast.error('Failed to reassign stage');
      return;
    }
    loadAll();
  };

  const handleDueDateChange = async (stage: ShipmentStage, date: string) => {
    const { error } = await supabase
      .from('shipment_stages')
      .update({ due_date: date || null, updated_by: profile?.id })
      .eq('id', stage.id);
    if (error) {
      toast.error('Failed to update due date');
      return;
    }
    loadAll();
  };

  const cycleTaskStatus = async (task: ShipmentTask) => {
    const next: Record<PlanTaskStatus, PlanTaskStatus> = {
      pending: 'in_progress',
      in_progress: 'done',
      done: 'pending',
      cancelled: 'pending',
    };
    const { error } = await supabase
      .from('shipment_tasks')
      .update({
        status: next[task.status],
        completed_at: next[task.status] === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', task.id);
    if (error) {
      toast.error('Failed to update task');
      return;
    }
    loadAll();
  };

  const handleAddTask = async (stage: ShipmentStage) => {
    const title = (newTaskTitle[stage.id] ?? '').trim();
    if (!title || !profile) return;
    const { error } = await supabase.from('shipment_tasks').insert({
      shipment_id: shipmentId,
      stage_id: stage.id,
      branch_id: branchId,
      title,
      assigned_department: stage.assigned_department,
      created_by: profile.id,
    });
    if (error) {
      toast.error('Failed to add task');
      return;
    }
    setNewTaskTitle((prev) => ({ ...prev, [stage.id]: '' }));
    loadAll();
  };

  const handleAddComment = async (stage: ShipmentStage) => {
    const comment = (newComment[stage.id] ?? '').trim();
    if (!comment || !profile) return;
    const { error } = await supabase.from('shipment_stage_comments').insert({
      stage_id: stage.id,
      shipment_id: shipmentId,
      branch_id: branchId,
      comment,
      created_by: profile.id,
    });
    if (error) {
      toast.error('Failed to add comment');
      return;
    }
    setNewComment((prev) => ({ ...prev, [stage.id]: '' }));
    loadAll();
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
        const statusMeta = WORKFLOW_STAGE_STATUS_META[stage.status];
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
                        const taskStatusMeta = PLAN_TASK_STATUS_META[t.status];
                        const priorityMeta = PRIORITY_META[t.priority];
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
