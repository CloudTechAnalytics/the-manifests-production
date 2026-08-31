import { supabase } from '@/shared/lib/supabase/client';

export interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  description: string;
  created_at: string;
  organizationName: string;
  userName: string;
}

/**
 * One page of audit-log rows, offset/limit-paginated. activities.user_id
 * is a FK to auth.users, not profiles — no PostgREST embed exists for it,
 * so actor names are batch-fetched separately and mapped in memory (same
 * pattern as the dashboard's activity feed).
 */
export async function fetchAuditLogsPage(offset: number, limit: number): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from('activities')
    .select(
      'id, user_id, action, description, created_at, branch:branches(name, organization:organizations(name)), organization:organizations(name)'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const actRows = (data as unknown as {
    id: string;
    user_id: string | null;
    action: string;
    description: string;
    created_at: string;
    branch: { name: string; organization: { name: string } | null } | null;
    organization: { name: string } | null;
  }[]) ?? [];

  const actorIds = Array.from(new Set(actRows.map((a) => a.user_id).filter(Boolean))) as string[];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actorRows } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
    (actorRows ?? []).forEach((p) => actorNames.set(p.id, p.full_name));
  }

  return actRows.map((a) => ({
    id: a.id,
    user_id: a.user_id,
    action: a.action,
    description: a.description,
    created_at: a.created_at,
    organizationName: a.organization?.name ?? a.branch?.organization?.name ?? '—',
    userName: a.user_id ? actorNames.get(a.user_id) ?? 'Unknown user' : 'System',
  }));
}
