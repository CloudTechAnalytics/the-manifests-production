'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, Send, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Branch, Department, UserRole } from '@/types';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'planning', label: 'Planning' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'customs', label: 'Customs' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'examination', label: 'Examination' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'transport', label: 'Transport' },
  { value: 'finance', label: 'Finance' },
];

interface PendingInvite { email: string; role: UserRole; }

/** Onboarding step 4 — spec section 10. Same invite-user edge function the Users page uses; not a parallel invite system. */
export function InviteTeamStep({ organizationId }: { organizationId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('operations');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<PendingInvite[]>([]);

  const load = useCallback(async () => {
    const [{ data: b }, { data: d }] = await Promise.all([
      supabase.from('branches').select('*').eq('organization_id', organizationId).is('deleted_at', null),
      supabase.from('departments').select('*').eq('organization_id', organizationId).is('deleted_at', null).eq('is_active', true),
    ]);
    setBranches((b ?? []) as Branch[]);
    setDepartments((d ?? []) as Department[]);
    if (b?.[0]) setBranchId(b[0].id);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async () => {
    if (!email.trim() || !branchId) {
      toast.error('Email and branch are required');
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Your session has expired. Please sign in again.'); return; }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            email: email.trim(),
            full_name: fullName.trim() || undefined,
            role,
            branch_id: branchId,
            department_id: departmentId || null,
            organization_id: organizationId,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to send invite');
      setSent((s) => [...s, { email: email.trim(), role }]);
      setFullName('');
      setEmail('');
      toast.success(data.emailed ? `Invitation sent to ${email}` : `Invitation created (email not configured): ${data.link ?? ''}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send invitation'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Invite your team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each teammate sets their own password — you&apos;ll never see it. Optional; you can invite people later from Users.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Employee Name</Label>
          <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email *</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Role *</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Department</Label>
          <Select value={departmentId || undefined} onValueChange={setDepartmentId}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Branch *</Label>
          <Select value={branchId || undefined} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder="Select a branch" /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" variant="outline" onClick={handleInvite} disabled={sending || !email.trim()}>
        {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
        Send invitation
      </Button>

      {sent.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">Invited this session</p>
          {sent.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
              <span>{s.email}</span>
              <span className="text-xs text-muted-foreground">({s.role})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
