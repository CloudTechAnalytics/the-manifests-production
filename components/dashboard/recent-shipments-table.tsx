import Link from 'next/link';
import { ArrowRight, Package } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { SHIPMENT_STATUS_META, formatDate } from '@/lib/utils/status';
import type { Shipment } from '@/types';

interface RecentShipmentsTableProps {
  shipments: Shipment[];
  loading?: boolean;
}

export function RecentShipmentsTable({
  shipments,
  loading,
}: RecentShipmentsTableProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">
          Recent Shipments
        </CardTitle>
        <Link href="/shipments">
          <Button variant="ghost" size="sm">
            View all
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : shipments.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No shipments yet"
            message="New shipments will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 px-3 text-xs">Reference</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Customer</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Origin</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Destination</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Status</TableHead>
                  <TableHead className="h-9 px-3 text-xs">ETA</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s) => {
                  const meta = SHIPMENT_STATUS_META[s.status];
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                    >
                      <TableCell className="py-2 px-3 font-medium text-primary">
                        <Link href={`/shipments/${s.id}`} className="block">
                          {s.reference_number ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="py-2 px-3 max-w-[160px] truncate text-muted-foreground">
                        {s.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground">
                        {s.origin ?? '—'}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground">
                        {s.destination ?? '—'}
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground">
                        {formatDate(s.estimated_arrival)}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground">
                        {s.assigned_user?.full_name ?? '—'}
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
  );
}
