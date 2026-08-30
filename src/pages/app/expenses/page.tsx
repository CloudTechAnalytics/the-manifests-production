'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Plus, Search, Filter, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EXPENSE_CATEGORY_META,
  EXPENSE_STATUS_META,
  formatCurrency,
  formatDate,
} from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { Expense, ExpenseCategory, ExpenseStatus, Branch } from '@/types';

type ExpenseRow = Expense & {
  branch?: { id: string; name: string } | null;
  paid_by_user?: { id: string; full_name: string } | null;
};

const EXPENSE_EXPORT_COLUMNS: ExportColumn<ExpenseRow>[] = [
  { header: 'Number', value: (e) => e.expense_number },
  { header: 'Description', value: (e) => e.description },
  { header: 'Category', value: (e) => e.category },
  { header: 'Amount', value: (e) => e.amount },
  { header: 'Currency', value: (e) => e.currency },
  { header: 'Date', value: (e) => e.expense_date },
  { header: 'Status', value: (e) => e.status },
  { header: 'Branch', value: (e) => e.branch?.name ?? '' },
  { header: 'Paid By', value: (e) => e.paid_by_user?.full_name ?? '' },
  { header: 'Created', value: (e) => e.created_at },
];

export default function ExpensesPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseStatus>('all');
  const [branchIdFilter, setBranchIdFilter] = useState('all');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .then(({ data }) => setBranches((data as Branch[]) ?? []));
  }, [isAdmin]);

  // Shared branch/category/status/search scoping — reused by the paginated
  // list query, the summary query, and export.
  const applyExpenseScope = useCallback(
    <Q extends { eq: any; or: any; in: any }>(query: Q): Q => {
      let q = query;
      if (!isAdmin && userBranchId) {
        q = q.eq('branch_id', userBranchId);
      } else if (isAdmin && branchIdFilter !== 'all') {
        q = q.eq('branch_id', branchIdFilter);
      } else if (isAdmin && branches.length > 0) {
        // "All branches" selected: RLS's can_access_branch() already
        // allows exactly this organization's own branches for an admin
        // — this doesn't change which rows come back, it just gives
        // Postgres a concrete branch_id list it can push into the
        // existing branch_id index instead of evaluating the RLS
        // function unconstrained across every row.
        q = q.in('branch_id', branches.map((b) => b.id));
      }
      if (categoryFilter !== 'all') q = q.eq('category', categoryFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (debouncedSearch) {
        const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
        q = q.or(`expense_number.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      }
      return q;
    },
    [isAdmin, userBranchId, branchIdFilter, categoryFilter, statusFilter, debouncedSearch, branches]
  );

  const buildExpensesListQuery = useCallback(
    () =>
      applyExpenseScope(
        supabase
          .from('expenses')
          .select('*, branch:branches(id, name), paid_by_user:profiles!expenses_paid_by_fkey(id, full_name)')
          .is('deleted_at', null)
      ).order('created_at', { ascending: false }),
    [applyExpenseScope]
  );

  const fetchExpensesPage = useCallback(
    async (offset: number, limit: number): Promise<ExpenseRow[]> => {
      if (!profile) return [];
      const { data, error } = await buildExpensesListQuery().range(offset, offset + limit - 1);
      if (error) {
        console.error('Error loading expenses:', error);
        return [];
      }
      return (data as ExpenseRow[]) ?? [];
    },
    [profile, buildExpensesListQuery]
  );

  const { rows: expenses, loading, loadingMore, hasMore, loadMore } =
    usePaginatedList<ExpenseRow>(fetchExpensesPage);

  // Export intentionally does NOT reuse `expenses` (the current page) — it
  // fetches every row matching the active filters, unbounded, only when
  // actually clicked, so pagination on the table never silently shrinks
  // what "Export" means.
  const fetchAllExpensesForExport = useCallback(async (): Promise<ExpenseRow[]> => {
    const { data, error } = await buildExpensesListQuery();
    if (error) throw error;
    return (data as ExpenseRow[]) ?? [];
  }, [buildExpensesListQuery]);

  // Summary tiles: their own lightweight (no embeds), unpaginated query,
  // decoupled from the paginated display rows above — pagination must
  // never silently make a financial total wrong by only summing whatever
  // page happens to be loaded.
  const [summary, setSummary] = useState({
    count: 0,
    total: 0,
    thisMonth: 0,
    pending: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setSummaryLoading(true);
    (async () => {
      const { data, error } = await applyExpenseScope(
        supabase
          .from('expenses')
          .select('amount, status, expense_date')
          .is('deleted_at', null)
      );
      if (cancelled) return;
      if (error) {
        console.error('Error loading expense summary:', error);
        setSummaryLoading(false);
        return;
      }
      const rows = (data ?? []) as Pick<Expense, 'amount' | 'status' | 'expense_date'>[];
      let total = 0;
      let thisMonth = 0;
      let pending = 0;
      const now = new Date();
      rows.forEach((e) => {
        total += Number(e.amount);
        const d = new Date(e.expense_date);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          thisMonth += Number(e.amount);
        }
        if (e.status === 'pending') pending += Number(e.amount);
      });
      setSummary({ count: rows.length, total, thisMonth, pending });
      setSummaryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, applyExpenseScope]);

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <CreditCard className="h-6 w-6 text-blue-600" />
            Expenses
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage company expenses.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton
            fetchData={fetchAllExpensesForExport}
            columns={EXPENSE_EXPORT_COLUMNS}
            filename="expenses"
          />
          <Link href="/expenses/new">
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Expense
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatTile label="Total Expenses" value={String(summary.count)} />
            <StatTile label="Total Amount" value={formatCurrency(summary.total)} />
            <StatTile label="This Month" value={formatCurrency(summary.thisMonth)} />
            <StatTile
              label="Pending Approval"
              value={formatCurrency(summary.pending)}
              tone={summary.pending > 0 ? 'text-amber-600' : undefined}
            />
          </>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by description or expense number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as 'all' | ExpenseCategory)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {EXPENSE_CATEGORY_META[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | ExpenseStatus)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {(Object.keys(EXPENSE_STATUS_META) as ExpenseStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {EXPENSE_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={branchIdFilter} onValueChange={setBranchIdFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-lg font-semibold">
            All Expenses
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({expenses.length}
                {hasMore ? '+' : ''})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No expenses found"
              message={
                debouncedSearch || categoryFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Get started by adding a new expense.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense Ref</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => {
                    const statusMeta = EXPENSE_STATUS_META[exp.status] ?? {
                      label: exp.status ?? 'Unknown',
                      color: 'bg-muted text-muted-foreground',
                    };
                    return (
                      <TableRow
                        key={exp.id}
                        className="cursor-pointer transition-colors hover:bg-accent/60"
                        onClick={() => router.push(`/expenses/${exp.id}`)}
                      >
                        <TableCell className="font-medium text-primary">
                          {exp.expense_number ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{exp.description}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {EXPENSE_CATEGORY_META[exp.category]?.label ?? exp.category}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(exp.expense_date)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {exp.branch?.name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(exp.amount, exp.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                            {statusMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {exp.paid_by_user?.full_name ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && hasMore && (
            <div className="flex justify-center border-t border-border p-4">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1.5 text-xl font-bold tracking-tight ${tone ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
