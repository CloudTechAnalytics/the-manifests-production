'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Receipt, Plus, Search, Filter, Loader2 } from 'lucide-react';
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
  INVOICE_STATUS_META,
  isInvoiceOverdue,
  formatCurrency,
  formatDate,
  pickPrimaryCurrency,
} from '@/lib/utils/status';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportColumn } from '@/lib/export';
import type { Invoice, InvoiceStatus, Branch } from '@/types';
import { cn } from '@/lib/utils';

type InvoiceRow = Invoice & {
  customer?: { id: string; company_name: string } | null;
  shipment?: { id: string; reference_number: string | null } | null;
};

const INVOICE_EXPORT_COLUMNS: ExportColumn<InvoiceRow>[] = [
  { header: 'Number', value: (i) => i.invoice_number },
  { header: 'Customer', value: (i) => i.customer?.company_name ?? '' },
  { header: 'Shipment', value: (i) => i.shipment?.reference_number ?? '' },
  { header: 'Status', value: (i) => i.status },
  { header: 'Issue Date', value: (i) => i.issue_date },
  { header: 'Due Date', value: (i) => i.due_date },
  { header: 'Subtotal', value: (i) => i.subtotal },
  { header: 'Tax', value: (i) => i.tax_amount },
  { header: 'Total', value: (i) => i.total },
  { header: 'Amount Paid', value: (i) => i.amount_paid },
  { header: 'Balance', value: (i) => i.total - i.amount_paid },
  { header: 'Currency', value: (i) => i.currency },
  { header: 'Created', value: (i) => i.created_at },
];

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

  const [branches, setBranches] = useState<Branch[]>([]);
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

  // Shared branch/search scoping — reused by the list query (below, with
  // statusTab + ordering layered on), the summary query, and export.
  // statusTab is deliberately NOT part of this base: the summary tiles
  // report every non-cancelled invoice regardless of which tab is open,
  // matching the pre-pagination behavior (the old client-side `summary`
  // useMemo ran over the full, not tab-filtered, invoices array).
  const applyInvoiceScope = useCallback(
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
      if (debouncedSearch) {
        const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
        q = q.or(`invoice_number.ilike.%${sanitized}%,customer.company_name.ilike.%${sanitized}%`);
      }
      return q;
    },
    [isAdmin, userBranchId, branchIdFilter, debouncedSearch, branches]
  );

  const buildInvoicesListQuery = useCallback(() => {
    let query = applyInvoiceScope(
      supabase
        .from('invoices')
        .select('*, customer:customers(id, company_name), shipment:shipments(id, reference_number)')
        .is('deleted_at', null)
    ).order('created_at', { ascending: false });

    const today = new Date().toISOString().split('T')[0];
    if (statusTab === 'overdue') {
      // Mirrors isInvoiceOverdue()'s exact definition, server-side.
      query = query.in('status', ['sent', 'partial']).lt('due_date', today);
    } else if (statusTab !== 'all') {
      query = query.eq('status', statusTab);
    }
    return query;
  }, [applyInvoiceScope, statusTab]);

  const fetchInvoicesPage = useCallback(
    async (offset: number, limit: number): Promise<InvoiceRow[]> => {
      if (!profile) return [];
      const { data, error } = await buildInvoicesListQuery().range(offset, offset + limit - 1);
      if (error) {
        console.error('Error loading invoices:', error);
        return [];
      }
      return (data as InvoiceRow[]) ?? [];
    },
    [profile, buildInvoicesListQuery]
  );

  const { rows: invoices, loading, loadingMore, hasMore, loadMore } =
    usePaginatedList<InvoiceRow>(fetchInvoicesPage);

  const fetchAllInvoicesForExport = useCallback(async (): Promise<InvoiceRow[]> => {
    const { data, error } = await buildInvoicesListQuery();
    if (error) throw error;
    return (data as InvoiceRow[]) ?? [];
  }, [buildInvoicesListQuery]);

  // Summary tiles: their own lightweight (no embeds beyond what search
  // needs, no pagination) query, decoupled from the paginated display
  // rows above — pagination must never silently make a financial total
  // wrong by only summing whatever page happens to be loaded.
  const [summary, setSummary] = useState({
    count: 0,
    currency: 'NGN',
    total: 0,
    paid: 0,
    outstanding: 0,
    overdueCount: 0,
    overdueTotal: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setSummaryLoading(true);
    (async () => {
      const { data, error } = await applyInvoiceScope(
        supabase
          .from('invoices')
          .select('status, total, amount_paid, currency, due_date, customer:customers(company_name)')
          .is('deleted_at', null)
      );
      if (cancelled) return;
      if (error) {
        console.error('Error loading invoice summary:', error);
        setSummaryLoading(false);
        return;
      }
      const rows = (data ?? []) as Pick<Invoice, 'status' | 'total' | 'amount_paid' | 'currency' | 'due_date'>[];
      const totalsByCurrency: Record<string, number> = {};
      const paidByCurrency: Record<string, number> = {};
      let overdueCount = 0;
      let overdueTotal = 0;
      rows.forEach((inv) => {
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
      setSummary({
        count: rows.filter((i) => i.status !== 'cancelled').length,
        currency,
        total,
        paid,
        outstanding: total - paid,
        overdueCount,
        overdueTotal,
      });
      setSummaryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, applyInvoiceScope]);

  return (
    <div className="space-y-4 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Receipt className="h-6 w-6 text-blue-600" />
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage and track all customer invoices.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <ExportButton
            fetchData={fetchAllInvoicesForExport}
            columns={INVOICE_EXPORT_COLUMNS}
            filename="invoices"
          />
          <Link href="/invoices/new">
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
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
          <CardTitle className="text-lg font-semibold">
            All Invoices
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({invoices.length}
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
          ) : invoices.length === 0 ? (
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
                  {invoices.map((inv) => {
                    const overdue = isInvoiceOverdue(inv);
                    const meta = INVOICE_STATUS_META[inv.status] ?? {
                      label: inv.status ?? 'Unknown',
                      color: 'bg-muted text-muted-foreground',
                    };
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
        <p className={cn('mt-1.5 text-xl font-bold tracking-tight', tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}
