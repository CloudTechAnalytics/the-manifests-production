'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference') ?? searchParams.get('trxref');
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setStatus('missing_reference');
      return;
    }
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (!session) throw new Error('Your session has expired. Please sign in and check Settings for your payment status.');

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-payment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({ reference }),
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Could not verify payment');

        if (result.status === 'success' || result.status === 'already_processed') {
          setStatus('success');
        } else {
          setStatus('failed');
          setMessage(
            result.status === 'amount_mismatch'
              ? 'This payment could not be verified. Please contact support before trying again.'
              : 'Paystack reported this payment was not completed.'
          );
        }
      } catch (err) {
        setStatus('failed');
        setMessage(err instanceof Error ? err.message : 'Could not verify payment');
      }
    })();
  }, [reference]);

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
                <Link href="/dashboard">Go to Dashboard</Link>
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
                <Link href="/upgrade">Back to plans</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingCallbackPage() {
  return (
    <Suspense fallback={null}>
      <BillingCallbackContent />
    </Suspense>
  );
}
