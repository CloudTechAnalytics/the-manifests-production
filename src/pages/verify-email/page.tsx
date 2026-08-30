'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Ship, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/utils';

type State = 'verifying' | 'success' | 'error';

/**
 * Consumes the emailed verification link (spec section 6). No session is
 * handed back by verify-email — same reasoning accept-invite's own
 * "sign-in didn't chain, go to /login" fallback already uses: redirect to
 * /login with the email prefilled rather than trying to smuggle a session
 * out of an edge function.
 */
function VerifyEmailContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<State>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({ token }),
          }
        );
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !data.success) {
          setState('error');
          setMessage(data.error ?? 'This verification link is invalid or has expired.');
          return;
        }

        setState('success');
        setTimeout(() => {
          navigate(`/login?verified=1${data.email ? `&email=${encodeURIComponent(data.email)}` : ''}`, { replace: true });
        }, 1800);
      } catch (err) {
        if (!cancelled) {
          setState('error');
          setMessage(getErrorMessage(err, 'Something went wrong verifying your email.'));
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sidebar-accent shadow-lg shadow-sidebar-accent/20">
            <Ship className="h-7 w-7 text-sidebar" strokeWidth={2.25} />
          </div>
          <h1 className="font-serif text-xl font-bold tracking-tight">The Manifest</h1>
        </div>

        {state === 'verifying' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Verifying your email…</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-800">Email verified</p>
            <p className="text-sm text-emerald-700">Redirecting you to sign in…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8">
            <XCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-foreground">{message}</p>
            <div className="flex w-full flex-col gap-2 pt-2">
              <Button asChild>
                <Link to="/register">Register again</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/login">Go to sign in</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <VerifyEmailContent />;
}
