'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Boxes, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { thinDataMessage } from '@/lib/hr/capacity-insights';
import { CapacityStatusBadge } from '@/components/hr/capacity-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DepartmentCapacity } from '@/types';

export default function DepartmentCapacityPage() {
  const [rows, setRows] = useState<DepartmentCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    supabase.rpc('hr_department_capacity').then(({ data }) => {
      if (!isMounted) return;
      setRows((data as DepartmentCapacity[]) ?? []);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link href="/hr/capacity">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Boxes className="h-6 w-6 text-blue-600" />
            Department Capacity
          </h1>
          <p className="text-sm text-muted-foreground">
            Where the bottleneck actually is — every role, every branch, compared against the organization average.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No responsibilities assigned yet — link employees to a role (Employees → Responsibilities) to see capacity here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department / Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Active Work</TableHead>
                  <TableHead>Capacity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.branch_id}-${row.linked_role}`}>
                    <TableCell className="font-medium capitalize">{row.linked_role.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-muted-foreground">{row.branch_name ?? 'Org-wide'}</TableCell>
                    <TableCell className="text-muted-foreground">{row.active_employee_count}</TableCell>
                    <TableCell className="text-muted-foreground">{row.total_score.toFixed(1)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CapacityStatusBadge statusLabel={row.status_label} isThinData={row.is_thin_data} />
                        {row.is_thin_data && (
                          <span className="text-xs text-muted-foreground" title={thinDataMessage('few_peers')}>
                            {row.active_employee_count < 2 ? 'Only 1 person in this role' : ''}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
