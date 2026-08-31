import { supabase } from '@/shared/lib/supabase/client';

/**
 * Shared caller for the platform console's privileged Supabase Edge
 * Functions (invite-user, create-user, create-platform-user,
 * delete-organization, …) — every one of these pages built its own
 * identical fetch-with-bearer-token boilerplate inline; this is that
 * boilerplate, extracted once. Throws with the exact message text the
 * inline versions used to toast (missing session / non-2xx / !success),
 * so callers can keep using `getErrorMessage(err, fallback)` in their
 * `onError` and see byte-for-byte the same copy as before.
 */
export async function callPlatformEdgeFunction<T = Record<string, unknown>>(
  path: string,
  body: unknown
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? `Request failed (${response.status})`);
  }

  return result as T;
}
