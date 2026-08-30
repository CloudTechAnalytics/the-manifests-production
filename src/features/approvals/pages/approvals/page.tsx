'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Receipt, FileText } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { formatCurrency, formatDate } from '@/shared/lib/utils/status';

/*
 * Approvals — everything currently awaiting an approval decision from
 * this admin/branch_manager, in one place, across the two workflows
 * that have one: expenses (pending) and quotations (pending_approval).
 * Deliberately not a new approvals table of its own — each row here
 * still lives and is actioned on its own record's page; this is just a
 * single queue pointing at both.
 */

interface ApprovalRow {
  id: string;
  kind: 'expense' | 'quotation';
  title: string;
  subtitle: string;
  amount: string;
  date: string;
  href: string;
}

export default function ApprovalsPage() {
  const { profile, hasRole } = useAuth();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';
  const seesWholeOrg = isAdmin || hasRole('branch_manager');
  const branchFilter = seesWholeOrg ? null : profile?.branch_id ?? null;

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let expensesQuery = supabase
        .from('expenses')
        .select('id, expense_number, description, amount, currency, expense_date, category')
        .is('deleted_at', null)
        .eq('status', 'pending')
        .order('expense_date', { ascending: false });
      if (branchFilter) expensesQuery = expensesQuery.eq('branch_id', branchFilter);

      let quotationsQuery = supabase
        .from('quotations')
        .select('id, quotation_number, total, currency, created_at, customer:customers(company_name)')
        .is('deleted_at', null)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });
      if (branchFilter) quotationsQuery = quotationsQuery.eq('branch_id', branchFilter);

      const [expenses, quotations] = await Promise.all([expensesQuery, quotationsQuery]);

      const expenseRows: ApprovalRow[] = (
        (expenses.data ?? []) as {
          id: string;
          expense_number: string | null;
          description: string;
          amount: number;
          currency: string;
          expense_date: string;
          category: string;
        }[]
      ).map((e) => ({
        id: e.id,
        kind: 'expense',
        title: e.expense_number ?? 'Expense',
        subtitle: `${e.description} · ${e.category.replace(/_/g, ' ')}`,
        amount: formatCurrency(e.amount, e.currency),
        date: formatDate(e.expense_date),
        href: `/expenses/${e.id}`,
      }));

      const quotationRows: ApprovalRow[] = (
        (quotations.data ?? []) as unknown as {
          id: string;
          quotation_number: string | null;
          total: number;
          currency: string;
          created_at: string;
          customer: { company_name: string } | null;
        }[]
      ).map((q) => ({
        id: q.id,
        kind: 'quotation',
        title: q.quotation_number ?? 'Quotation',
        subtitle: q.customer?.company_name ?? 'Unknown customer',
        amount: formatCurrency(q.total, q.currency),
        date: formatDate(q.created_at),
        href: `/quotations/${q.id}`,
      }));

      setRows([...expenseRows, ...quotationRows]);
    } catch (err) {
      console.error('Approvals load error:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [profile, branchFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
