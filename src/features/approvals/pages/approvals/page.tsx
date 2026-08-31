'use client';

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShieldCheck, Receipt, FileText } from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { fetchApprovals } from '@/features/approvals/services/approvals.service';

/*
 * Approvals — everything currently awaiting an approval decision from
 * this admin/branch_manager, in one place, across the two workflows
 * that have one: expenses (pending) and quotations (pending_approval).
 * Deliberately not a new approvals table of its own — each row here
 * still lives and is actioned on its own record's page; this is just a
 * single queue pointing at both.
 */

export default function ApprovalsPage() {
  const { profile, hasRole } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const seesWholeOrg = isAdmin || hasRole('branch_manager');
  const branchFilter = seesWholeOrg ? null : profile?.branch_id ?? null;

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['approvals', branchFilter],
    queryFn: () => fetchApprovals(branchFilter),
    enabled: !!profile,
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Expenses and quotations currently waiting on your decision.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing pending" message="No expenses or quotations are waiting on approval right now." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Pending Approval</CardTitle>
            <CardDescription>{rows.length} item{rows.length === 1 ? '' : 's'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {rows.map((row) => (
              <Link
                key={`${row.kind}-${row.id}`}
                to={row.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    row.kind === 'expense' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  {row.kind === 'expense' ? <Receipt className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{row.amount}</p>
                  <p className="text-xs text-muted-foreground">{row.date}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[11px] capitalize">
                  {row.kind}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
