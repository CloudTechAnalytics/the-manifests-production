'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in app segment:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <h1 className="mt-4 font-serif text-xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This page hit an unexpected error and couldn&apos;t load. Your data is
        safe — try again, or head back to the dashboard.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild className="gap-1.5">
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" />
            Go to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
