import { useEffect } from 'react';
import { useRouteError, Link } from 'react-router-dom';
import { AlertTriangle, RotateCcw, Home, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shared React Router `errorElement` — replaces Next's per-segment
 * `error.tsx` (root) and `app/error.tsx` (tenant shell), which only
 * differed in where "go back" leads and how much vertical space they
 * claim (root fills the screen; the tenant-shell one sits inside a
 * sidebar/topbar that's still visible, so it only needs ~60vh).
 * React Router has no `reset()` — "Try again" just reloads, the same
 * recovery a broken render leaves anyway.
 */
export function RouteError({
  fullHeight = true,
  homeHref = '/',
  homeLabel = 'Go home',
}: {
  fullHeight?: boolean;
  homeHref?: string;
  homeLabel?: string;
}) {
  const error = useRouteError();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Unhandled route error:', error);
  }, [error]);

  const HomeIcon = homeHref === '/dashboard' ? LayoutDashboard : Home;

  return (
    <div
      className={
        fullHeight
          ? 'flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center'
          : 'flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center'
      }
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/12">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h1 className="mt-4 font-serif text-xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {fullHeight
          ? 'We hit an unexpected error loading this page. Try again, or head back to the homepage.'
          : "This page hit an unexpected error and couldn't load. Your data is safe — try again, or head back to the dashboard."}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => window.location.reload()} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild className="gap-1.5">
          <Link to={homeHref}>
            <HomeIcon className="h-4 w-4" />
            {homeLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
