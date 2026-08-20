'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gauge, Loader2, Boxes, Network } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { generateWorkforceInsights, thinDataMessage } from '@/lib/hr/capacity-insights';
import { CapacityStatusBadge } from '@/components/hr/capacity-status-badge';
import { CapacityInsightCard } from '@/components/hr/capacity-insight-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { BranchCapacity, DepartmentCapacity, EmployeeCapacity } from '@/types';

export default function PeopleCapacityPage() {
  const [people, setPeople] = useState<EmployeeCapacity[]>([]);
  const [departments, setDepartments] = useState<DepartmentCapacity[]>([]);
  const [branches, setBranches] = useState<BranchCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const [peopleRes, deptRes, branchRes] = await Promise.all([
        supabase.rpc('hr_people_capacity'),
        supabase.rpc('hr_department_capacity'),
        supabase.rpc('hr_branch_capacity'),
      ]);
      if (!isMounted) return;
      setPeople((peopleRes.data as EmployeeCapacity[]) ?? []);
      setDepartments((deptRes.data as DepartmentCapacity[]) ?? []);
      setBranches((branchRes.data as BranchCapacity[]) ?? []);
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

  const insights = generateWorkforceInsights(people, departments, branches);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Gauge className="h-6 w-6 text-blue-600" />
            People Capacity
          </h1>
          <p className="text-sm text-muted-foreground">
            Real operational workload, not a fake completed/total score — see each card&apos;s methodology.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/hr/capacity/departments">
            <Button variant="outline" size="sm">
              <Boxes className="mr-1.5 h-4 w-4" /> Departments
            </Button>
          </Link>
          <Link href="/hr/capacity/branches">
            <Button variant="outline" size="sm">
              <Network className="mr-1.5 h-4 w-4" /> Branches
            </Button>
          </Link>
        </div>
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Workforce Insights</CardTitle>
            <CardDescription>Recommendations, not automatic decisions — always yours to weigh.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((insight) => (
              <CapacityInsightCard key={insight.id} insight={insight} />
            ))}
          </CardContent>
        </Card>
      )}

      {people.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No active employees with a Manifest login yet — add employees and link their accounts to see capacity here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <EmployeeCapacityCard key={p.employee_id} capacity={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeCapacityCard({ capacity }: { capacity: EmployeeCapacity }) {
  const pct = capacity.utilization_index != null ? Math.min(capacity.utilization_index, 200) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">{capacity.employee_name}</CardTitle>
          <p className="text-xs text-muted-foreground">{capacity.branch_name ?? 'Org-wide'}</p>
        </div>
        <CapacityStatusBadge statusLabel={capacity.status_label} isThinData={capacity.is_thin_data} thinReason={capacity.thin_reason} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Open Work Items</span>
          <span className="font-medium text-foreground">{capacity.sample_size}</span>
        </div>
        {capacity.is_thin_data ? (
          <p className="pt-1 text-xs text-muted-foreground">{thinDataMessage(capacity.thin_reason)}</p>
        ) : (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {pct}% of typical workload for peers in the same role
              {capacity.peer_count > 0 ? ` (compared against ${capacity.peer_count} peer${capacity.peer_count === 1 ? '' : 's'})` : ''}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
