import { supabase } from '@/shared/lib/supabase/client';
import type { BillingCycle, Plan } from '@/shared/types';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Data-access layer for the billing feature — plain wrappers around the
 * raw supabase/fetch calls that used to live inline in upgrade/page.tsx
 * and billing/callback/page.tsx. No React, no state.
 */

/** upgrade/page.tsx — the public, purchasable plan list. */
export async function fetchPublicPlans(): Promise<Plan[]> {
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  return (data ?? []) as Plan[];
}

/** upgrade/page.tsx's "Subscribe now" action — starts a Paystack hosted checkout. */
export async function initializePayment(
  planId: string,
  cycle: BillingCycle
): Promise<{ authorization_url: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetch(`${FUNCTIONS_URL}/initialize-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ plan_id: planId, billing_cycle: cycle }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Failed to start checkout');
  return result;
}

export interface VerifyPaymentResult {
  status: 'success' | 'already_processed' | 'amount_mismatch' | string;
}

/** billing/callback/page.tsx — confirms a Paystack checkout attempt on return. */
export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Your session has expired. Please sign in and check Settings for your payment status.');
  }

  const response = await fetch(`${FUNCTIONS_URL}/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ reference }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not verify payment');
  return result;
}
