import { supabase } from '@/shared/lib/supabase/client';
import type { RegisterFormValues } from '@/shared/lib/register-schema';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_HEADERS = {
  'Content-Type': 'application/json',
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

/**
 * Data-access layer for the auth feature — plain wrappers around the raw
 * supabase.auth calls and fetch() edge-function calls that used to live
 * inline in the page components. No React, no state; every function
 * preserves the exact parameters/branching/error-shape of the code it was
 * extracted from.
 */

interface RegisterResponse {
  success: boolean;
  error?: string;
  emailed?: boolean;
  link?: string;
  similar_name_warning?: boolean;
}

/** register/page.tsx's initial submit — calls the public register-organization edge function. */
export async function registerOrganization(values: RegisterFormValues): Promise<RegisterResponse> {
  const response = await fetch(`${FUNCTIONS_URL}/register-organization`, {
    method: 'POST',
    headers: ANON_HEADERS,
    body: JSON.stringify(values),
  });
  const data = (await response.json().catch(() => ({}))) as RegisterResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? `Registration failed (${response.status})`);
  }
  return data;
}

/** register/page.tsx's "resend verification email" action (post-submit screen). */
export async function resendVerificationEmail(email: string): Promise<RegisterResponse> {
  const response = await fetch(`${FUNCTIONS_URL}/resend-verification`, {
    method: 'POST',
    headers: ANON_HEADERS,
    body: JSON.stringify({ email }),
  });
  const data = (await response.json().catch(() => ({}))) as RegisterResponse;
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to resend verification email');
  }
  return data;
}

/**
 * login/page.tsx's "resend verification" action — fire-and-forget, the
 * response is intentionally not inspected (matches the original behavior:
 * a generic success toast is always shown regardless of outcome, so the
 * endpoint can't be used to probe which emails exist).
 */
export async function resendVerificationEmailSilently(email: string): Promise<void> {
  await fetch(`${FUNCTIONS_URL}/resend-verification`, {
    method: 'POST',
    headers: ANON_HEADERS,
    body: JSON.stringify({ email: email.trim() }),
  });
}

/** verify-email/page.tsx — consumes the emailed verification link. */
export async function verifyEmail(token: string): Promise<{ email?: string }> {
  const response = await fetch(`${FUNCTIONS_URL}/verify-email`, {
    method: 'POST',
    headers: ANON_HEADERS,
    body: JSON.stringify({ token }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? 'This verification link is invalid or has expired.');
  }
  return { email: data.email };
}

/** accept-invite/page.tsx — redeems an invite token, creating the account. */
export async function acceptInvite(
  token: string,
  password: string,
  fullName: string
): Promise<{ email: string }> {
  const response = await fetch(`${FUNCTIONS_URL}/accept-invite`, {
    method: 'POST',
    headers: ANON_HEADERS,
    body: JSON.stringify({
      token,
      password,
      full_name: fullName.trim() || undefined,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(result.error ?? `Request failed (${response.status})`);
  }
  return { email: result.email as string };
}

/**
 * change-password/page.tsx — updates the Supabase Auth password, then
 * clears the profiles.must_change_password flag. Mirrors the two
 * sequential calls (and their distinct error messages) from the original
 * inline implementation exactly.
 */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', userId);

  if (profileError) {
    throw new Error('Password updated but profile flag not cleared. Please contact admin.');
  }
}
