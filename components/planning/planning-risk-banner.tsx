'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanningRisk } from '@/lib/utils/planning';

interface PlanningRiskBannerProps {
  risks: PlanningRisk[];
}

export function PlanningRiskBanner({ risks }: PlanningRiskBannerProps) {
  if (risks.length === 0) return null;

  const hasCritical = risks.some((r) => r.level === 'critical');

  return (
    <div
      className={cn(
        'space-y-1.5 rounded-lg border px-4 py-3',
        hasCritical ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm font-semibold',
          hasCritical ? 'text-red-700' : 'text-amber-700'
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        {risks.length} planning risk{risks.length === 1 ? '' : 's'} detected
      </p>
      <ul className={cn('ml-5 list-disc text-sm', hasCritical ? 'text-red-700' : 'text-amber-700')}>
        {risks.map((r) => (
          <li key={r.id}>{r.message}</li>
        ))}
      </ul>
    </div>
  );
}
