import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CAPACITY_STATUS_META, thinDataMessage } from '@/lib/hr/capacity-insights';
import type { CapacityStatusLabel } from '@/types';

interface CapacityStatusBadgeProps {
  statusLabel: CapacityStatusLabel | null;
  isThinData: boolean;
  thinReason?: string | null;
}

/**
 * Never renders a fabricated status. When there isn't enough data yet
 * (is_thin_data — see migration 087's thresholds), this shows the
 * honest "needs more data" state instead of a fake "Healthy" — spec
 * section 7's explicit requirement.
 */
export function CapacityStatusBadge({ statusLabel, isThinData, thinReason }: CapacityStatusBadgeProps) {
  if (isThinData || !statusLabel) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 border border-dashed border-muted-foreground/40 bg-muted text-muted-foreground"
        title={thinDataMessage(thinReason ?? null)}
      >
        <AlertTriangle className="h-3 w-3" />
        Needs more data
      </Badge>
    );
  }

  const meta = CAPACITY_STATUS_META[statusLabel];
  return (
    <Badge variant="secondary" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
