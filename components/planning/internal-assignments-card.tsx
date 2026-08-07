'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PLAN_ASSIGNMENT_STATUS_META } from '@/lib/utils/status';
import type {
  PlanAssignment,
  PlanAssignmentRole,
  PlanAssignmentStatus,
  Profile,
  ShipmentStage,
  UserRole,
} from '@/types';

interface AssignmentRoleDef {
  key: PlanAssignmentRole;
  label: string;
  /** Which shipment_stages.stage_key this reuses, or null for roles with
   *  no matching stage (documentation-only planning roles). */
  stageKey: string | null;
  role: UserRole;
}

const ASSIGNMENT_ROLES: AssignmentRoleDef[] = [
  { key: 'documentation', label: 'Documentation Officer', stageKey: 'documentation', role: 'documentation' },
  { key: 'customs', label: 'Customs Officer', stageKey: 'customs_clearance', role: 'customs' },
  { key: 'terminal', label: 'Terminal Officer', stageKey: 'terminal_operations', role: 'terminal' },
  { key: 'transport', label: 'Transport Officer', stageKey: 'transportation', role: 'transport' },
  { key: 'finance', label: 'Finance Officer', stageKey: null, role: 'finance' },
  { key: 'warehouse', label: 'Warehouse Officer', stageKey: null, role: 'warehouse' },
  { key: 'supervisor', label: 'Supervisor', stageKey: null, role: 'branch_manager' },
];

const STATUS_OPTIONS = Object.keys(PLAN_ASSIGNMENT_STATUS_META) as PlanAssignmentStatus[];

interface InternalAssignmentsCardProps {
  shipmentId: string;
  branchId: string;
  stages: ShipmentStage[];
  onChanged: () => void;
}

export function InternalAssignmentsCard({
  shipmentId,
  branchId,
  stages,
  onChanged,
}: InternalAssignmentsCardProps) {
  const { profile, hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('planning');
  const [staffByRole, setStaffByRole] = useState<Record<string, Profile[]>>({});
  const [assignments, setAssignments] = useState<Record<string, PlanAssignment>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    const { data, error } = await supabase
      .from('plan_assignments')
      .select('*, assigned_user:profiles!plan_assignments_assigned_to_fkey(id, full_name)')
      .eq('shipment_id', shipmentId);
    if (error) {
      console.error('Error loading assignments:', error);
      return;
    }
    const byRole: Record<string, PlanAssignment> = {};
    ((data as unknown as PlanAssignment[]) ?? []).forEach((a) => {
      byRole[a.role] = a;
    });
    setAssignments(byRole);
  }, [shipmentId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        ASSIGNMENT_ROLES.map((r) =>
          supabase
            .from('profiles')
            .select('*')
            .eq('branch_id', branchId)
            .eq('role', r.role)
            .eq('is_active', true)
            .is('deleted_at', null)
        )
      );
      if (cancelled) return;
      const byRole: Record<string, Profile[]> = {};
      ASSIGNMENT_ROLES.forEach((r, i) => {
        byRole[r.key] = (results[i].data as Profile[]) ?? [];
      });
      setStaffByRole(byRole);
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const upsertAssignment = async (role: AssignmentRoleDef, patch: Record<string, unknown>) => {
    if (!profile) return;
    setSavingKey(role.key);
    try {
      const existing = assignments[role.key];
      let assignmentId = existing?.id ?? null;

      if (existing) {
        const { error } = await supabase
          .from('plan_assignments')
          .update({ ...patch, updated_by: profile.id })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('plan_assignments')
          .insert({
            shipment_id: shipmentId,
            branch_id: branchId,
            role: role.key,
            created_by: profile.id,
            ...patch,
          })
          .select('id')
          .single();
        if (error) throw error;
        assignmentId = (data as { id: string })?.id ?? null;
      }

      // Sync the 4 stage-matched roles so the shipment's own Workflow tab
      // doesn't go stale when the assignee changes here.
      if (role.stageKey && 'assigned_to' in patch) {
        const stage = stages.find((s) => s.stage_key === role.stageKey);
        if (stage) {
          await supabase
            .from('shipment_stages')
            .update({ assigned_to: patch.assigned_to ?? null, updated_by: profile.id })
            .eq('id', stage.id);
        }
      }

      const assigneeName =
        'assigned_to' in patch
          ? staffByRole[role.key]?.find((p) => p.id === patch.assigned_to)?.full_name ?? 'Unassigned'
          : null;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'planning.assignment_updated',
        entity_type: 'plan_assignment',
        entity_id: assignmentId,
        description: assigneeName
          ? `${assigneeName} assigned as ${role.label}`
          : `${role.label} assignment updated`,
        metadata: { shipment_id: shipmentId, role: role.key, ...patch },
      });

      toast.success(`${role.label} updated`);
      loadAssignments();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to update ${role.label}`));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Internal Department Assignment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ASSIGNMENT_ROLES.map((role) => {
          const assignment = assignments[role.key];
          const options = staffByRole[role.key] ?? [];
          const status = assignment?.status ?? 'pending';
          const statusMeta = PLAN_ASSIGNMENT_STATUS_META[status] ?? {
            label: status,
            color: 'bg-muted text-muted-foreground',
          };
          const saving = savingKey === role.key;
          return (
            <div key={role.key} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{role.label}</p>
                <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                  {statusMeta.label}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`ia-user-${role.key}`}>Assigned User</Label>
                  <Select
                    value={assignment?.assigned_to ?? ''}
                    onValueChange={(v) => upsertAssignment(role, { assigned_to: v || null })}
                    disabled={!canManage || saving}
                  >
                    <SelectTrigger id={`ia-user-${role.key}`}>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No {role.label.toLowerCase()}s in this branch
                        </div>
                      ) : (
                        options.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ia-due-${role.key}`}>Due Date</Label>
                  <Input
                    id={`ia-due-${role.key}`}
                    type="date"
                    defaultValue={assignment?.due_date ?? ''}
                    disabled={!canManage}
                    onBlur={(e) => {
                      const v = e.target.value || null;
                      if (v !== (assignment?.due_date ?? null)) upsertAssignment(role, { due_date: v });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ia-status-${role.key}`}>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      upsertAssignment(role, {
                        status: v as PlanAssignmentStatus,
                        assigned_date: assignment?.assigned_date ?? new Date().toISOString().slice(0, 10),
                      })
                    }
                    disabled={!canManage || saving}
                  >
                    <SelectTrigger id={`ia-status-${role.key}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {PLAN_ASSIGNMENT_STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
