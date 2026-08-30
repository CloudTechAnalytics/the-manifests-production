'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { QUOTATION_STATUS_META, formatDate, formatCurrency } from '@/shared/lib/utils/status';
import type { Quotation } from '@/shared/types';

interface VersionHistoryCardProps {
  quotation: Pick<Quotation, 'id' | 'root_quotation_id' | 'version'>;
}

/**
 * Every quotation sharing the same root, oldest first — a version IS a
 * quotation row (see migration 047's rationale), so this is just an
 * ordinary query scoped to the chain, no join into a separate table.
 */
export function VersionHistoryCard({ quotation }: VersionHistoryCardProps) {
  const [rows, setRows] = useState<
    Pick<Quotation, 'id' | 'version' | 'status' | 'total' | 'currency' | 'created_at' | 'is_latest_version'>[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rootId = quotation.root_quotation_id ?? quotation.id;
    supabase
      .from('quotations')
      .select('id, version, status, total, currency, created_at, is_latest_version')
      .or(`id.eq.${rootId},root_quotation_id.eq.${rootId}`)
      .is('deleted_at', null)
      .order('version', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading version history:', error);
          setRows([]);
        } else {
          setRows(data ?? []);
        }
        setLoading(false);
      });
  }, [quotation.id, quotation.root_quotation_id]);

  if (loading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (rows.length <= 1) return null;

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-4 w-4 text-blue-600" />
          Version History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const statusMeta = QUOTATION_STATUS_META[row.status] ?? {
            label: row.status ?? 'Unknown',
            color: 'bg-muted text-muted-foreground',
          };
          const isCurrent = row.id === quotation.id;
          return (
            <Link
              key={row.id}
              to={`/quotations/${row.id}`}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent/60 ${
                isCurrent ? 'border-primary/40 bg-primary/[0.04]' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">Version {row.version}</span>
                {row.is_latest_version && (
                  <Badge variant="outline" className="text-[11px]">
                    Latest
                  </Badge>
                )}
                {isCurrent && (
                  <Badge variant="secondary" className="text-[11px]">
                    Viewing
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{formatDate(row.created_at)}</span>
                <span className="font-medium">{formatCurrency(row.total, row.currency)}</span>
                <Badge variant="secondary" className={`text-[11px] ${statusMeta.color}`}>
                  {statusMeta.label}
                </Badge>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
