'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanningRisk, RiskSeverity } from '@/lib/utils/planning';

interface PlanningRiskBannerProps {
  risks: PlanningRisk[];
}

const SEVERITY_STYLES: Record<RiskSeverity, { border: string; bg: string; text: string; badge: string }> = {
  low: { border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-700' },
  medium: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  high: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  critical: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
};

const SEVERITY_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];

export function PlanningRiskBanner({ risks }: PlanningRiskBannerProps) {
  if (risks.length === 0) return null;

  const highestSeverity = SEVERITY_ORDER.find((s) => risks.some((r) => r.severity === s)) ?? 'low';
  const styles = SEVERITY_STYLES[highestSeverity];
  const sorted = [...risks].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <div className={cn('space-y-2 rounded-lg border px-4 py-3', styles.border, styles.bg)}>
      <p className={cn('flex items-center gap-1.5 text-sm font-semibold', styles.text)}>
        <AlertTriangle className="h-4 w-4" />
        {risks.length} planning risk{risks.length === 1 ? '' : 's'} detected
      </p>
      <ul className="space-y-1">
        {sorted.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase', SEVERITY_STYLES[r.severity].badge)}>
              {r.severity}
            </span>
            <span className={styles.text}>{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
