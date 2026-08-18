'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/status';
import { CONTACT_EMAIL, CONTACT_PHONE_HREF } from '@/lib/contact';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Plan } from '@/types';

/**
 * Reached from the Users page's "reached your plan's user limit" banner
 * (spec section 11) and any other Upgrade Plan CTA. There's no billing
 * integration (see migration 018's docstring) — this is a comparison +
 * Contact Sales page, not a checkout; an actual plan change is still a
 * Platform Admin action (app/platform/subscriptions).
 */
export default function UpgradePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      setPlans((data ?? []) as Plan[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mt-6 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight">Upgrade your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose the plan that fits your team, or talk to sales about Enterprise pricing.
        </p>
      </div>

      {loading ? (
        <div className="mt-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-6">
                <div>
                  <h2 className="font-serif text-lg font-bold">{plan.name}</h2>
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                </div>
                <div>
                  <span className="font-serif text-2xl font-bold">
                    {plan.monthly_price > 0 ? formatCurrency(plan.monthly_price, plan.currency) : 'Contact us'}
                  </span>
                  {plan.monthly_price > 0 && <span className="text-xs text-muted-foreground">/month</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {plan.max_users ? `${plan.max_users} users` : 'Unlimited users'} &middot;{' '}
                  {plan.storage_gb ? `${plan.storage_gb} GB` : 'Unlimited storage'}
                </p>
                <ul className="flex-1 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="w-full">
                  <a href={`mailto:${CONTACT_EMAIL}?subject=Upgrade to ${encodeURIComponent(plan.name)}`}>
                    <Mail className="mr-1.5 h-4 w-4" />
                    Contact Sales
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Prefer to talk? Call <a href={`tel:${CONTACT_PHONE_HREF}`} className="underline">{CONTACT_PHONE_HREF}</a> or email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}
