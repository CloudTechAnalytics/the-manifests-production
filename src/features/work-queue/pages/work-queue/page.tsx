'use client';

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  FileClock,
  Landmark,
  Building2,
  FileCheck2,
  Receipt,
  Truck,
  PackageCheck,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { ConvertToShipmentDialog } from '@/features/quotations/components/convert-to-shipment-dialog';
import { formatDate, formatCurrency } from '@/shared/lib/utils/status';
import { fetchWorkQueueData } from '@/features/work-queue/services/work-queue.service';
import type { Quotation } from '@/shared/types';

/*
 * Work Queue — the operational homepage. Where the dashboard shows how
 * things are trending, this shows what actually needs a hand right now:
 * one section per kind of outstanding work, each row a real record that
 * goes straight to it, not a chart.
 *
 * Every section fetches a small, capped list (8 rows) for display plus
 * its own count — one parallel batch, not ten sequential round-trips —
 * and links to the matching filtered list page for anything past that
 * cap. Branch-scoped the same way the dashboard and notifications are:
 * admin/branch_manager see the whole org, everyone else their own branch.
 */

interface QueueRow {
  id: string;
  primary: string;
  secondary: string;
  meta: string;
  href: string;
  /** Only the Awaiting Operations row uses this — a "Start Shipment"
   *  action instead of relying on the reader to click through first. */
  startShipmentQuotation?: Quotation;
}

interface QueueSection {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  rows: QueueRow[];
  count: number;
  viewAllHref: string;
}

export default function WorkQueuePage() {
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null);
  const canConvert = hasRole('admin') || hasRole('branch_manager') || hasRole('operations');

  const isAdmin = profile?.role === 'admin';
  const seesWholeOrg = isAdmin || hasRole('branch_manager');
  const branchFilter = seesWholeOrg ? null : profile?.branch_id ?? null;

  const { data, isLoading: loading } = useQuery({
    queryKey: ['work-queue', branchFilter],
    queryFn: () => fetchWorkQueueData(branchFilter),
    enabled: !!profile,
  });

  const load = () => {
    queryClient.invalidateQueries({ queryKey: ['work-queue', branchFilter] });
  };

  const sections: QueueSection[] = useMemo(() => {
    if (!data) return [];
    const { docs, customs, paar, terminal, quotations, awaitingOps, invoices, truck, readyRows, urgentRows, overdue } =
      data;

    return [
      {
        key: 'awaiting_operations',
        label: 'Awaiting Operations',
        description: 'Accepted quotations ready to become a shipment',
        icon: ArrowRightLeft,
        color: 'bg-primary/10 text-primary',
        count: awaitingOps.count ?? 0,
        viewAllHref: '/quotations?status=accepted',
        rows: awaitingOps.data.map((q) => ({
          id: q.id,
          primary: q.customer?.company_name ?? 'Unknown customer',
          secondary: q.quotation_number ?? 'Quotation',
          meta: '',
          href: `/quotations/${q.id}`,
          startShipmentQuotation: canConvert ? q : undefined,
        })),
      },
      {
        key: 'documentation',
        label: 'Awaiting Documentation',
        description: 'Shipments that need paperwork before they can move on',
        icon: FileClock,
        color: 'bg-amber-50 text-amber-600',
        count: docs.count ?? 0,
        viewAllHref: '/shipments?status=documentation',
        rows: docs.data.map((s) => ({
          id: s.id,
          primary: s.reference_number ?? 'Shipment',
          secondary: s.customer?.company_name ?? 'Unknown customer',
          meta: s.estimated_departure ? `ETD ${formatDate(s.estimated_departure)}` : '',
          href: `/shipments/${s.id}`,
        })),
      },
      {
        key: 'customs',
        label: 'Awaiting Customs Processing',
        description: 'Declarations not yet released',
        icon: Landmark,
        color: 'bg-blue-50 text-blue-600',
        count: customs.count ?? 0,
        viewAllHref: '/customs',
        rows: customs.data
          .filter((r) => r.shipment)
          .map((r) => ({
            id: r.id,
            primary: r.shipment!.reference_number ?? 'Shipment',
            secondary: r.shipment!.customer?.company_name ?? 'Unknown customer',
            meta: r.status.replace(/_/g, ' '),
            href: `/shipments/${r.shipment!.id}`,
          })),
      },
      {
        key: 'paar',
        label: 'Awaiting PAAR',
        description: 'No customs declaration filed yet',
        icon: FileCheck2,
        color: 'bg-purple-50 text-purple-600',
        count: paar.count ?? 0,
        viewAllHref: '/customs',
        rows: paar.data
          .filter((r) => r.shipment)
          .map((r) => ({
            id: r.id,
            primary: r.shipment!.reference_number ?? 'Shipment',
            secondary: r.shipment!.customer?.company_name ?? 'Unknown customer',
            meta: '',
            href: `/shipments/${r.shipment!.id}`,
          })),
      },
      {
        key: 'terminal',
        label: 'Awaiting Terminal Release',
        description: 'Containers not yet released from the terminal',
        icon: Building2,
        color: 'bg-cyan-50 text-cyan-600',
        count: terminal.count ?? 0,
        viewAllHref: '/terminal',
        rows: terminal.data
          .filter((r) => r.shipment)
          .map((r) => ({
            id: r.id,
            primary: r.shipment!.reference_number ?? 'Shipment',
            secondary: r.shipment!.customer?.company_name ?? 'Unknown customer',
            meta: r.status.replace(/_/g, ' '),
            href: `/shipments/${r.shipment!.id}`,
          })),
      },
      {
        key: 'quotations',
        label: 'Pending Customer Approval',
        description: 'Quotations sent, awaiting the customer’s decision',
        icon: ClipboardList,
        color: 'bg-indigo-50 text-indigo-600',
        count: quotations.count ?? 0,
        viewAllHref: '/quotations?status=sent',
        rows: quotations.data.map((q) => ({
          id: q.id,
          primary: q.quotation_number ?? 'Quotation',
          secondary: q.customer?.company_name ?? 'Unknown customer',
          meta: formatCurrency(q.total, q.currency),
          href: `/quotations/${q.id}`,
        })),
      },
      {
        key: 'invoices',
        label: 'Awaiting Invoice Payment',
        description: 'Sent or partially paid invoices',
        icon: Receipt,
        color: 'bg-emerald-50 text-emerald-600',
        count: invoices.count ?? 0,
        viewAllHref: '/invoices?status=sent',
        rows: invoices.data.map((inv) => ({
          id: inv.id,
          primary: inv.invoice_number ?? 'Invoice',
          secondary: inv.customer?.company_name ?? 'Unknown customer',
          meta: [formatCurrency(inv.total, inv.currency), inv.due_date ? `due ${formatDate(inv.due_date)}` : null]
            .filter(Boolean)
            .join(' · '),
          href: `/invoices/${inv.id}`,
        })),
      },
      {
        key: 'truck',
        label: 'Truck Assignment Required',
        description: 'Arrived shipments with no transport leg yet',
        icon: Truck,
        color: 'bg-orange-50 text-orange-600',
        count: truck.count ?? 0,
        viewAllHref: '/transportation',
        rows: truck.data.map((s) => ({
          id: s.id,
          primary: s.reference_number ?? 'Shipment',
          secondary: s.customer?.company_name ?? 'Unknown customer',
          meta: s.estimated_arrival ? `Arrived ${formatDate(s.estimated_arrival)}` : '',
          href: `/shipments/${s.id}`,
        })),
      },
      {
        key: 'ready',
        label: 'Containers Ready for Delivery',
        description: 'Released from terminal, not yet in transit',
        icon: PackageCheck,
        color: 'bg-teal-50 text-teal-600',
        count: readyRows.length,
        viewAllHref: '/transportation',
        rows: readyRows.map((r) => ({
          id: r.id,
          primary: r.shipment.reference_number ?? 'Shipment',
          secondary: r.shipment.customer?.company_name ?? 'Unknown customer',
          meta: '',
          href: `/shipments/${r.shipment.id}`,
        })),
      },
      {
        key: 'urgent',
        label: 'Urgent Shipments',
        description: 'Marked Urgent or VIP on their quotation',
        icon: AlertTriangle,
        color: 'bg-red-50 text-red-600',
        count: urgentRows.length,
        viewAllHref: '/shipments',
        rows: urgentRows.map((s) => ({
          id: s.id,
          primary: s.reference_number ?? 'Shipment',
          secondary: s.customer?.company_name ?? 'Unknown customer',
          meta: s.quotation?.priority === 'vip' ? 'VIP' : 'Urgent',
          href: `/shipments/${s.id}`,
        })),
      },
      {
        key: 'overdue',
        label: 'Overdue Tasks',
        description: 'Past their due date and not yet done',
        icon: Clock,
        color: 'bg-rose-50 text-rose-600',
        count: overdue.count ?? 0,
        viewAllHref: '/shipments',
        rows: overdue.data
          .filter((t) => t.shipment)
          .map((t) => ({
            id: t.id,
            primary: t.title,
            secondary: t.shipment!.reference_number ?? 'Shipment',
            meta: t.due_date ? `Due ${formatDate(t.due_date)}` : '',
            href: `/shipments/${t.shipment!.id}`,
          })),
      },
    ];
  }, [data, canConvert]);

  const totalOutstanding = sections.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Work Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          {loading
            ? 'Checking outstanding work…'
            : totalOutstanding > 0
              ? `${totalOutstanding} item${totalOutstanding === 1 ? '' : 's'} need attention.`
              : "Nothing outstanding right now — you're caught up."}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : totalOutstanding === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="All caught up"
          message="No outstanding documentation, customs, terminal, invoice, or task items right now."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sections
            .filter((s) => s.count > 0)
            .map((section) => (
              <Card key={section.key} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${section.color}`}>
                      <section.icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1">{section.label}</span>
                    <Badge variant="secondary">{section.count}</Badge>
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-1">
                  {section.rows.slice(0, 5).map((row) =>
                    row.startShipmentQuotation ? (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      >
                        <Link to={row.href} className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{row.primary}</span>
                          <span className="text-muted-foreground"> · {row.secondary}</span>
                        </Link>
                        <Button
                          size="sm"
                          className="h-7 shrink-0 text-xs"
                          onClick={() => setConvertTarget(row.startShipmentQuotation!)}
                        >
                          <ArrowRightLeft className="mr-1 h-3 w-3" />
                          Start Shipment
                        </Button>
                      </div>
                    ) : (
                      <Link
                        key={row.id}
                        to={row.href}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{row.primary}</span>
                          <span className="text-muted-foreground"> · {row.secondary}</span>
                        </span>
                        {row.meta && (
                          <span className="shrink-0 text-xs text-muted-foreground">{row.meta}</span>
                        )}
                      </Link>
                    )
                  )}
                  {section.count > 5 && (
                    <Link
                      to={section.viewAllHref}
                      className="block px-2 pt-1 text-xs font-medium text-primary hover:underline"
                    >
                      View all {section.count} →
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {convertTarget && (
        <ConvertToShipmentDialog
          quotation={convertTarget}
          open={!!convertTarget}
          onOpenChange={(open) => !open && setConvertTarget(null)}
          onConverted={load}
        />
      )}
    </div>
  );
}
