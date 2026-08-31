'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, AlertTriangle, UserX, CheckCircle2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/auth-context';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import {
  fetchSupportTickets,
  updateSupportTicket,
} from '@/features/platform/services/support-tickets.service';
import { formatDateTime } from '@/shared/lib/utils/status';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { SupportTicket, TicketStatus, TicketPriority } from '@/shared/types';

type TicketRow = SupportTicket & {
  organization: { id: string; name: string } | null;
  assigned_user: { id: string; full_name: string } | null;
};

const PRIORITY_META: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-muted text-muted-foreground' },
  normal: { label: 'Normal', color: 'bg-primary/10 text-primary' },
  high: { label: 'High', color: 'bg-amber-50 text-amber-700' },
  urgent: { label: 'Urgent', color: 'bg-red-50 text-red-700' },
};

const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In Progress', color: 'bg-amber-50 text-amber-700' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700' },
  closed: { label: 'Closed', color: 'bg-muted text-muted-foreground' },
};

const STATUS_OPTIONS: { value: 'all' | TicketStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function SupportTicketsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: tickets = [], isLoading: loading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: fetchSupportTickets,
  });

  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), []);
  const openCount = tickets.filter((t) => t.status === 'open').length;
  const highPriorityCount = tickets.filter(
    (t) => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'resolved' && t.status !== 'closed'
  ).length;
  const unassignedCount = tickets.filter(
    (t) => !t.assigned_to && t.status !== 'resolved' && t.status !== 'closed'
  ).length;
  const resolved30dCount = tickets.filter(
    (t) => (t.status === 'resolved' || t.status === 'closed') && t.resolved_at && new Date(t.resolved_at) >= thirtyDaysAgo
  ).length;

  const kpis = [
    { label: 'Open', value: openCount, icon: LifeBuoy, href: '#', caption: 'Awaiting resolution' },
    { label: 'High Priority', value: highPriorityCount, icon: AlertTriangle, href: '#', caption: 'Urgent or high, still open' },
    { label: 'Unassigned', value: unassignedCount, icon: UserX, href: '#', caption: 'No engineer assigned yet' },
    { label: 'Resolved (30D)', value: resolved30dCount, icon: CheckCircle2, href: '#', caption: 'Closed in the last 30 days' },
  ];

  const filtered = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!t.subject.toLowerCase().includes(q) && !(t.ticket_number ?? '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; patch: Partial<Pick<SupportTicket, 'status' | 'assigned_to'>> }) =>
      updateSupportTicket(params.id, params.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update ticket'));
    },
    onSettled: () => {
      setBusyId(null);
    },
  });

  const updateTicket = (id: string, patch: Partial<Pick<SupportTicket, 'status' | 'assigned_to'>>) => {
    setBusyId(id);
    updateMutation.mutate({ id, patch });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Issues raised by tenant organizations — triage, assign, and resolve.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by subject or ticket number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | TicketStatus)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="No support tickets yet"
              message="Firms raise them from Firm Settings → Support."
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((t) => (
                <div key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{t.subject}</p>
                      <Badge className={cn('text-[11px]', PRIORITY_META[t.priority].color)}>
                        {PRIORITY_META[t.priority].label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{t.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.ticket_number} · {t.organization?.name ?? 'Unknown org'} · {formatDateTime(t.created_at)}
                      {t.assigned_user && <> · Assigned to {t.assigned_user.full_name}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!t.assigned_to && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === t.id}
                        onClick={() => updateTicket(t.id, { assigned_to: profile?.id })}
                      >
                        Assign to me
                      </Button>
                    )}
                    <Select
                      value={t.status}
                      onValueChange={(v) => updateTicket(t.id, { status: v as TicketStatus })}
                      disabled={busyId === t.id}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_META) as TicketStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
