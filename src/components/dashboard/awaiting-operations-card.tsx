'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowRightLeft, PackageSearch } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConvertToShipmentDialog } from '@/components/quotations/convert-to-shipment-dialog';
import { formatDate } from '@/lib/utils/status';
import { QUOTATION_PRIORITY_META } from '@/lib/quotation-constants';
import type { Quotation } from '@/types';

/**
 * Replaces the "Recent Quotations" widget (item 3): accepted quotations
 * that haven't been converted to a shipment yet, ready for Operations to
 * pick up. Self-contained (own live query, same pattern as
 * hooks/use-notifications.ts) rather than threaded through the large
 * shared useDashboardData hook, so this stays independently correct
 * regardless of that hook's own shape. A row disappears automatically
 * on the next refetch once its quotation is converted.
 */
export function AwaitingOperationsCard() {
  const { profile, hasRole } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;
  const canConvert = hasRole('admin') || hasRole('branch_manager') || hasRole('operations');

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('quotations')
        .select('*, customer:customers(*)')
        .eq('status', 'accepted')
        .is('converted_shipment_id', null)
        .is('deleted_at', null)
        .order('approval_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(5);
      if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

      const { data, error } = await query;
      if (error) {
        console.error('Error loading awaiting-operations quotations:', error);
        setQuotations([]);
        return;
      }
      setQuotations((data as Quotation[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Awaiting Operations</CardTitle>
        <Link href="/quotations?status=accepted">
          <Button variant="ghost" size="sm">
            View all
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : quotations.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Nothing waiting on Operations."
            message="Accepted quotations ready to become shipments will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {quotations.map((q) => {
              const priorityMeta = QUOTATION_PRIORITY_META[q.priority] ?? {
                label: q.priority ?? 'Unknown',
                color: 'bg-muted text-muted-foreground',
              };
              return (
                <div key={q.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/quotations/${q.id}`} className="truncate font-medium text-primary hover:underline">
                        {q.customer?.company_name ?? 'Unknown customer'}
                      </Link>
                      {q.priority !== 'normal' && priorityMeta && (
                        <Badge variant="secondary" className={`text-[10px] ${priorityMeta.color}`}>
                          {priorityMeta.label}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.quotation_number} · {q.shipment_direction ?? '—'} · {q.origin_port ?? q.origin ?? '—'} →{' '}
                      {q.destination_port ?? q.destination ?? '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Accepted {q.approval_date ? formatDate(q.approval_date) : formatDate(q.updated_at)}
                    </p>
                  </div>
                  {canConvert && (
                    <Button size="sm" onClick={() => setConvertTarget(q)} className="shrink-0">
                      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                      Start Shipment
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {convertTarget && (
        <ConvertToShipmentDialog
          quotation={convertTarget}
          open={!!convertTarget}
          onOpenChange={(open) => !open && setConvertTarget(null)}
          onConverted={load}
        />
      )}
    </Card>
  );
}
