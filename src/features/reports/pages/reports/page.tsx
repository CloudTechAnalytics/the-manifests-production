'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Users,
  Package,
  FileText,
  Activity as ActivityIcon,
  Download,
  Printer,
  CalendarDays,
  Building2,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Plane,
  Ship,
  Truck,
  Train,
  Waypoints,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { toast } from 'sonner';
import {
  SHIPMENT_STATUS_META,
  QUOTATION_STATUS_META,
  CUSTOMER_STATUS_META,
  formatDate,
  formatDateTime,
  formatCurrency,
} from '@/shared/lib/utils/status';
import {
  fetchActivitiesReport,
  fetchBranchesForReports,
  fetchCustomersReport,
  fetchProfitabilityReport,
  fetchQuotationsReport,
  fetchShipmentsReport,
  type ActivityReportRow,
  type CustomerReportRow,
  type ProfitabilityRow,
  type QuotationReportRow,
  type ShipmentReportRow,
} from '@/features/reports/services/reports.service';
import type {
  CustomerStatus,
  QuotationStatus,
  ShipmentStatus,
  ShipmentType,
} from '@/shared/types';

// ---------------------------------------------------------------------------
// Types for report rows (joined with related data)
// ---------------------------------------------------------------------------

type ReportTab = 'customers' | 'shipments' | 'quotations' | 'operations' | 'profitability';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  air: 'Air',
  sea: 'Sea',
  road: 'Road',
  rail: 'Rail',
  multimodal: 'Multimodal',
};

const SHIPMENT_TYPE_ICONS: Record<
  ShipmentType,
  React.ComponentType<{ className?: string }>
> = {
  air: Plane,
  sea: Ship,
  road: Truck,
  rail: Train,
  multimodal: Waypoints,
};

const TAB_META: Record<
  ReportTab,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  customers: { label: 'Customer Reports', icon: Users },
  shipments: { label: 'Shipment Reports', icon: Package },
  quotations: { label: 'Quotation Reports', icon: FileText },
  operations: { label: 'Operations Reports', icon: ActivityIcon },
  profitability: { label: 'Profitability', icon: TrendingUp },
};

// ---------------------------------------------------------------------------
// CSV Export utility
// ---------------------------------------------------------------------------

/**
 * Escapes a single CSV cell value.
 * Wraps in double quotes if the value contains commas, quotes, or newlines,
 * and doubles any embedded double quotes per RFC 4180.
 */
function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a CSV string from column headers and row data, creates a Blob
 * with the `application/vnd.ms-excel` MIME type for Excel compatibility,
 * and triggers a browser download.
 */
function exportToCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string
): void {
  const csvLines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    csvLines.push(row.map(escapeCsvCell).join(','));
  }
  // Prepend BOM so Excel reads UTF-8 correctly
  const csvContent = '\uFEFF' + csvLines.join('\r\n');

  const blob = new Blob([csvContent], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Small reusable UI helpers
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

function SummaryCard({ label, value, icon: Icon, color }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}

function EmptyState({ icon: Icon, title, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
        <Icon className="h-7 w-7 text-blue-500" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const [activeTab, setActiveTab] = useState<ReportTab>('customers');

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [branchIdFilter, setBranchIdFilter] = useState<string>('all');

  // Determine effective branch filter
  const effectiveBranchId = useMemo(() => {
    if (!isAdmin && userBranchId) return userBranchId;
    if (isAdmin && branchIdFilter !== 'all') return branchIdFilter;
    return null; // admin with "all branches" selected
  }, [isAdmin, userBranchId, branchIdFilter]);

  const filters = useMemo(
    () => ({ branchId: effectiveBranchId, fromDate, toDate }),
    [effectiveBranchId, fromDate, toDate]
  );

  const { data: branches = [] } = useQuery({
    queryKey: ['report-branches'],
    queryFn: fetchBranchesForReports,
    enabled: isAdmin,
  });

  // Each report is fetched only while its own tab is the active one, not
  // all five unconditionally on every mount/filter change — `enabled`
  // reproduces the previous "load just the visible tab" behavior, and a
  // filter change while sitting on a tab still refetches it (filters are
  // part of the query key).
  const customersQuery = useQuery({
    queryKey: ['reports', 'customers', filters],
    queryFn: () => fetchCustomersReport(filters),
    enabled: !!profile && activeTab === 'customers',
  });
  const shipmentsQuery = useQuery({
    queryKey: ['reports', 'shipments', filters],
    queryFn: () => fetchShipmentsReport(filters),
    enabled: !!profile && activeTab === 'shipments',
  });
  const quotationsQuery = useQuery({
    queryKey: ['reports', 'quotations', filters],
    queryFn: () => fetchQuotationsReport(filters),
    enabled: !!profile && activeTab === 'quotations',
  });
  const activitiesQuery = useQuery({
    queryKey: ['reports', 'activities', filters],
    queryFn: () => fetchActivitiesReport(filters),
    enabled: !!profile && activeTab === 'operations',
  });
  const profitabilityQuery = useQuery({
    queryKey: ['reports', 'profitability', filters],
    queryFn: () => fetchProfitabilityReport(filters),
    enabled: !!profile && activeTab === 'profitability',
  });

  const customers = customersQuery.data ?? [];
  const shipments = shipmentsQuery.data ?? [];
  const quotations = quotationsQuery.data ?? [];
  const activities = activitiesQuery.data ?? [];
  const profitability = profitabilityQuery.data ?? [];

  const loading =
    (activeTab === 'customers' && customersQuery.isLoading) ||
    (activeTab === 'shipments' && shipmentsQuery.isLoading) ||
    (activeTab === 'quotations' && quotationsQuery.isLoading) ||
    (activeTab === 'operations' && activitiesQuery.isLoading) ||
    (activeTab === 'profitability' && profitabilityQuery.isLoading);

  // -------------------------------------------------------------------------
  // Derived / computed values for summaries
  // -------------------------------------------------------------------------

  const customerSummary = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === 'active').length;
    const inactive = customers.filter((c) => c.status === 'inactive').length;
    const blacklisted = customers.filter((c) => c.status === 'blacklisted').length;
    return { total, active, inactive, blacklisted };
  }, [customers]);

  const shipmentSummary = useMemo(() => {
    const total = shipments.length;
    const byStatus: Record<string, number> = {};
    let totalWeight = 0;
    shipments.forEach((s) => {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      if (s.weight != null) totalWeight += Number(s.weight);
    });
    return { total, byStatus, totalWeight };
  }, [shipments]);

  const quotationSummary = useMemo(() => {
    const total = quotations.length;
    const byStatus: Record<string, number> = {};
    let totalValue = 0;
    quotations.forEach((q) => {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      totalValue += Number(q.total);
    });
    return { total, byStatus, totalValue };
  }, [quotations]);

  const operationsSummary = useMemo(() => {
    const total = activities.length;
    const byType: Record<string, number> = {};
    activities.forEach((a) => {
      const key = a.action || 'unknown';
      byType[key] = (byType[key] ?? 0) + 1;
    });
    return { total, byType };
  }, [activities]);

  const profitabilitySummary = useMemo(() => {
    const totalRevenue = profitability.reduce((sum, p) => sum + p.revenue, 0);
    const totalCost = profitability.reduce((sum, p) => sum + p.cost, 0);
    const totalMargin = totalRevenue - totalCost;
    const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    return { count: profitability.length, totalRevenue, totalCost, totalMargin, marginPct };
  }, [profitability]);

  // -------------------------------------------------------------------------
  // Export handlers
  // -------------------------------------------------------------------------

  const handleExportCsv = useCallback(() => {
    const dateStr = new Date().toISOString().split('T')[0];

    if (activeTab === 'customers') {
      const headers = [
        'Company Name',
        'Type',
        'Email',
        'Phone',
        'City',
        'Status',
        '# Shipments',
        '# Quotations',
        'Date Created',
      ];
      const rows = customers.map((c) => [
        c.company_name,
        c.type,
        c.email ?? '',
        c.phone ?? '',
        c.city ?? '',
        CUSTOMER_STATUS_META[c.status]?.label ?? c.status,
        c.shipment_count ?? 0,
        c.quotation_count ?? 0,
        formatDate(c.created_at),
      ]);
      exportToCsv(headers, rows, `customer-report_${dateStr}.csv`);
    } else if (activeTab === 'shipments') {
      const headers = [
        'Reference',
        'Customer',
        'Type',
        'Origin',
        'Destination',
        'Status',
        'Weight (kg)',
        'Volume (CBM)',
        'Booking Date',
      ];
      const rows = shipments.map((s) => [
        s.reference_number ?? '',
        s.customer?.company_name ?? '',
        s.shipment_type ? SHIPMENT_TYPE_LABELS[s.shipment_type] ?? s.shipment_type : '',
        s.origin ?? '',
        s.destination ?? '',
        SHIPMENT_STATUS_META[s.status]?.label ?? s.status,
        s.weight ?? '',
        s.volume ?? '',
        formatDate(s.booking_date),
      ]);
      exportToCsv(headers, rows, `shipment-report_${dateStr}.csv`);
    } else if (activeTab === 'quotations') {
      const headers = [
        'Quotation Number',
        'Customer',
        'Status',
        'Total',
        'Currency',
        'Valid Until',
        'Created',
      ];
      const rows = quotations.map((q) => [
        q.quotation_number ?? '',
        q.customer?.company_name ?? '',
        QUOTATION_STATUS_META[q.status]?.label ?? q.status,
        q.total,
        q.currency,
        formatDate(q.valid_until),
        formatDate(q.created_at),
      ]);
      exportToCsv(headers, rows, `quotation-report_${dateStr}.csv`);
    } else if (activeTab === 'operations') {
      const headers = ['Date', 'Activity', 'User', 'Description'];
      const rows = activities.map((a) => [
        formatDateTime(a.created_at),
        a.action,
        a.userName,
        a.description,
      ]);
      exportToCsv(headers, rows, `operations-report_${dateStr}.csv`);
    } else {
      const headers = ['Shipment', 'Customer', 'Status', 'Revenue', 'Cost', 'Margin', 'Currency'];
      const rows = profitability.map((p) => [
        p.reference_number ?? '',
        p.customer_name,
        SHIPMENT_STATUS_META[p.status]?.label ?? p.status,
        p.revenue,
        p.cost,
        p.margin,
        p.currency,
      ]);
      exportToCsv(headers, rows, `profitability-report_${dateStr}.csv`);
    }

    toast.success('Excel export downloaded successfully.');
  }, [activeTab, customers, shipments, quotations, activities, profitability]);

  const handleExportPdf = useCallback(() => {
    toast.info('Preparing print dialog…');
    // Small timeout so the toast is visible before the print dialog blocks
    setTimeout(() => window.print(), 300);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate and export reports across your freight operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="flex-1 sm:flex-none">
            <Printer className="mr-1.5 h-4 w-4" />
            Export PDF
          </Button>
          <Button size="sm" onClick={handleExportCsv} className="flex-1 sm:flex-none">
            <Download className="mr-1.5 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Print-only header (visible only when printing) */}
      <div className="hidden print-only">
        <h1 className="text-xl font-bold">The Manifest — Reports</h1>
        <p className="text-sm text-gray-600">
          {TAB_META[activeTab].label} · Generated{' '}
          {formatDateTime(new Date().toISOString())}
          {effectiveBranchId
            ? ` · Branch: ${branches.find((b) => b.id === effectiveBranchId)?.name ?? '—'}`
            : ' · All Branches'}
          {fromDate && ` · From: ${formatDate(fromDate)}`}
          {toDate && ` · To: ${formatDate(toDate)}`}
        </p>
      </div>

      {/* Filters */}
      <Card className="no-print">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Filter className="h-4 w-4 text-blue-600" />
            Filters
          </CardTitle>
          <CardDescription>
            Apply date range and branch filters to all report types.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-6">
            {/* Date Range */}
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
                  className="w-full"
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
                  className="w-full"
                />
              </div>
            </div>

            {/* Branch Filter (admin only) */}
            {isAdmin && (
              <div className="space-y-1.5 lg:w-[220px]">
                <Label className="text-xs font-medium text-muted-foreground">
                  <Building2 className="mr-1 inline h-3.5 w-3.5" />
                  Branch
                </Label>
                <Select
                  value={branchIdFilter}
                  onValueChange={(v) => setBranchIdFilter(v)}
                >
                  <SelectTrigger className="w-full">
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

            {/* Clear Filters */}
            {(fromDate || toDate || branchIdFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setBranchIdFilter('all');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ReportTab)}
      >
        <TabsList className="no-print grid w-full grid-cols-2 lg:grid-cols-5">
          {(Object.keys(TAB_META) as ReportTab[]).map((tab) => {
            const meta = TAB_META[tab];
            const Icon = meta.icon;
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                className="flex items-center gap-1.5"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{meta.label}</span>
                <span className="sm:hidden">
                  {tab === 'operations'
                    ? 'Ops'
                    : tab === 'profitability'
                      ? 'Margin'
                      : tab.charAt(0).toUpperCase() + tab.slice(1, -1)}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ===================== Customer Reports ===================== */}
        <TabsContent value="customers" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-14 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <SummaryCard
                  label="Total Customers"
                  value={customerSummary.total}
                  icon={Users}
                  color="bg-blue-50 text-blue-600"
                />
                <SummaryCard
                  label="Active"
                  value={customerSummary.active}
                  icon={CheckCircle2}
                  color="bg-green-50 text-green-600"
                />
                <SummaryCard
                  label="Inactive"
                  value={customerSummary.inactive + customerSummary.blacklisted}
                  icon={XCircle}
                  color="bg-gray-100 text-gray-600"
                />
              </>
            )}
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="text-lg font-semibold">
                Customer Report
                {!loading && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({customers.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton />
              ) : customers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No customers found"
                  message="Try adjusting your date range or branch filter."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center"># Shipments</TableHead>
                        <TableHead className="text-center"># Quotations</TableHead>
                        <TableHead>Date Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((c) => {
                        const meta = CUSTOMER_STATUS_META[c.status] ?? {
                          label: c.status ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                        };
                        return (
                          <TableRow key={c.id} className="transition-colors hover:bg-accent/60">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <span className="truncate">{c.company_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="capitalize text-muted-foreground">
                                {c.type}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {c.email ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {c.phone ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {c.city ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-[11px] ${meta.color}`}
                              >
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {c.shipment_count ?? 0}
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {c.quotation_count ?? 0}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(c.created_at)}
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
        </TabsContent>

        {/* ===================== Shipment Reports ===================== */}
        <TabsContent value="shipments" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-14 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <SummaryCard
                  label="Total Shipments"
                  value={shipmentSummary.total}
                  icon={Package}
                  color="bg-blue-50 text-blue-600"
                />
                <SummaryCard
                  label="In Transit"
                  value={shipmentSummary.byStatus['in_transit'] ?? 0}
                  icon={Waypoints}
                  color="bg-cyan-50 text-cyan-600"
                />
                <SummaryCard
                  label="Delivered"
                  value={shipmentSummary.byStatus['delivered'] ?? 0}
                  icon={CheckCircle2}
                  color="bg-green-50 text-green-600"
                />
                <SummaryCard
                  label="Total Weight (kg)"
                  value={shipmentSummary.totalWeight.toLocaleString('en-GB', {
                    maximumFractionDigits: 2,
                  })}
                  icon={TrendingUp}
                  color="bg-amber-50 text-amber-600"
                />
              </>
            )}
          </div>

          {/* Status Breakdown Bar */}
          {!loading && shipments.length > 0 && (
            <Card className="no-print">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(shipmentSummary.byStatus).map(([status, count]) => {
                    const meta = SHIPMENT_STATUS_META[status as ShipmentStatus] ?? {
                      label: status ?? 'Unknown',
                      color: 'bg-muted text-muted-foreground',
                      step: -1,
                    };
                    if (!meta) return null;
                    return (
                      <Badge
                        key={status}
                        variant="secondary"
                        className={`text-[11px] ${meta.color}`}
                      >
                        {meta.label}: {count}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="text-lg font-semibold">
                Shipment Report
                {!loading && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({shipments.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton />
              ) : shipments.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No shipments found"
                  message="Try adjusting your date range or branch filter."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Origin</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Weight (kg)</TableHead>
                        <TableHead className="text-right">Volume (CBM)</TableHead>
                        <TableHead>Booking Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipments.map((s) => {
                        const meta = SHIPMENT_STATUS_META[s.status] ?? {
                          label: s.status ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                          step: -1,
                        };
                        const TypeIcon = s.shipment_type
                          ? SHIPMENT_TYPE_ICONS[s.shipment_type]
                          : null;
                        return (
                          <TableRow key={s.id} className="transition-colors hover:bg-accent/60">
                            <TableCell className="font-medium">
                              {s.reference_number ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {s.customer?.company_name ?? '—'}
                            </TableCell>
                            <TableCell>
                              {s.shipment_type && TypeIcon ? (
                                <div className="flex items-center gap-1.5">
                                  <TypeIcon className="h-4 w-4 text-blue-500" />
                                  <span className="text-muted-foreground">
                                    {SHIPMENT_TYPE_LABELS[s.shipment_type] ?? s.shipment_type}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {s.origin ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {s.destination ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-[11px] ${meta.color}`}
                              >
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {s.weight != null
                                ? Number(s.weight).toLocaleString('en-GB', {
                                    maximumFractionDigits: 2,
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {s.volume != null
                                ? Number(s.volume).toLocaleString('en-GB', {
                                    maximumFractionDigits: 2,
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(s.booking_date)}
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
        </TabsContent>

        {/* ===================== Quotation Reports ===================== */}
        <TabsContent value="quotations" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-14 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <SummaryCard
                  label="Total Quotations"
                  value={quotationSummary.total}
                  icon={FileText}
                  color="bg-blue-50 text-blue-600"
                />
                <SummaryCard
                  label="Accepted"
                  value={quotationSummary.byStatus['accepted'] ?? 0}
                  icon={CheckCircle2}
                  color="bg-green-50 text-green-600"
                />
                <SummaryCard
                  label="Pending"
                  value={
                    (quotationSummary.byStatus['draft'] ?? 0) +
                    (quotationSummary.byStatus['pending_approval'] ?? 0) +
                    (quotationSummary.byStatus['approved'] ?? 0) +
                    (quotationSummary.byStatus['sent'] ?? 0)
                  }
                  icon={TrendingUp}
                  color="bg-amber-50 text-amber-600"
                />
                <SummaryCard
                  label="Total Value"
                  value={formatCurrency(quotationSummary.totalValue)}
                  icon={TrendingUp}
                  color="bg-blue-50 text-blue-600"
                />
              </>
            )}
          </div>

          {/* Status Breakdown */}
          {!loading && quotations.length > 0 && (
            <Card className="no-print">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(quotationSummary.byStatus).map(
                    ([status, count]) => {
                      const meta =
                        QUOTATION_STATUS_META[status as QuotationStatus];
                      if (!meta) return null;
                      return (
                        <Badge
                          key={status}
                          variant="secondary"
                          className={`text-[11px] ${meta.color}`}
                        >
                          {meta.label}: {count}
                        </Badge>
                      );
                    }
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="text-lg font-semibold">
                Quotation Report
                {!loading && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({quotations.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton />
              ) : quotations.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No quotations found"
                  message="Try adjusting your date range or branch filter."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quotation Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Valid Until</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotations.map((q) => {
                        const meta = QUOTATION_STATUS_META[q.status] ?? {
                          label: q.status ?? 'Unknown',
                          color: 'bg-muted text-muted-foreground',
                        };
                        return (
                          <TableRow key={q.id} className="transition-colors hover:bg-accent/60">
                            <TableCell className="font-medium">
                              {q.quotation_number ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {q.customer?.company_name ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-[11px] ${meta.color}`}
                              >
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(q.total, q.currency)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {q.currency}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(q.valid_until)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(q.created_at)}
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
        </TabsContent>

        {/* ===================== Operations Reports ===================== */}
        <TabsContent value="operations" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-14 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <SummaryCard
                  label="Total Activities"
                  value={operationsSummary.total}
                  icon={ActivityIcon}
                  color="bg-blue-50 text-blue-600"
                />
                <SummaryCard
                  label="Unique Activity Types"
                  value={Object.keys(operationsSummary.byType).length}
                  icon={Filter}
                  color="bg-purple-50 text-purple-600"
                />
                <SummaryCard
                  label="Date Range"
                  value={
                    fromDate || toDate
                      ? `${fromDate ? formatDate(fromDate) : '—'} → ${toDate ? formatDate(toDate) : '—'}`
                      : 'All Time'
                  }
                  icon={CalendarDays}
                  color="bg-cyan-50 text-cyan-600"
                />
              </>
            )}
          </div>

          {/* Activity Type Breakdown */}
          {!loading && activities.length > 0 && (
            <Card className="no-print">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Activities by Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(operationsSummary.byType).map(
                    ([action, count]) => (
                      <Badge
                        key={action}
                        variant="secondary"
                        className="text-[11px] bg-blue-50 text-blue-700"
                      >
                        {action}: {count}
                      </Badge>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader className="no-print">
              <CardTitle className="text-lg font-semibold">
                Operations Report
                {!loading && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({activities.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton />
              ) : activities.length === 0 ? (
                <EmptyState
                  icon={ActivityIcon}
                  title="No activities found"
                  message="Try adjusting your date range or branch filter."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((a) => (
                        <TableRow key={a.id} className="transition-colors hover:bg-accent/60">
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(a.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="text-[11px] bg-blue-50 text-blue-700"
                            >
                              {a.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {a.userName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {a.description}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== Profitability Reports ===================== */}
        <TabsContent value="profitability" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              label="Shipments Billed"
              value={profitabilitySummary.count}
              icon={Package}
              color="bg-blue-50 text-blue-600"
            />
            <SummaryCard
              label="Total Revenue"
              value={formatCurrency(profitabilitySummary.totalRevenue, 'NGN')}
              icon={TrendingUp}
              color="bg-emerald-50 text-emerald-600"
            />
            <SummaryCard
              label="Total Cost"
              value={formatCurrency(profitabilitySummary.totalCost, 'NGN')}
              icon={XCircle}
              color="bg-amber-50 text-amber-600"
            />
            <SummaryCard
              label="Margin"
              value={`${formatCurrency(profitabilitySummary.totalMargin, 'NGN')} (${profitabilitySummary.marginPct.toFixed(1)}%)`}
              icon={CheckCircle2}
              color={profitabilitySummary.totalMargin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profitability by Shipment</CardTitle>
              <CardDescription>
                Revenue is billed invoice totals; cost is approved expenses plus customs duty.
                Only shipments with at least one invoice or cost are shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton />
              ) : profitability.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No billed shipments yet"
                  message="Profitability appears once a shipment has an invoice or a cost recorded against it."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shipment</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profitability.map((p) => (
                        <TableRow key={p.id} className="transition-colors hover:bg-accent/60">
                          <TableCell className="font-medium">{p.reference_number ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{p.customer_name}</TableCell>
                          <TableCell>
                            <Badge className={SHIPMENT_STATUS_META[p.status]?.color}>
                              {SHIPMENT_STATUS_META[p.status]?.label ?? p.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(p.revenue, p.currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.cost, p.currency)}</TableCell>
                          <TableCell className="text-right">
                            <span className={p.margin >= 0 ? 'text-emerald-700' : 'text-destructive'}>
                              {formatCurrency(p.margin, p.currency)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
