import type { FinancialExposure } from '@/types';

export interface ExposureAccrual {
  freePeriodEnd: Date;
  chargeableDays: number;
  accumulatedCost: number;
}

/**
 * The automatic demurrage/detention/storage calculator. Derived at read
 * time — never stored. Same reasoning as isInvoiceOverdue()/
 * isDocumentExpired() in lib/utils/status.ts: flipping a stored "current
 * days"/"accumulated cost" value would need a scheduled job this project
 * doesn't have. `end_date` (once set) freezes the accrual at resolution;
 * while null, "today" is the effective end, so every page view recomputes
 * the live-running total.
 *
 * Worked example (matches the spec exactly): container arrives 12 Aug,
 * 5 free days -> free period ends 17 Aug. Today 20 Aug, charge ₦40,000/day
 * -> chargeableDays = 3, accumulatedCost = ₦120,000.
 */
export function computeExposureAccrual(
  exposure: Pick<FinancialExposure, 'start_date' | 'free_days' | 'end_date' | 'charge_per_day'>
): ExposureAccrual {
  const start = new Date(exposure.start_date + 'T00:00:00');
  const freePeriodEnd = new Date(start);
  freePeriodEnd.setDate(freePeriodEnd.getDate() + exposure.free_days);

  const effectiveEnd = exposure.end_date
    ? new Date(exposure.end_date + 'T00:00:00')
    : new Date(new Date().toDateString());

  const diffMs = effectiveEnd.getTime() - freePeriodEnd.getTime();
  const chargeableDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    freePeriodEnd,
    chargeableDays,
    accumulatedCost: chargeableDays * exposure.charge_per_day,
  };
}
