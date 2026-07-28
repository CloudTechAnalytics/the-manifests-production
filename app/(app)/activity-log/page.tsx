'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils/status';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

export default function ActivityLogPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(async (offset: number) => {
    // No client-side org/branch filter needed — select_activities_branch
    // already scopes this to the caller's own organization (every branch,
    // for an admin) or just their own branch (for everyone else).
    const { data, error } = await supabase
      .from('activities')
      .select('id, user_id, action, description, created_at, branch:branches(name)')
      .not('branch_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

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
      branchName: a.branch?.name ?? '—',
      userName: a.user_id ? actorNames.get(a.user_id) ?? 'Unknown user' : 'System',
    }));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const first = await loadPage(0);
        setRows(first);
        setHasMore(first.length === PAGE_SIZE);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to load activity log'));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPage]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await loadPage(rows.length);
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
        <h1 className="page-title">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every logged action across your organization.
        </p>
      </div>

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
