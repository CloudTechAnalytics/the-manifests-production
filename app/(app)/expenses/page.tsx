'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Plus, Search, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
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
import type { Expense, ExpenseCategory, ExpenseStatus, Branch } from '@/types';

type ExpenseRow = Expense & {
  branch?: { id: string; name: string } | null;
  paid_by_user?: { id: string; full_name: string } | null;
};

export default function ExpensesPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadExpenses = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*, branch:branches(id, name), paid_by_user:profiles!expenses_paid_by_fkey(id, full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && userBranchId) query = query.eq('branch_id', userBranchId);
      if (isAdmin && branchIdFilter !== 'all') query = query.eq('branch_id', branchIdFilter);
      if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (debouncedSearch) {
        query = query.or(
          `expense_number.ilike.%${debouncedSearch}%,description.ilike.%${debouncedSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading expenses:', error);
        setExpenses([]);
        return;
      }
      setExpenses((data as ExpenseRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, userBranchId, branchIdFilter, categoryFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const summary = useMemo(() => {
    let total = 0;
    let thisMonth = 0;
    let approved = 0;
    let pending = 0;
    const categories = new Set<string>();
    const now = new Date();
    expenses.forEach((e) => {
      total += Number(e.amount);
      categories.add(e.category);
      const d = new Date(e.expense_date);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        thisMonth += Number(e.amount);
      }
      if (e.status === 'approved') approved += Number(e.amount);
      if (e.status === 'pending') pending += Number(e.amount);
    });
    return {
      count: expenses.length,
      total,
      thisMonth,
      approved,
      pending,
      categoryCount: categories.size,
    };
  }, [expenses]);

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CreditCard className="h-6 w-6 text-blue-600" />
            Expenses
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage company expenses.
          </p>
        </div>
        <Link href="/expenses/new" className="sm:shrink-0">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Expense
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? (
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
          <CardTitle className="text-base font-semibold">
            All Expenses
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({expenses.length})
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
                    const statusMeta = EXPENSE_STATUS_META[exp.status];
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
                          {EXPENSE_CATEGORY_META[exp.category].label}
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
