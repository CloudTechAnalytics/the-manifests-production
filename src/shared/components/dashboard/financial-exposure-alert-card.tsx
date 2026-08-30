'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EXPOSURE_TYPE_META, formatCurrency, pickPrimaryCurrency } from '@/shared/lib/utils/status';
import { computeExposureAccrual } from '@/shared/lib/utils/financial-exposure';
import type { ExposureType, FinancialExposure } from '@/shared/types';

type ExposureRow = Pick<
  FinancialExposure,
  'id' | 'shipment_id' | 'exposure_type' | 'start_date' | 'free_days' | 'end_date' | 'charge_per_day' | 'currency' | 'status'
>;

/**
 * Self-contained (own query, not threaded through useDashboardData) —
 * same precedent as AwaitingOperationsCard. Money being lost across every
 * active (non-paid) financial exposure record the caller can see, summed
 * client-side via the same live accrual calculator used on the shipment
 * page — no scheduled job needed, the number is correct on every load.
 */
export function FinancialExposureAlertCard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [exposures, setExposures] = useState<ExposureRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('financial_exposures')
        .select('id, shipment_id, exposure_type, start_date, free_days, end_date, charge_per_day, currency, status')
        .in('status', ['pending', 'disputed', 'approved']);
      if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

      const { data, error } = await query;
      if (error) {
        console.error('Error loading financial exposures:', error);
        setExposures([]);
        return;
      }
      setExposures((data as ExposureRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle className="text-lg font-semibold">Financial Exposure</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalsByCurrency: Record<string, number> = {};
  const countsByType: Partial<Record<ExposureType, number>> = {};
  const shipmentIds = new Set<string>();

  for (const exposure of exposures) {
    const { accumulatedCost } = computeExposureAccrual(exposure);
    if (accumulatedCost <= 0) continue;
    totalsByCurrency[exposure.currency] = (totalsByCurrency[exposure.currency] ?? 0) + accumulatedCost;
    countsByType[exposure.exposure_type] = (countsByType[exposure.exposure_type] ?? 0) + 1;
    shipmentIds.add(exposure.shipment_id);
  }

  const primaryCurrency = pickPrimaryCurrency(totalsByCurrency);
  const activeCount = Object.values(countsByType).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-3">
        <CardTitle className="text-lg font-semibold">Financial Exposure</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {activeCount === 0 || !primaryCurrency ? (
          <div className="flex items-center justify-center gap-2.5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">No active financial exposures.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-red-800">
                  {Object.entries(totalsByCurrency)
                    .map(([currency, total]) => formatCurrency(total, currency))
                    .join(' · ')}
                </p>
                <p className="text-xs text-red-700">
                  {activeCount} active exposure{activeCount === 1 ? '' : 's'} across {shipmentIds.size} shipment
                  {shipmentIds.size === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(countsByType) as [ExposureType, number][]).map(([type, count]) => {
                const typeMeta = EXPOSURE_TYPE_META[type] ?? {
                  label: type ?? 'Unknown',
                  color: 'bg-muted text-muted-foreground',
                };
                return (
                  <span key={type} className={`rounded-full px-2.5 py-1 text-xs font-medium ${typeMeta.color}`}>
                    {count} {typeMeta.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
