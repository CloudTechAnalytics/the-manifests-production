'use client';

import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import * as billingService from '@/features/billing/services/billing.service';

/**
 * Where Paystack's callback_url (set in initialize-payment) redirects the
 * browser back to after a checkout attempt, success or not. Paystack
 * appends `reference` (and `trxref`, the same value) as query params.
 *
 * Calls verify-payment for an immediate result rather than waiting on the
 * webhook — paystack-webhook still runs server-side regardless and is the
 * reliability backstop if the browser never makes it back here at all
 * (closed tab, network drop). Both call the same idempotent
 * verifyAndActivate, so whichever lands first is the one that counts.
 */
type Status = 'checking' | 'success' | 'failed' | 'missing_reference';

function BillingCallbackContent() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference') ?? searchParams.get('trxref');
  // Where initialize-payment was told to send the user back to (e.g.
  // /onboarding, when checkout started there instead of /upgrade) — only
  // trusts a same-app relative path, same guard the edge function itself
  // already applies before it ever reaches this URL.
  const rawReturnTo = searchParams.get('return_to');
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/dashboard';

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['billing-verify-payment', reference],
    queryFn: () => billingService.verifyPayment(reference as string),
    enabled: !!reference,
    retry: false,
  });

  let status: Status;
  let message: string | null = null;
  if (!reference) {
    status = 'missing_reference';
  } else if (isPending) {
    status = 'checking';
  } else if (isError) {
    status = 'failed';
    message = error instanceof Error ? error.message : 'Could not verify payment';
  } else if (data && (data.status === 'success' || data.status === 'already_processed')) {
    status = 'success';
  } else {
    status = 'failed';
    message = data?.status === 'amount_mismatch'
      ? 'This payment could not be verified. Please contact support before trying again.'
      : 'Paystack reported this payment was not completed.';
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          {status === 'checking' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <h1 className="font-serif text-lg font-bold">Confirming your payment…</h1>
              <p className="text-sm text-muted-foreground">This only takes a moment — don&apos;t close this page.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <h1 className="font-serif text-lg font-bold">Payment confirmed</h1>
              <p className="text-sm text-muted-foreground">Your plan is now active. A receipt has been emailed to you.</p>
              <Button asChild className="mt-2 w-full">
                <Link to={returnTo}>{returnTo === '/onboarding' ? 'Continue setup' : 'Go to Dashboard'}</Link>
              </Button>
            </>
          )}
          {(status === 'failed' || status === 'missing_reference') && (
            <>
              <XCircle className="h-10 w-10 text-destructive" />
              <h1 className="font-serif text-lg font-bold">Payment not confirmed</h1>
              <p className="text-sm text-muted-foreground">
                {status === 'missing_reference'
                  ? "We couldn't find a payment reference for this page."
                  : message ?? 'Something went wrong confirming this payment.'}
              </p>
              <Button asChild variant="outline" className="mt-2 w-full">
                <Link to="/upgrade">Back to plans</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingCallbackPage() {
  return <BillingCallbackContent />;
}
