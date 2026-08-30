import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { QUOTATION_STATUS_META, formatCurrency, formatDate } from '@/shared/lib/utils/status';
import type { Quotation } from '@/shared/types';

interface RecentQuotationsTableProps {
  quotations: Quotation[];
  loading?: boolean;
}

export function RecentQuotationsTable({
  quotations,
  loading,
}: RecentQuotationsTableProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">
          Recent Quotations
        </CardTitle>
        <Link to="/quotations">
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
        ) : quotations.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No pending quotations."
            message="New quotations will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 px-3 text-xs">Quotation</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Customer</TableHead>
                  <TableHead className="h-9 px-3 text-right text-xs">Value</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Status</TableHead>
                  <TableHead className="h-9 px-3 text-xs">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((q) => {
                  const meta = QUOTATION_STATUS_META[q.status] ?? {
                    label: q.status ?? 'Unknown',
                    color: 'bg-muted text-muted-foreground',
                  };
                  return (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer transition-colors hover:bg-accent/60"
                    >
                      <TableCell className="py-2 px-3 font-medium text-primary">
                        <Link to={`/quotations/${q.id}`} className="block">
                          {q.quotation_number ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="py-2 px-3 max-w-[160px] truncate text-muted-foreground">
                        {q.customer?.company_name ?? '—'}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right font-medium">
                        {formatCurrency(q.total, q.currency)}
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
  );
}
