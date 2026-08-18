'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { daysRemaining } from '@/lib/utils/status';
import type { OrgSubscription, Plan } from '@/types';

/**
 * "Professional Trial / 28 days remaining" — spec section 12. Reads
 * org_subscriptions directly, now that migration 064 grants an org a
 * read-only view of its own row (previously platform_admin-only). Renders
 * nothing once the org is off a trial, or if there's no subscription row
 * at all (a pre-plans-system legacy organization).
 */
export function TrialStatusBanner({ organizationId }: { organizationId: string | null | undefined }) {
  const [subscription, setSubscription] = useState<(OrgSubscription & { plan: Plan }) | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const { data } = await supabase
        .from('org_subscriptions')
        .select('*, plan:plans(*)')
        .eq('organization_id', organizationId)
        .maybeSingle();
      setSubscription(data as (OrgSubscription & { plan: Plan }) | null);
    })();
  }, [organizationId]);

  if (!subscription || subscription.status !== 'trial' || !subscription.trial_ends_at) return null;

  const remaining = daysRemaining(subscription.trial_ends_at);
  const urgent = remaining <= 3;

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
        urgent ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-border bg-muted/30 text-muted-foreground'
      }`}
    >
      <span className="flex items-center gap-2">
        <Hourglass className="h-4 w-4 shrink-0" />
        <span className="font-medium">{subscription.plan?.name ?? 'Trial'} Trial</span>
        <span>&middot; {remaining} day{remaining === 1 ? '' : 's'} remaining</span>
      </span>
      <Link href="/upgrade" className="font-medium text-primary hover:underline">
        Upgrade Plan
      </Link>
    </div>
  );
}
