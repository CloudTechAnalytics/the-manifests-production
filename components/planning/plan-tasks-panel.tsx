'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckSquare, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PLAN_TASK_STATUS_META, PRIORITY_META, formatDate } from '@/lib/utils/status';
import type { PlanTask, PlanTaskStatus, PriorityLevel, Profile } from '@/types';

interface PlanTasksPanelProps {
  planId: string;
  branchId: string;
  staff: Profile[];
}

export function PlanTasksPanel({ planId, branchId, staff }: PlanTasksPanelProps) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plan_tasks')
        .select('*, assigned_user:profiles!plan_tasks_assigned_to_fkey(id, full_name)')
        .eq('plan_id', planId)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) {
        console.error('Error loading tasks:', error);
        setTasks([]);
        return;
      }
      setTasks((data as unknown as PlanTask[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const resetForm = () => {
    setTitle('');
    setAssignedTo('');
    setDueDate('');
    setPriority('medium');
  };

  const handleCreate = async () => {
    if (!profile?.id || !title.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('plan_tasks').insert({
        plan_id: planId,
        branch_id: branchId,
        title: title.trim(),
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        priority,
        created_by: profile.id,
      });
      if (error) throw error;
      toast.success('Task added');
      setDialogOpen(false);
      resetForm();
      loadTasks();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to add task');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const cycleStatus = async (task: PlanTask) => {
    const next: Record<PlanTaskStatus, PlanTaskStatus> = {
      pending: 'in_progress',
      in_progress: 'done',
      done: 'pending',
      cancelled: 'pending',
    };
    const { error } = await supabase
      .from('plan_tasks')
      .update({ status: next[task.status], updated_at: new Date().toISOString() })
      .eq('id', task.id);
    if (error) {
      toast.error('Failed to update task');
      return;
    }
    loadTasks();
  };

  const handleDelete = async (task: PlanTask) => {
    const { error } = await supabase.from('plan_tasks').delete().eq('id', task.id);
    if (error) {
      toast.error('Failed to delete task');
      return;
    }
    toast.success('Task removed');
    loadTasks();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Tasks & Next Steps</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
              <DialogDescription>Add a next step for this plan.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  Task <span className="text-destructive">*</span>
                </Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Confirm vessel booking" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Assigned To</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger>
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
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as PriorityLevel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_META) as PriorityLevel[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting || !title.trim()}>
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Add Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={CheckSquare} title="No tasks yet" message="Add a next step to get this plan moving." compact />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => {
                const statusMeta = PLAN_TASK_STATUS_META[t.status] ?? {
                  label: t.status ?? 'Unknown',
                  color: 'bg-muted text-muted-foreground',
                };
                const priorityMeta = PRIORITY_META[t.priority] ?? {
                  label: t.priority ?? 'Unknown',
                  color: 'bg-muted text-muted-foreground',
                };
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.assigned_user?.full_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(t.due_date)}</TableCell>
                    <TableCell>
                      <button onClick={() => cycleStatus(t)}>
                        <Badge variant="secondary" className={`cursor-pointer text-[11px] ${statusMeta.color}`}>
                          {statusMeta.label}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[11px] ${priorityMeta.color}`}>
                        {priorityMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
