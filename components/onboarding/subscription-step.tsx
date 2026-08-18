'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { daysRemaining } from '@/lib/utils/status';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrgSubscription } from '@/types';

/** Onboarding step 5 — spec sections 12/27. Reads org_subscriptions/plans directly, now that migration 064 grants an org a read-only view of its own row. */
export function SubscriptionStep({ organizationId }: { organizationId: string }) {
  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: sub }, { data: count }] = await Promise.all([
        supabase
          .from('org_subscriptions')
          .select('*, plan:plans(*)')
          .eq('organization_id', organizationId)
          .maybeSingle(),
        supabase.rpc('org_user_count', { p_org_id: organizationId }),
      ]);
      setSubscription(sub as OrgSubscription | null);
      setUserCount(typeof count === 'number' ? count : null);
      setLoading(false);
    })();
  }, [organizationId]);

  if (loading) return <Skeleton className="h-40 w-full" />;

  const plan = subscription?.plan;
  const remaining = subscription?.trial_ends_at ? daysRemaining(subscription.trial_ends_at) : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Your trial</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          User limits come from your subscription plan, not a number you typed at registration.
        </p>
      </div>

      {plan ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-serif text-lg font-bold">{plan.name} Trial</span>
          </div>
          {remaining !== null && (
            <p className="mt-1 text-sm text-muted-foreground">{remaining} day{remaining === 1 ? '' : 's'} remaining</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted-foreground">Users</p>
              <p className="font-semibold">{userCount ?? '—'} / {plan.max_users ?? 'Unlimited'}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted-foreground">Storage</p>
              <p className="font-semibold">{plan.storage_gb ? `${plan.storage_gb} GB` : 'Unlimited'}</p>
            </div>
          </div>
          {plan.features?.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No subscription found — contact support if this looks wrong.</p>
      )}
    </div>
  );
}
