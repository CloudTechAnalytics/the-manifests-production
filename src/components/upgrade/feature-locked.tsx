'use client';

import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Shown in place of a module's real content when the signed-in
 * organization's plan doesn't include the feature that guards it — either
 * a full route (app/(app)/layout.tsx) or a single settings tab (Webhooks).
 * Links to /upgrade with the feature name so that page's Contact Sales
 * mailto can reference what prompted the click.
 */
export function FeatureLocked({ feature, planName }: { feature: string; planName?: string | null }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="font-serif text-lg font-bold">{feature} isn&apos;t on your plan</h2>
          <p className="text-sm text-muted-foreground">
            {planName
              ? `Your organization is on the ${planName} plan, which doesn't include this module.`
              : "Your organization's current plan doesn't include this module."}{' '}
            Upgrade to unlock it.
          </p>
          <Button asChild className="mt-2">
            <Link to={`/upgrade?feature=${encodeURIComponent(feature)}`}>
              View plans
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
