import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Replaces lib/supabase/middleware.ts's redirect logic — that ran on
 * the server (Next middleware, one `auth.getUser()` revalidation per
 * request) against a PUBLIC_PATHS allowlist. There's no server here
 * any more (see the migration plan's grounding: auth was already
 * 100% client-side in contexts/auth-context.tsx, this was the one
 * genuinely server-side piece), so the same two rules — redirect to
 * /login if signed out, redirect to /dashboard if signed in and still
 * on /login — become a client-side check instead. The real security
 * boundary was always Postgres RLS, not this redirect; that's
 * completely unchanged by this move.
 */
function AuthLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return <Outlet />;
}

/** The inverse guard for /login itself — a signed-in visitor is bounced
 *  to /dashboard instead of seeing the login form again. */
export function RedirectIfAuthenticated() {
  const { user, loading } = useAuth();

  if (loading) return <AuthLoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
