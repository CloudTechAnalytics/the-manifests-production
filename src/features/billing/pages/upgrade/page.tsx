'use client';

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Loader2, Mail, Lock, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/auth-context';
import { formatCurrency } from '@/shared/lib/utils/status';
import { CONTACT_EMAIL, CONTACT_PHONE_HREF } from '@/shared/lib/contact';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn, getErrorMessage } from '@/shared/lib/utils';
import { diffPlanFeatures } from '@/shared/lib/plans';
import * as billingService from '@/features/billing/services/billing.service';
import type { Plan, BillingCycle } from '@/shared/types';

/**
 * Reached from the Users page's "reached your plan's user limit" banner
 * (spec section 11), a locked module (components/upgrade/feature-locked.tsx,
 * carrying ?feature=), and any other Upgrade Plan CTA. An org's own admin
 * or branch_manager can pay for a plan directly here (initialize-payment ->
 * Paystack hosted checkout -> app/billing/callback verifies and activates
 * it) — everyone else sees the same comparison with Contact Sales instead,
 * same as a signed-out visitor would (this page requires auth to load plan
 * data at all — RLS on `plans` is `TO authenticated`).
 */
function UpgradePageContent() {
  const [searchParams] = useSearchParams();
  const requestedFeature = searchParams.get('feature');
  const { profile } = useAuth();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);

  const canPay = profile?.role === 'admin' || profile?.role === 'branch_manager';

  const { data: plans = [], isLoading: loading } = useQuery({
    queryKey: ['billing-public-plans'],
    queryFn: () => billingService.fetchPublicPlans(),
  });

  const subscribeMutation = useMutation({
    mutationFn: (plan: Plan) => billingService.initializePayment(plan.id, cycle),
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mt-6 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight">Upgrade your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose the plan that fits your team, or talk to sales about custom pricing.
        </p>
        {requestedFeature && (
          <p className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Looking for {requestedFeature}? It&apos;s included in the plans below.
          </p>
        )}
        {!loading && (
          <div className="mx-auto mt-6 inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {(['monthly', 'annual'] as BillingCycle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                  cycle === c ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c}
                {c === 'annual' && <span className="ml-1 text-xs text-primary">save 2 months</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {plans.map((plan, i) => {
            const price = cycle === 'annual' ? plan.annual_price : plan.monthly_price;
            const featureDisplay = diffPlanFeatures(plans)[i];
            return (
              <Card key={plan.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-6">
                  <div>
                    <h2 className="font-serif text-lg font-bold">{plan.name}</h2>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold">
                      {price && price > 0 ? formatCurrency(price, plan.currency) : 'Contact us'}
                    </span>
                    {!!price && price > 0 && (
                      <span className="text-xs text-muted-foreground">/{cycle === 'annual' ? 'year' : 'month'}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.max_users ? `${plan.max_users} users` : 'Unlimited users'} &middot;{' '}
                    {plan.storage_gb ? `${plan.storage_gb} GB` : 'Unlimited storage'}
                  </p>
                  <div className="flex-1 space-y-1.5">
                    {featureDisplay.baseName && (
                      <p className="text-xs font-medium text-muted-foreground">
                        Everything in {featureDisplay.baseName}, plus:
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {featureDisplay.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {canPay && price && price > 0 ? (
                    <Button
                      className="w-full"
                      onClick={() => handleSubscribe(plan)}
                      disabled={payingPlanId === plan.id}
                    >
                      {payingPlanId === plan.id ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="mr-1.5 h-4 w-4" />
                      )}
                      Subscribe now
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" className="w-full">
                    <a href={`mailto:${CONTACT_EMAIL}?subject=Upgrade to ${encodeURIComponent(plan.name)}`}>
                      <Mail className="mr-1.5 h-4 w-4" />
                      Contact Sales
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!canPay && !loading && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Only your organization&apos;s admin or branch manager can pay for a plan. Ask them, or contact sales below.
        </p>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Prefer to talk? Call <a href={`tel:${CONTACT_PHONE_HREF}`} className="underline">{CONTACT_PHONE_HREF}</a> or email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}

export default function UpgradePage() {
  return <UpgradePageContent />;
}
