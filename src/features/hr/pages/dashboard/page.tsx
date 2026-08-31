'use client';

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Loader2, Gauge } from 'lucide-react';
import {
  fetchDepartmentCapacity,
  fetchHrDashboardStats,
  fetchWorkforceByBranch,
  fetchWorkforceByDepartment,
} from '@/features/hr/services/hr.service';
import { HrDashboardStatTiles } from '@/features/hr/components/hr-dashboard-stat-tiles';
import { CapacityStatusBadge } from '@/features/hr/components/capacity-status-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';

export default function HrDashboardPage() {
  // One useQuery per RPC — the platform_dashboard_stats() pattern
  // (migration 071/087), not a pile of client-side counts.
  const statsQuery = useQuery({ queryKey: ['hr-dashboard-stats'], queryFn: fetchHrDashboardStats });
  const branchQuery = useQuery({ queryKey: ['hr-workforce-by-branch'], queryFn: fetchWorkforceByBranch });
  const departmentQuery = useQuery({ queryKey: ['hr-workforce-by-department'], queryFn: fetchWorkforceByDepartment });
  const capacityQuery = useQuery({ queryKey: ['hr-department-capacity'], queryFn: fetchDepartmentCapacity });

  const loading = statsQuery.isLoading || branchQuery.isLoading || departmentQuery.isLoading || capacityQuery.isLoading;
  const stats = statsQuery.data ?? null;
  const byBranch = branchQuery.data ?? [];
  const byDepartment = departmentQuery.data ?? [];
  const departmentCapacity = capacityQuery.data ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  const notable = departmentCapacity
    .filter((d) => !d.is_thin_data && (d.status_label === 'overloaded' || d.status_label === 'underutilized'))
    .slice(0, 5);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <LayoutDashboard className="h-6 w-6 text-blue-600" />
          HR Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">Your workforce, at a glance.</p>
      </div>

      {stats && <HrDashboardStatTiles stats={stats} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Workforce by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            {byBranch.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No branches yet.</p>
            ) : (
              <BarList items={byBranch.map((b) => ({ label: b.branch_name, value: b.employee_count }))} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Workforce by Department</CardTitle>
          </CardHeader>
          <CardContent>
            {byDepartment.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No department assignments yet.</p>
            ) : (
              <BarList items={byDepartment.map((d) => ({ label: d.department_name, value: d.employee_count }))} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Gauge className="h-4 w-4 text-blue-600" />
              Capacity Snapshot
            </CardTitle>
            <CardDescription>Roles running notably hot or cold right now, relative to the rest of the organization.</CardDescription>
          </div>
          <Link to="/hr/capacity/departments">
            <Button variant="outline" size="sm">
              View Department Capacity
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {notable.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing running notably hot or cold right now — or there isn&apos;t enough operational data yet to say.
            </p>
          ) : (
            <div className="space-y-2">
              {notable.map((d) => (
                <div key={`${d.branch_id}-${d.linked_role}`} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium capitalize">{d.linked_role.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{d.branch_name ?? 'Org-wide'} · {d.active_employee_count} employees</p>
                  </div>
                  <CapacityStatusBadge statusLabel={d.status_label} isThinData={d.is_thin_data} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium">{item.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
