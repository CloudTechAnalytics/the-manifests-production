'use client';

import { useState } from 'react';
import { History, ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { formatDateTime } from '@/shared/lib/utils/status';
import { usePaginatedList } from '@/shared/hooks/use-paginated-list';
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
import { fetchActivityLogPage, type LogView } from '@/features/activity-log/services/activity-log.service';

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

export default function ActivityLogPage() {
  const { hasRole } = useAuth();
  // Mirrors select_activities_branch (migration 028): only admin and
  // branch_manager see everyone's activity — everyone else only sees
  // their own, enforced at the database level, not just here.
  const seesEveryonesActivity = hasRole('admin') || hasRole('branch_manager');

  const [view, setView] = useState<LogView>('operations');

  const {
    rows,
    loading,
    loadingMore,
    hasMore,
    loadMore: handleLoadMore,
  } = usePaginatedList(['activity-log', view], (offset, limit) => fetchActivityLogPage(offset, limit, view));

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
