'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  FileText,
  Package,
  PackageCheck,
  TrendingUp,
  Plus,
  ArrowRight,
  Activity as ActivityIcon,
  Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  SHIPMENT_STATUS_META,
  QUOTATION_STATUS_META,
  formatRelativeTime,
  formatCurrency,
} from '@/lib/utils/status';
import type { Activity, Shipment, Quotation, Customer } from '@/types';

interface Stats {
  totalCustomers: number;
  pendingQuotations: number;
  activeShipments: number;
  completedShipments: number;
}

interface BranchStat {
  branch_id: string;
  branch_name: string;
  customers: number;
  shipments: number;
  quotations: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [pendingQuotations, setPendingQuotations] = useState<Quotation[]>([]);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [shipmentStatusData, setShipmentStatusData] = useState<
    { status: string; count: number }[]
  >([]);

  const isAdmin = profile?.role === 'admin';
  const branchFilter = isAdmin ? null : profile?.branch_id;

  useEffect(() => {
    async function loadDashboard() {
      if (!profile) return;
      setLoading(true);

      try {
        let customerQuery = supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null);
        if (branchFilter) customerQuery = customerQuery.eq('branch_id', branchFilter);
        const { count: customerCount } = await customerQuery;

        let quotationQuery = supabase
          .from('quotations')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .in('status', ['draft', 'sent']);
        if (branchFilter) quotationQuery = quotationQuery.eq('branch_id', branchFilter);
        const { count: quotationCount } = await quotationQuery;

        let activeShipQuery = supabase
          .from('shipments')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('status', 'in', '("delivered","cancelled")');
        if (branchFilter) activeShipQuery = activeShipQuery.eq('branch_id', branchFilter);
        const { count: activeCount } = await activeShipQuery;

        let completedShipQuery = supabase
          .from('shipments')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('status', 'delivered');
        if (branchFilter) completedShipQuery = completedShipQuery.eq('branch_id', branchFilter);
        const { count: completedCount } = await completedShipQuery;

        setStats({
          totalCustomers: customerCount ?? 0,
          pendingQuotations: quotationCount ?? 0,
          activeShipments: activeCount ?? 0,
          completedShipments: completedCount ?? 0,
        });

        // Recent shipments
        let shipQuery = supabase
          .from('shipments')
          .select('*, customer:customers(*), branch:branches(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (branchFilter) shipQuery = shipQuery.eq('branch_id', branchFilter);
        const { data: shipments } = await shipQuery;
        setRecentShipments((shipments as Shipment[]) ?? []);

        // Pending quotations
        let quotQuery = supabase
          .from('quotations')
          .select('*, customer:customers(*)')
          .is('deleted_at', null)
          .in('status', ['draft', 'sent'])
          .order('created_at', { ascending: false })
          .limit(5);
        if (branchFilter) quotQuery = quotQuery.eq('branch_id', branchFilter);
        const { data: quots } = await quotQuery;
        setPendingQuotations((quots as Quotation[]) ?? []);

        // Recent activities
        let actQuery = supabase
          .from('activities')
          .select('*, user:user_id(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(8);
        if (branchFilter) actQuery = actQuery.eq('branch_id', branchFilter);
        const { data: acts } = await actQuery;
        setRecentActivities((acts as Activity[]) ?? []);

        // Shipment status distribution
        let statusQuery = supabase
          .from('shipments')
          .select('status')
          .is('deleted_at', null);
        if (branchFilter) statusQuery = statusQuery.eq('branch_id', branchFilter);
        const { data: statusData } = await statusQuery;
        if (statusData) {
          const counts: Record<string, number> = {};
          statusData.forEach((s) => {
            counts[s.status] = (counts[s.status] ?? 0) + 1;
          });
          setShipmentStatusData(
            Object.entries(counts).map(([status, count]) => ({ status, count }))
          );
        }

        // Branch summary (admin only)
        if (isAdmin) {
          const { data: branches } = await supabase
            .from('branches')
            .select('id, name')
            .is('deleted_at', null);

          if (branches) {
            const bStats: BranchStat[] = [];
            for (const b of branches) {
              const { count: cCount } = await supabase
                .from('customers')
                .select('id', { count: 'exact', head: true })
                .eq('branch_id', b.id)
                .is('deleted_at', null);
              const { count: sCount } = await supabase
                .from('shipments')
                .select('id', { count: 'exact', head: true })
                .eq('branch_id', b.id)
                .is('deleted_at', null);
              const { count: qCount } = await supabase
                .from('quotations')
                .select('id', { count: 'exact', head: true })
                .eq('branch_id', b.id)
                .is('deleted_at', null);
              bStats.push({
                branch_id: b.id,
                branch_name: b.name,
                customers: cCount ?? 0,
                shipments: sCount ?? 0,
                quotations: qCount ?? 0,
              });
            }
            setBranchStats(bStats);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [profile, isAdmin, branchFilter]);

  const cards = [
    {
      label: 'Total Customers',
      value: stats?.totalCustomers ?? 0,
      icon: Users,
      href: '/customers',
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Pending Quotations',
      value: stats?.pendingQuotations ?? 0,
      icon: FileText,
      href: '/quotations',
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Active Shipments',
      value: stats?.activeShipments ?? 0,
      icon: Package,
      href: '/shipments',
      color: 'bg-cyan-50 text-cyan-600',
    },
    {
      label: 'Completed Shipments',
      value: stats?.completedShipments ?? 0,
      icon: PackageCheck,
      href: '/shipments',
      color: 'bg-green-50 text-green-600',
    },
  ];

  const maxStatusCount = Math.max(...shipmentStatusData.map((d) => d.count), 1);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {profile?.full_name?.split(' ')[0] ?? 'User'} — here's
            what's happening today.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/customers/new">
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New Customer
            </Button>
          </Link>
          <Link href="/shipments/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New Shipment
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))
          : cards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.label} href={card.href}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-4 p-6">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.color}`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {card.label}
                        </p>
                        <p className="text-2xl font-bold tracking-tight">
                          {card.value}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Shipment Status Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Shipment Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : shipmentStatusData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No shipments yet
              </div>
            ) : (
              <div className="space-y-3">
                {shipmentStatusData.map((item) => {
                  const meta = SHIPMENT_STATUS_META[
                    item.status as keyof typeof SHIPMENT_STATUS_META
                  ];
                  if (!meta) return null;
                  const width = (item.count / maxStatusCount) * 100;
                  return (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-muted-foreground">
                          {item.count}
                        </span>
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

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ActivityIcon className="h-4 w-4" />
              Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No recent activity
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {act.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {act.user?.full_name ?? 'System'} ·{' '}
                        {formatRelativeTime(act.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Shipments */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Recent Shipments
            </CardTitle>
            <Link href="/shipments">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recentShipments.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No shipments yet
              </div>
            ) : (
              <div className="space-y-2">
                {recentShipments.map((ship) => {
                  const meta = SHIPMENT_STATUS_META[ship.status];
                  return (
                    <Link
                      key={ship.id}
                      href={`/shipments/${ship.id}`}
                      className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {ship.reference_number}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ship.customer?.company_name ?? '—'} ·{' '}
                          {ship.origin ?? '—'} → {ship.destination ?? '—'}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`ml-2 shrink-0 text-[10px] ${meta.color}`}
                      >
                        {meta.label}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Quotations */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Pending Quotations
            </CardTitle>
            <Link href="/quotations">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : pendingQuotations.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No pending quotations
              </div>
            ) : (
              <div className="space-y-2">
                {pendingQuotations.map((quot) => {
                  const meta = QUOTATION_STATUS_META[quot.status];
                  return (
                    <Link
                      key={quot.id}
                      href={`/quotations/${quot.id}`}
                      className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {quot.quotation_number}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {quot.customer?.company_name ?? '—'} ·{' '}
                          {formatCurrency(quot.total, quot.currency)}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`ml-2 shrink-0 text-[10px] ${meta.color}`}
                      >
                        {meta.label}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Branch Summary (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="h-4 w-4" />
              Branch Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : branchStats.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                No branches found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">
                        Branch
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Customers
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Shipments
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Quotations
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchStats.map((b) => (
                      <tr
                        key={b.branch_id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-3 font-medium">{b.branch_name}</td>
                        <td className="py-3 text-right">{b.customers}</td>
                        <td className="py-3 text-right">{b.shipments}</td>
                        <td className="py-3 text-right">{b.quotations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
