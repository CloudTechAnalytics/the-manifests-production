'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wallet, Plus, Search, Filter } from 'lucide-react';
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
  PAYMENT_METHOD_META,
  formatCurrency,
  formatDate,
  pickPrimaryCurrency,
} from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { Payment, PaymentMethod, Branch } from '@/types';

type PaymentRow = Payment & {
  customer?: { id: string; company_name: string } | null;
  allocations?: { amount: number; invoice: { invoice_number: string | null } | null }[];
};

const PAYMENT_EXPORT_COLUMNS: ExportColumn<PaymentRow>[] = [
  { header: 'Number', value: (p) => p.payment_number },
  { header: 'Customer', value: (p) => p.customer?.company_name ?? '' },
  { header: 'Date', value: (p) => p.payment_date },
  { header: 'Method', value: (p) => p.payment_method },
  { header: 'Amount', value: (p) => p.amount },
  { header: 'Allocated', value: (p) => p.allocated_amount },
  { header: 'Unallocated', value: (p) => p.amount - p.allocated_amount },
  { header: 'Reference', value: (p) => p.reference },
  { header: 'Created', value: (p) => p.created_at },
];

export default function PaymentsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
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

  const loadPayments = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('payments')
        .select(
          '*, customer:customers(id, company_name), allocations:payment_allocations(amount, invoice:invoices(invoice_number))'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && userBranchId) query = query.eq('branch_id', userBranchId);
      if (isAdmin && branchIdFilter !== 'all') query = query.eq('branch_id', branchIdFilter);
      if (methodFilter !== 'all') query = query.eq('payment_method', methodFilter);
      if (debouncedSearch) {
        query = query.or(
          `payment_number.ilike.%${debouncedSearch}%,reference.ilike.%${debouncedSearch}%,customer.company_name.ilike.%${debouncedSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading payments:', error);
        setPayments([]);
        return;
      }
      setPayments((data as PaymentRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, userBranchId, branchIdFilter, methodFilter, debouncedSearch]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const summary = useMemo(() => {
    const totalsByCurrency: Record<string, number> = {};
    let thisMonth = 0;
    let pendingAllocations = 0;
    const now = new Date();
    payments.forEach((p) => {
      // Payments don't carry currency directly in this schema iteration —
      // customers/invoices are branch-currency-agnostic, so we treat NGN
      // as the working currency unless multi-currency payments are added.
      totalsByCurrency.NGN = (totalsByCurrency.NGN ?? 0) + Number(p.amount);
      const paymentDate = new Date(p.payment_date);
      if (paymentDate.getFullYear() === now.getFullYear() && paymentDate.getMonth() === now.getMonth()) {
        thisMonth += Number(p.amount);
      }
      const unallocated = Number(p.amount) - Number(p.allocated_amount);
      if (unallocated > 0.01) pendingAllocations += unallocated;
    });
    const currency = pickPrimaryCurrency(totalsByCurrency) ?? 'NGN';
    return {
      count: payments.length,
      currency,
      total: totalsByCurrency[currency] ?? 0,
      thisMonth,
      pendingAllocations,
    };
  }, [payments]);

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Wallet className="h-6 w-6 text-blue-600" />
            Payments
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage all customer payments.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton
            data={payments}
            columns={PAYMENT_EXPORT_COLUMNS}
            filename="payments"
          />
          <Link href="/payments/new">
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              Record Payment
            </Button>
          </Link>
        </div>
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
            <StatTile label="Total Payments" value={String(summary.count)} />
            <StatTile label="Total Received" value={formatCurrency(summary.total, summary.currency)} tone="text-green-600" />
            <StatTile label="This Month" value={formatCurrency(summary.thisMonth, summary.currency)} />
            <StatTile
              label="Pending Allocation"
              value={formatCurrency(summary.pendingAllocations, summary.currency)}
              tone={summary.pendingAllocations > 0 ? 'text-amber-600' : undefined}
            />
          </>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference, customer, invoice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v as 'all' | PaymentMethod)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Methods</SelectItem>
                {(Object.keys(PAYMENT_METHOD_META) as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_META[m].label}
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
            All Payments
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({payments.length})
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
          ) : payments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payments found"
              message={
                debouncedSearch || methodFilter !== 'all' || branchIdFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Get started by recording a new payment.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Ref</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice(s)</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Unallocated</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const unallocated = Number(p.amount) - Number(p.allocated_amount);
                    const status =
                      p.allocated_amount <= 0
                        ? { label: 'Unallocated', color: 'bg-gray-100 text-gray-600' }
                        : unallocated > 0.01
                          ? { label: 'Partial', color: 'bg-amber-100 text-amber-700' }
                          : { label: 'Allocated', color: 'bg-green-100 text-green-700' };
                    const invoiceLabel =
                      p.allocations && p.allocations.length > 0
                        ? p.allocations.length === 1
                          ? p.allocations[0].invoice?.invoice_number ?? '—'
                          : `${p.allocations.length} invoices`
                        : '—';
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer transition-colors hover:bg-accent/60"
                        onClick={() => router.push(`/payments/${p.id}`)}
                      >
                        <TableCell className="font-medium text-primary">
                          {p.payment_number ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">
                          {p.customer?.company_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{invoiceLabel}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(p.payment_date)}
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {PAYMENT_METHOD_META[p.payment_method].label}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {unallocated > 0.01 ? formatCurrency(unallocated) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[11px] ${status.color}`}>
                            {status.label}
                          </Badge>
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
