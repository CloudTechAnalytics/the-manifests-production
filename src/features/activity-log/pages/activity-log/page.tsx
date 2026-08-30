'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { getErrorMessage } from '@/shared/lib/utils';
import { formatDateTime } from '@/shared/lib/utils/status';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

interface ActivityRow {
  id: string;
  user_id: string | null;
  action: string;
  description: string;
  created_at: string;
  branchName: string;
  userName: string;
}

const PAGE_SIZE = 25;

/*
 * Same activities table, same query engine, two views instead of two
 * pages: Operations Log is the day-to-day feed (shipments, quotations,
 * invoices, documents...), Audit Trail narrows to account/security/
 * destructive actions (user management, permanent deletes, password
 * resets, org settings). Filtered server-side via `action`'s own
 * `entity.verb` naming convention already used everywhere this table is
 * written to — no new column, no second table, "Load more" stays correct
 * per tab because the filter is in the query, not applied after the fact.
 */
type LogView = 'operations' | 'audit';

// action follows an `entity.verb` convention everywhere it's written —
// these patterns classify it as Audit Trail; everything else is
// Operations Log. PostgREST like uses SQL wildcards (% not *).
const AUDIT_LIKE_PATTERNS = ['user.%', 'organization.%', 'branch.%', '%permanently_deleted%', '%password_reset%'];

export default function ActivityLogPage() {
  const { hasRole } = useAuth();
  // Mirrors select_activities_branch (migration 028): only admin and
  // branch_manager see everyone's activity — everyone else only sees
  // their own, enforced at the database level, not just here.
  const seesEveryonesActivity = hasRole('admin') || hasRole('branch_manager');

  const [view, setView] = useState<LogView>('operations');
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(async (offset: number, currentView: LogView) => {
    // No client-side org/branch filter needed — select_activities_branch
    // scopes branch-scoped rows to the caller's own organization (every
    // branch, for an admin) or just their own branch (for everyone else),
    // and select_activities_org_admin separately lets an org admin see
    // their own organization's branch-less rows (e.g. inviting a user
    // with no branch yet).
    let query = supabase
      .from('activities')
      .select('id, user_id, action, description, created_at, branch:branches(name)')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (currentView === 'audit') {
      query = query.or(AUDIT_LIKE_PATTERNS.map((p) => `action.like.${p}`).join(','));
    } else {
      // Operations Log = the inverse: none of the audit patterns match.
      // Chained .not() calls AND together (no .and() exists on this
      // builder) — "not like A" and "not like B" and ...
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

    // activities.user_id is a FK to auth.users, not profiles — no
    // PostgREST embed exists for it, so actor names are batch-fetched
    // separately and mapped in memory (same pattern used everywhere
    // else this table is displayed).
    const actorIds = Array.from(new Set(actRows.map((a) => a.user_id).filter(Boolean))) as string[];
    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actorRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds);
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
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const first = await loadPage(0, view);
        setRows(first);
        setHasMore(first.length === PAGE_SIZE);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to load activity log'));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPage, view]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await loadPage(rows.length, view);
      setRows((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load more entries'));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="page-title">{view === 'audit' ? 'Audit Trail' : 'Operations Log'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view === 'audit'
            ? 'Account, security, and destructive actions.'
            : seesEveryonesActivity
              ? 'Every logged operational action across your organization.'
              : 'Your logged operational actions.'}
        </p>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as LogView)}>
        <TabsList>
          <TabsTrigger value="operations" className="gap-1.5">
            <History className="h-4 w-4" />
            Operations Log
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" />
            Audit Trail
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <History className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No activity recorded yet</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(r.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">{r.branchName}</TableCell>
                      <TableCell className="text-sm font-medium">{r.userName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hasMore && (
                <div className="flex justify-center border-t border-border p-4">
                  <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
