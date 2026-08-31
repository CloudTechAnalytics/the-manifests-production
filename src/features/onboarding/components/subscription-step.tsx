'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Sparkles, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { daysRemaining, formatCurrency } from '@/shared/lib/utils/status';
import { getErrorMessage } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import * as onboardingService from '@/features/onboarding/services/onboarding.service';
import type { Plan } from '@/shared/types';

/**
 * Onboarding step 5 — spec sections 12/27. Reads org_subscriptions/plans
 * directly, now that migration 064 grants an org a read-only view of its
 * own row.
 *
 * Also the answer to "why does a company have to start on a free trial —
 * what if they just want to pay and sign up directly?": they don't have
 * to. provision_organization always creates the org on the Trial plan so
 * there's something for them to log into immediately after email
 * verification (payment itself needs an authenticated session + an
 * organization_id to attach the transaction to — it can't happen before
 * the account exists), but this is the very first screen after that, and
 * paying here converts trial -> active on the spot via the same
 * initialize-payment/Paystack checkout /upgrade uses. A company that
 * already knows what it wants never has to actually wait out the trial.
 */
export function SubscriptionStep({ organizationId }: { organizationId: string }) {
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['onboarding-subscription-step', organizationId],
    queryFn: () => onboardingService.fetchSubscriptionStepData(organizationId),
  });
  const subscription = data?.subscription ?? null;
  const userCount = data?.userCount ?? null;
  const plans = data?.plans ?? [];

  const subscribeMutation = useMutation({
    mutationFn: (plan: Plan) => onboardingService.initializeOnboardingPayment(plan.id, 'monthly'),
    onSuccess: (result) => {
      // Full redirect, not a new tab — Paystack's own callback_url brings
      // the browser straight back to /billing/callback when done.
      window.location.href = result.authorization_url;
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to start checkout'));
      setPayingPlanId(null);
    },
  });

  const handleSubscribe = (plan: Plan) => {
    setPayingPlanId(plan.id);
    subscribeMutation.mutate(plan);
  };

  if (loading) return <Skeleton className="h-40 w-full" />;

  const plan = subscription?.plan;
  const remaining = subscription?.trial_ends_at ? daysRemaining(subscription.trial_ends_at) : null;
  const onTrial = subscription?.status === 'trial';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">
          {onTrial ? 'Your trial' : 'Your subscription'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          User limits come from your subscription plan, not a number you typed at registration.
        </p>
      </div>

      {plan ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-serif text-lg font-bold">
              {plan.name} {onTrial ? 'Trial' : ''}
            </span>
          </div>
          {onTrial && remaining !== null && (
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

      {onTrial && plans.length > 0 && (
        <div className="space-y-3 border-t border-border pt-5">
          <div>
            <p className="text-sm font-medium">Already know what you need?</p>
            <p className="text-xs text-muted-foreground">
              Skip the trial and subscribe now — your plan activates immediately, no waiting.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <p className="font-serif font-bold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(p.monthly_price, p.currency)}/mo
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 w-full"
                    onClick={() => handleSubscribe(p)}
                    disabled={payingPlanId === p.id}
                  >
                    {payingPlanId === p.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Subscribe
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
