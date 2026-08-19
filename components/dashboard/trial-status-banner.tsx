'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { daysRemaining } from '@/lib/utils/status';
import type { OrgSubscription, Plan } from '@/types';

/**
 * "Professional Trial / 28 days remaining" on a trial, or "Professional
 * plan · renews in N days" / "expired, renew now" once paid (migration
 * 077's current_period_end). Reads org_subscriptions directly, now that
 * migration 064 grants an org a read-only view of its own row. Renders
 * nothing once neither applies (an active subscription still well within
 * its period, or no subscription row at all — a pre-plans-system legacy
 * organization).
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

  if (!subscription) return null;

  if (subscription.status === 'trial' && subscription.trial_ends_at) {
    const remaining = daysRemaining(subscription.trial_ends_at);
    const urgent = remaining <= 3;
    return (
      <Banner urgent={urgent} icon={Hourglass}>
        <span className="font-medium">{subscription.plan?.name ?? 'Trial'} Trial</span>
        <span>&middot; {remaining} day{remaining === 1 ? '' : 's'} remaining</span>
      </Banner>
    );
  }

  // Only surface a paid period once it's within a week of ending — a
  // freshly-paid org with months of runway shouldn't see a banner at all.
  if (subscription.status === 'active' && subscription.current_period_end) {
    const msLeft = new Date(subscription.current_period_end).getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (daysLeft > 7) return null;
    const expired = daysLeft <= 0;
    return (
      <Banner urgent icon={AlertTriangle}>
        <span className="font-medium">{subscription.plan?.name ?? 'Your'} plan</span>
        <span>
          &middot; {expired ? 'expired — renew to keep access' : `renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
        </span>
      </Banner>
    );
  }

  return null;
}

function Banner({
  urgent,
  icon: Icon,
  children,
}: {
  urgent: boolean;
  icon: typeof Hourglass;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
        urgent ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-border bg-muted/30 text-muted-foreground'
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        {children}
      </span>
      <Link href="/upgrade" className="font-medium text-primary hover:underline">
        {urgent ? 'Renew Plan' : 'Upgrade Plan'}
      </Link>
    </div>
  );
}
