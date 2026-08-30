'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Network } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { thinDataMessage } from '@/shared/lib/hr/capacity-insights';
import { CapacityStatusBadge } from '@/features/hr/components/capacity-status-badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import type { BranchCapacity } from '@/shared/types';

export default function BranchCapacityPage() {
  const [rows, setRows] = useState<BranchCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    supabase.rpc('hr_branch_capacity').then(({ data }) => {
      if (!isMounted) return;
      setRows((data as BranchCapacity[]) ?? []);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link to="/hr/capacity">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Network className="h-6 w-6 text-blue-600" />
            Branch Capacity
          </h1>
          <p className="text-sm text-muted-foreground">
            &quot;Do we actually need another employee here?&quot; — answered with real workload, not a guess.
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
            <p className="py-16 text-center text-sm text-muted-foreground">No branches with active employees yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Active Work</TableHead>
                  <TableHead>Capacity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.branch_id}>
                    <TableCell className="font-medium">{row.branch_name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.active_employee_count}</TableCell>
                    <TableCell className="text-muted-foreground">{row.total_score.toFixed(1)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CapacityStatusBadge statusLabel={row.status_label} isThinData={row.is_thin_data} thinReason={row.thin_reason} />
                        {row.is_thin_data && row.thin_reason && (
                          <span className="text-xs text-muted-foreground">{thinDataMessage(row.thin_reason)}</span>
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
