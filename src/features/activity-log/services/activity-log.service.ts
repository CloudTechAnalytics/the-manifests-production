import { supabase } from '@/shared/lib/supabase/client';

export interface ActivityRow {
  id: string;
  user_id: string | null;
  action: string;
  description: string;
  created_at: string;
  branchName: string;
  userName: string;
}

export type LogView = 'operations' | 'audit';

// action follows an `entity.verb` convention everywhere it's written —
// these patterns classify it as Audit Trail; everything else is
// Operations Log. PostgREST like uses SQL wildcards (% not *).
export const AUDIT_LIKE_PATTERNS = [
  'user.%',
  'organization.%',
  'branch.%',
  '%permanently_deleted%',
  '%password_reset%',
];

/**
 * One page of the activity log (Operations or Audit view), actor names
 * resolved in memory since activities.user_id has no PostgREST embed to
 * auth.users. Mirrors select_activities_branch (migration 028) at the RLS
 * layer — this just applies the operations/audit split client-side.
 */
export async function fetchActivityLogPage(
  offset: number,
  limit: number,
  view: LogView
): Promise<ActivityRow[]> {
  let query = supabase
    .from('activities')
    .select('id, user_id, action, description, created_at, branch:branches(name)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (view === 'audit') {
    query = query.or(AUDIT_LIKE_PATTERNS.map((p) => `action.like.${p}`).join(','));
  } else {
    for (const pattern of AUDIT_LIKE_PATTERNS) {
      query = query.not('action', 'like', pattern);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const actRows =
    (data as unknown as {
      id: string;
      user_id: string | null;
      action: string;
      description: string;
      created_at: string;
      branch: { name: string } | null;
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
    branchName: a.branch?.name ?? 'Organization-wide',
    userName: a.user_id ? actorNames.get(a.user_id) ?? 'Unknown user' : 'System',
  }));
}
