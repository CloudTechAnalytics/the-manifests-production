'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, TriangleAlert } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import {
  EXPOSURE_TYPE_META,
  EXPOSURE_STATUS_META,
  RESPONSIBLE_PARTY_META,
  formatCurrency,
  formatDate,
} from '@/shared/lib/utils/status';
import { computeExposureAccrual } from '@/shared/lib/utils/financial-exposure';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { FinancialExposureFormDialog } from '@/features/shipments/components/financial-exposure-form-dialog';
import type { ExposureType, FinancialExposure, ShipmentStatus } from '@/shared/types';

const EXPOSURE_TYPE_ORDER: ExposureType[] = [
  'demurrage',
  'detention',
  'terminal_storage',
  'warehouse_storage',
  'penalty',
  'emergency_charge',
];

interface FinancialExposurePanelProps {
  shipmentId: string;
  branchId: string;
  shipmentStatus: ShipmentStatus;
  defaultCurrency: string;
  onChanged: () => void;
}

export function FinancialExposurePanel({
  shipmentId,
  branchId,
  shipmentStatus,
  defaultCurrency,
  onChanged,
}: FinancialExposurePanelProps) {
  const [exposures, setExposures] = useState<FinancialExposure[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogState, setDialogState] = useState<{
    type: ExposureType;
    existing: FinancialExposure | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('financial_exposures')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: false });
    setExposures((data as FinancialExposure[] | null) ?? []);
    setLoading(false);
  }, [shipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaved = () => {
    load();
    onChanged();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const activeExposures = exposures.filter((e) => e.status !== 'paid');
  const totalsByCurrency = activeExposures.reduce<Record<string, number>>((acc, e) => {
    const { accumulatedCost } = computeExposureAccrual(e);
    acc[e.currency] = (acc[e.currency] ?? 0) + accumulatedCost;
    return acc;
  }, {});
  const currencyEntries = Object.entries(totalsByCurrency).filter(([, total]) => total > 0);

  return (
    <div className="space-y-4">
      {currencyEntries.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="flex items-center gap-3 py-4">
            <TriangleAlert className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">Financial exposure running</p>
              <p className="text-sm text-red-700">
                {currencyEntries.map(([currency, total]) => formatCurrency(total, currency)).join(' · ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {EXPOSURE_TYPE_ORDER.map((type) => {
        const records = exposures.filter((e) => e.exposure_type === type);
        return (
          <Card key={type}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">{EXPOSURE_TYPE_META[type].label}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setDialogState({ type, existing: null })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <EmptyState
                  icon={TriangleAlert}
                  title={`No ${EXPOSURE_TYPE_META[type].label.toLowerCase()} recorded`}
                  compact
                />
              ) : (
                <div className="space-y-3">
                  {records.map((exposure) => {
                    const accrual = computeExposureAccrual(exposure);
                    const statusMeta = EXPOSURE_STATUS_META[exposure.status] ?? {
                      label: exposure.status ?? 'Unknown',
                      color: 'bg-muted text-muted-foreground',
                    };
                    const responsiblePartyLabel =
                      RESPONSIBLE_PARTY_META[exposure.responsible_party]?.label ?? exposure.responsible_party;
                    const isPaid = exposure.status === 'paid';
                    return (
                      <div
                        key={exposure.id}
                        className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:border-primary/40"
                        onClick={() => setDialogState({ type, existing: exposure })}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={statusMeta.color}>{statusMeta.label}</Badge>
                            <span className="text-xs text-muted-foreground">{responsiblePartyLabel}</span>
                          </div>
                          <span className={`text-sm font-bold ${isPaid ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(accrual.accumulatedCost, exposure.currency)}
                          </span>
                        </div>
                        {exposure.reason && (
                          <p className="mt-2 text-sm text-muted-foreground">{exposure.reason}</p>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                          <span>Start: {formatDate(exposure.start_date)}</span>
                          <span>Free Days: {exposure.free_days}</span>
                          <span>Free Period Ends: {formatDate(accrual.freePeriodEnd.toISOString().split('T')[0])}</span>
                          <span>{exposure.end_date ? `Ended: ${formatDate(exposure.end_date)}` : 'Ongoing'}</span>
                          <span>Charge/Day: {formatCurrency(exposure.charge_per_day, exposure.currency)}</span>
                          <span>Chargeable Days: {accrual.chargeableDays}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {dialogState && (
        <FinancialExposureFormDialog
          open={!!dialogState}
          onOpenChange={(open) => !open && setDialogState(null)}
          shipmentId={shipmentId}
          branchId={branchId}
          shipmentStatus={shipmentStatus}
          defaultCurrency={defaultCurrency}
          defaultExposureType={dialogState.type}
          existing={dialogState.existing}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
