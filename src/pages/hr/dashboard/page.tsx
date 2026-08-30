'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Loader2, Gauge } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { HrDashboardStatTiles } from '@/components/hr/hr-dashboard-stat-tiles';
import { CapacityStatusBadge } from '@/components/hr/capacity-status-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DepartmentCapacity, HrDashboardStats, WorkforceByBranch, WorkforceByDepartment } from '@/types';

export default function HrDashboardPage() {
  const [stats, setStats] = useState<HrDashboardStats | null>(null);
  const [byBranch, setByBranch] = useState<WorkforceByBranch[]>([]);
  const [byDepartment, setByDepartment] = useState<WorkforceByDepartment[]>([]);
  const [departmentCapacity, setDepartmentCapacity] = useState<DepartmentCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      // One Promise.all batch, each an RPC — the platform_dashboard_stats()
      // pattern (migration 071/087), not a pile of client-side counts.
      const [statsRes, branchRes, deptRes, capacityRes] = await Promise.all([
        supabase.rpc('hr_dashboard_stats'),
        supabase.rpc('hr_workforce_by_branch'),
        supabase.rpc('hr_workforce_by_department'),
        supabase.rpc('hr_department_capacity'),
      ]);
      if (!isMounted) return;

      setStats(((statsRes.data as HrDashboardStats[]) ?? [])[0] ?? null);
      setByBranch((branchRes.data as WorkforceByBranch[]) ?? []);
      setByDepartment(((deptRes.data as WorkforceByDepartment[]) ?? []).filter((d) => d.employee_count > 0));
      setDepartmentCapacity((capacityRes.data as DepartmentCapacity[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

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
