'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Trophy,
  Target,
  FileText,
  Building2,
  CalendarDays,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QUOTATION_STATUS_META, formatCurrency } from '@/lib/utils/status';
import type { Branch, Quotation, QuotationStatus } from '@/types';

type QuotationRow = Quotation & {
  customer?: { id: string; company_name: string } | null;
  branch?: { id: string; name: string } | null;
};

interface AggRow {
  id: string;
  name: string;
  total: number;
  count: number;
}

const FUNNEL_STEPS: QuotationStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'accepted',
  'rejected',
  'expired',
];

export default function SalesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [branchIdFilter, setBranchIdFilter] = useState('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);

  // Load branches for admin filter
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .then(({ data }) => setBranches((data as Branch[]) ?? []));
  }, [isAdmin]);

  const effectiveBranchId = useMemo(() => {
    if (!isAdmin && userBranchId) return userBranchId;
    if (isAdmin && branchIdFilter !== 'all') return branchIdFilter;
    return null;
  }, [isAdmin, userBranchId, branchIdFilter]);

  const loadQuotations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('quotations')
        .select(
          '*, customer:customers(id, company_name), branch:branches(id, name)'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (effectiveBranchId) {
        query = query.eq('branch_id', effectiveBranchId);
      }
      if (fromDate) {
        query = query.gte('created_at', fromDate);
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setDate(endOfDay.getDate() + 1);
        query = query.lte('created_at', endOfDay.toISOString().split('T')[0]);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading sales data:', error);
        setQuotations([]);
        return;
      }
      setQuotations((data as QuotationRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, effectiveBranchId, fromDate, toDate]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  // --- Derived metrics -------------------------------------------------------

  // "Won" = customer accepted, not merely internally approved — approved
  // is now a pre-send gate (see migration 044), accepted is the terminal
  // won state.
  const won = useMemo(
    () => quotations.filter((q) => q.status === 'accepted'),
    [quotations]
  );

  const funnel = useMemo(() => {
    const counts: Record<QuotationStatus, number> = {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
      cancelled: 0,
      archived: 0,
    };
    quotations.forEach((q) => {
      counts[q.status] = (counts[q.status] ?? 0) + 1;
    });
    return counts;
  }, [quotations]);

  const revenueByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    won.forEach((q) => {
      totals[q.currency] = (totals[q.currency] ?? 0) + Number(q.total);
    });
    return totals;
  }, [won]);

  // The currency with the highest accepted revenue — used as the "primary"
  // currency for aggregates that need a single number (avg deal size,
  // monthly trend, top customers/branches). Avoids silently blending
  // incompatible currencies into one misleading total.
  const primaryCurrency = useMemo(() => {
    const currencies = Object.keys(revenueByCurrency);
    if (currencies.length === 0) return null;
    return currencies.reduce((a, b) =>
      revenueByCurrency[a] >= revenueByCurrency[b] ? a : b
    );
  }, [revenueByCurrency]);

  const hasMixedCurrencies = Object.keys(revenueByCurrency).length > 1;

  const wonPrimary = useMemo(
    () =>
      primaryCurrency
        ? won.filter((q) => q.currency === primaryCurrency)
        : [],
    [won, primaryCurrency]
  );

  const winRate = useMemo(() => {
    const decided = funnel.accepted + funnel.rejected + funnel.expired;
    if (decided === 0) return null;
    return (funnel.accepted / decided) * 100;
  }, [funnel]);

  const avgDealSize = useMemo(() => {
    if (!primaryCurrency || wonPrimary.length === 0) return null;
    const total = wonPrimary.reduce((sum, q) => sum + Number(q.total), 0);
    return total / wonPrimary.length;
  }, [wonPrimary, primaryCurrency]);

  // Monthly trend: accepted quotation value (primary currency) for the last 6 months
  const monthlyTrend = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
        total: 0,
      });
    }
    wonPrimary.forEach((q) => {
      const d = new Date(q.updated_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.total += Number(q.total);
    });
    return months;
  }, [wonPrimary]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, AggRow>();
    wonPrimary.forEach((q) => {
      const id = q.customer_id;
      const existing = map.get(id);
      if (existing) {
        existing.total += Number(q.total);
        existing.count += 1;
      } else {
        map.set(id, {
          id,
          name: q.customer?.company_name ?? 'Unknown',
          total: Number(q.total),
          count: 1,
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [wonPrimary]);

  const branchAgg = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, AggRow>();
    wonPrimary.forEach((q) => {
      const id = q.branch_id;
      const existing = map.get(id);
      if (existing) {
        existing.total += Number(q.total);
        existing.count += 1;
      } else {
        map.set(id, {
          id,
          name: q.branch?.name ?? 'Unknown',
          total: Number(q.total),
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [wonPrimary, isAdmin]);

  const maxFunnelCount = Math.max(
    ...FUNNEL_STEPS.map((s) => funnel[s]),
    1
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          Sales
        </h1>
        <p className="text-sm text-muted-foreground">
          Track sales performance from quotations across your organization.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:gap-6">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                From Date
              </Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate || undefined}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                To Date
              </Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined}
              />
            </div>
          </div>
          {isAdmin && (
            <div className="space-y-1.5 lg:w-[220px]">
              <Label className="text-xs font-medium text-muted-foreground">
                <Building2 className="mr-1 inline h-3.5 w-3.5" />
                Branch
              </Label>
              <Select value={branchIdFilter} onValueChange={setBranchIdFilter}>
                <SelectTrigger>
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

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted-foreground">
                    Approved Revenue
                  </p>
                  {Object.keys(revenueByCurrency).length === 0 ? (
                    <p className="text-2xl font-bold tracking-tight">—</p>
                  ) : (
                    <p className="text-xl font-bold tracking-tight">
                      {formatCurrency(
                        revenueByCurrency[primaryCurrency!],
                        primaryCurrency!
                      )}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600 ring-1 ring-green-100">
                  <Trophy className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold tracking-tight">
                    {winRate === null ? '—' : `${winRate.toFixed(0)}%`}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <Target className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Avg. Deal Size
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    {avgDealSize === null
                      ? '—'
                      : formatCurrency(avgDealSize, primaryCurrency!)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Accepted Deals
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    {won.length}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {hasMixedCurrencies && !loading && (
        <p className="text-xs text-muted-foreground">
          Showing amounts in {primaryCurrency} (your most common currency).
          Approved quotations in other currencies are counted in "Approved
          Deals" but excluded from the other figures above to avoid mixing
          currencies.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly trend chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Monthly Revenue Trend
            </CardTitle>
            <CardDescription>
              Approved quotation value over the last 6 months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : wonPrimary.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No accepted quotations yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--accent))' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [
                      formatCurrency(value, primaryCurrency ?? 'NGN'),
                      'Revenue',
                    ]}
                  />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Quotation funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Quotation Funnel
            </CardTitle>
            <CardDescription>All quotations in the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-3">
                {FUNNEL_STEPS.map((status) => {
                  const meta = QUOTATION_STATUS_META[status];
                  const count = funnel[status];
                  const width = (count / maxFunnelCount) * 100;
                  return (
                    <div key={status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top customers + branch breakdown */}
      <div
        className={`grid grid-cols-1 gap-6 ${isAdmin ? 'lg:grid-cols-2' : ''}`}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Top Customers
            </CardTitle>
            <CardDescription>
              Ranked by accepted quotation value.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topCustomers.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No accepted quotations yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Deals</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c) => (
                    <TableRow
                      key={c.id}
                      className="transition-colors hover:bg-accent/60"
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {c.count}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(c.total, primaryCurrency ?? 'NGN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Sales by Branch
              </CardTitle>
              <CardDescription>
                Approved quotation value per branch.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : branchAgg.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No accepted quotations yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-center">Deals</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchAgg.map((b) => (
                      <TableRow
                        key={b.id}
                        className="transition-colors hover:bg-accent/60"
                      >
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {b.count}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(b.total, primaryCurrency ?? 'NGN')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
