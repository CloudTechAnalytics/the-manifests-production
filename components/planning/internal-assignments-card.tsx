'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Profile, ShipmentPlan, ShipmentStage, UserRole } from '@/types';

interface AssignmentRole {
  key: string;
  label: string;
  /** Which shipment_stages.stage_key this reuses, or null for the 2
   *  roles with no matching stage (written to shipment_plans instead). */
  stageKey: string | null;
  role: UserRole;
}

const ASSIGNMENT_ROLES: AssignmentRole[] = [
  { key: 'documentation', label: 'Documentation Officer', stageKey: 'documentation', role: 'documentation' },
  { key: 'customs', label: 'Customs Officer', stageKey: 'customs_clearance', role: 'customs' },
  { key: 'terminal', label: 'Terminal Officer', stageKey: 'terminal_operations', role: 'terminal' },
  { key: 'transport', label: 'Transport Officer', stageKey: 'transportation', role: 'transport' },
  { key: 'finance', label: 'Finance Officer', stageKey: null, role: 'finance' },
  { key: 'supervisor', label: 'Supervisor', stageKey: null, role: 'branch_manager' },
];

interface InternalAssignmentsCardProps {
  shipmentId: string;
  branchId: string;
  plan: ShipmentPlan;
  stages: ShipmentStage[];
  onChanged: () => void;
}

export function InternalAssignmentsCard({
  shipmentId,
  branchId,
  plan,
  stages,
  onChanged,
}: InternalAssignmentsCardProps) {
  const { profile, hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('planning');
  const [staffByRole, setStaffByRole] = useState<Record<string, Profile[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  const currentAssigneeId = (role: AssignmentRole): string | null => {
    if (role.stageKey) {
      return stages.find((s) => s.stage_key === role.stageKey)?.assigned_to ?? null;
    }
    return role.key === 'finance' ? plan.finance_officer_id : plan.supervisor_id;
  };

  const handleAssign = async (role: AssignmentRole, userId: string) => {
    if (!profile) return;
    setSavingKey(role.key);
    try {
      const assigneeName =
        staffByRole[role.key]?.find((p) => p.id === userId)?.full_name ?? 'Unassigned';

      if (role.stageKey) {
        const stage = stages.find((s) => s.stage_key === role.stageKey);
        if (!stage) throw new Error(`No ${role.label} stage found for this shipment`);
        const { error } = await supabase
          .from('shipment_stages')
          .update({ assigned_to: userId || null, updated_by: profile.id })
          .eq('id', stage.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'planning.officer_assigned',
          entity_type: 'shipment_stage',
          entity_id: stage.id,
          description: `${assigneeName} assigned as ${role.label}`,
          metadata: { shipment_id: shipmentId, role: role.key, assignee_id: userId || null },
        });
      } else {
        const column = role.key === 'finance' ? 'finance_officer_id' : 'supervisor_id';
        const { error } = await supabase
          .from('shipment_plans')
          .update({ [column]: userId || null, updated_by: profile.id })
          .eq('id', plan.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'planning.officer_assigned',
          entity_type: 'shipment_plan',
          entity_id: plan.id,
          description: `${assigneeName} assigned as ${role.label}`,
          metadata: { shipment_id: shipmentId, role: role.key, assignee_id: userId || null },
        });
      }

      toast.success(`${role.label} updated`);
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
        <CardTitle className="text-base font-semibold">Internal Assignments</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ASSIGNMENT_ROLES.map((role) => {
          const currentId = currentAssigneeId(role) ?? '';
          const options = staffByRole[role.key] ?? [];
          return (
            <div key={role.key} className="space-y-1.5">
              <Label htmlFor={`ia-${role.key}`}>{role.label}</Label>
              <Select
                value={currentId}
                onValueChange={(v) => handleAssign(role, v)}
                disabled={!canManage || savingKey === role.key}
              >
                <SelectTrigger id={`ia-${role.key}`}>
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
          );
        })}
      </CardContent>
    </Card>
  );
}
