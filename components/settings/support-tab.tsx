'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { getErrorMessage, cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SupportTicket, TicketPriority } from '@/types';

const PRIORITY_META: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-muted text-muted-foreground' },
  normal: { label: 'Normal', color: 'bg-primary/10 text-primary' },
  high: { label: 'High', color: 'bg-amber-50 text-amber-700' },
  urgent: { label: 'Urgent', color: 'bg-red-50 text-red-700' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In Progress', color: 'bg-amber-50 text-amber-700' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700' },
  closed: { label: 'Closed', color: 'bg-muted text-muted-foreground' },
};

const EMPTY_FORM = { subject: '', description: '', priority: 'normal' as TicketPriority };

/**
 * "Firms raise them from Firm Settings → Support" — the tenant-facing
 * half of the support ticket feature (the platform-admin-facing queue
 * lives at /platform/support-tickets). Any active org member can raise
 * and see their own organization's tickets; only platform staff triage
 * them (migration 073's RLS), so there's no status/priority editing
 * here — just raise, and watch it move.
 */
export function SupportTab() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.organization_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTickets((data as SupportTicket[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load support tickets'));
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!profile?.organization_id) return;
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from('support_tickets').insert({
        organization_id: profile.organization_id,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        created_by: profile.id,
      });
      if (error) throw error;
      toast.success('Support ticket raised — our team will follow up.');
      setOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to raise ticket'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Support</h3>
          <p className="text-sm text-muted-foreground">
            Raise a request with the CloudTech team and track its status here.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(EMPTY_FORM); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Raise a support ticket</DialogTitle>
              <DialogDescription>
                Tell us what's going on — the platform team will pick it up from here.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ticket-subject">Subject</Label>
                <Input
                  id="ticket-subject"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Short summary of the issue"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea
                  id="ticket-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What happened, and what were you trying to do?"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TicketPriority }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_META) as TicketPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Submit ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base font-semibold">Your tickets</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="No support tickets yet"
              message="Raise one above if you run into an issue."
              compact
            />
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <div key={t.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.ticket_number} · {formatDateTime(t.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge className={cn('text-[11px]', PRIORITY_META[t.priority].color)}>
                        {PRIORITY_META[t.priority].label}
                      </Badge>
                      <Badge className={cn('text-[11px]', STATUS_META[t.status]?.color)}>
                        {STATUS_META[t.status]?.label ?? t.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
