'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Receipt, Plus, Search, Filter } from 'lucide-react';
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
  INVOICE_STATUS_META,
  isInvoiceOverdue,
  formatCurrency,
  formatDate,
  pickPrimaryCurrency,
} from '@/lib/utils/status';
import type { Invoice, InvoiceStatus, Branch } from '@/types';
import { cn } from '@/lib/utils';

type InvoiceRow = Invoice & {
  customer?: { id: string; company_name: string } | null;
  shipment?: { id: string; reference_number: string | null } | null;
};

type StatusTab = 'all' | InvoiceStatus | 'overdue';

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All Invoices' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

const VALID_TABS = new Set(STATUS_TABS.map((t) => t.value));

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && VALID_TABS.has(fromUrl as StatusTab) ? (fromUrl as StatusTab) : 'all';
  });
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

  const loadInvoices = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('invoices')
        .select(
          '*, customer:customers(id, company_name), shipment:shipments(id, reference_number)'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && userBranchId) query = query.eq('branch_id', userBranchId);
      if (isAdmin && branchIdFilter !== 'all') query = query.eq('branch_id', branchIdFilter);
      if (debouncedSearch) {
        query = query.or(
          `invoice_number.ilike.%${debouncedSearch}%,customer.company_name.ilike.%${debouncedSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading invoices:', error);
        setInvoices([]);
        return;
      }
      setInvoices((data as InvoiceRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, userBranchId, branchIdFilter, debouncedSearch]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const visibleInvoices = useMemo(() => {
    if (statusTab === 'all') return invoices;
    if (statusTab === 'overdue') return invoices.filter((i) => isInvoiceOverdue(i));
    return invoices.filter((i) => i.status === statusTab);
  }, [invoices, statusTab]);

  const summary = useMemo(() => {
    const totalsByCurrency: Record<string, number> = {};
    const paidByCurrency: Record<string, number> = {};
    let overdueCount = 0;
    let overdueTotal = 0;
    invoices.forEach((inv) => {
      if (inv.status === 'cancelled') return;
      totalsByCurrency[inv.currency] = (totalsByCurrency[inv.currency] ?? 0) + Number(inv.total);
      paidByCurrency[inv.currency] = (paidByCurrency[inv.currency] ?? 0) + Number(inv.amount_paid);
      if (isInvoiceOverdue(inv)) {
        overdueCount++;
        overdueTotal += Number(inv.total) - Number(inv.amount_paid);
      }
    });
    const currency = pickPrimaryCurrency(totalsByCurrency) ?? 'NGN';
    const total = totalsByCurrency[currency] ?? 0;
    const paid = paidByCurrency[currency] ?? 0;
    return {
      count: invoices.filter((i) => i.status !== 'cancelled').length,
      currency,
      total,
      paid,
      outstanding: total - paid,
      overdueCount,
      overdueTotal,
    };
  }, [invoices]);

  return (
    <div className="space-y-4 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-normal tracking-tight">
            <Receipt className="h-6 w-6 text-blue-600" />
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage and track all customer invoices.
          </p>
        </div>
        <Link href="/invoices/new" className="sm:shrink-0">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            New Invoice
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
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
            <StatTile label="Total Invoices" value={String(summary.count)} />
            <StatTile label="Total Amount" value={formatCurrency(summary.total, summary.currency)} />
            <StatTile label="Paid Amount" value={formatCurrency(summary.paid, summary.currency)} tone="text-green-600" />
            <StatTile
              label="Outstanding"
              value={formatCurrency(summary.outstanding, summary.currency)}
              tone={summary.outstanding > 0 ? 'text-amber-600' : undefined}
            />
          </>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              statusTab === tab.value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by invoice number or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={branchIdFilter} onValueChange={setBranchIdFilter}>
                <SelectTrigger className="w-[170px]">
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-base font-semibold">
            All Invoices
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({visibleInvoices.length})
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
          ) : visibleInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices found"
              message={
                debouncedSearch || statusTab !== 'all' || branchIdFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Get started by creating a new invoice.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Shipment</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleInvoices.map((inv) => {
                    const overdue = isInvoiceOverdue(inv);
                    const meta = INVOICE_STATUS_META[inv.status];
                    return (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer transition-colors hover:bg-accent/60"
                        onClick={() => router.push(`/invoices/${inv.id}`)}
                      >
                        <TableCell className="font-medium text-primary">
                          {inv.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">
                          {inv.customer?.company_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.shipment?.reference_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(inv.due_date)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(inv.total, inv.currency)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(inv.amount_paid, inv.currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(inv.total - inv.amount_paid, inv.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] ${overdue ? 'bg-red-100 text-red-700' : meta.color}`}
                          >
                            {overdue ? 'Overdue' : meta.label}
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

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1.5 font-serif text-xl font-normal tracking-tight', tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}
