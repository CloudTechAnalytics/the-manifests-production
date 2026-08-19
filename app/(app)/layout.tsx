'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { SearchProvider } from '@/contexts/search-context';
import { Sidebar, MobileTopBar, TopBar } from '@/components/layout/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrgPlan } from '@/hooks/use-org-plan';
import { featureForPath } from '@/lib/feature-gating';
import { FeatureLocked } from '@/components/upgrade/feature-locked';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { hasFeature, planName, loading: planLoading } = useOrgPlan();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    // A platform_admin isn't scoped to any single organization, so the
    // tenant shell (shipments, quotations, warehouse…) is never their
    // actual workspace — bounce them to the console regardless of how
    // they arrived here (login redirect only covers the login form
    // itself, not history/bookmarks/direct navigation).
    if (!loading && profile && profile.role === 'platform_admin') {
      router.replace('/platform');
    }
  }, [loading, user, profile, router]);

  if (loading || !user || profile?.role === 'platform_admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  if (profile?.must_change_password) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/change-password')) {
      router.replace('/change-password');
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="space-y-4">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      );
    }
  }

  // Every module has a required feature (lib/feature-gating.ts) or none
  // (cross-cutting utilities like Dashboard/Calendar/Settings, always
  // open). planLoading holds off rendering the gate for an instant so a
  // fully-entitled org never flashes a "locked" screen while the plan is
  // still being fetched.
  const requiredFeature = featureForPath(pathname);
  const locked = requiredFeature && !planLoading && !hasFeature(requiredFeature);

  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <TopBar />
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            {locked && requiredFeature ? (
              <FeatureLocked feature={requiredFeature} planName={planName} />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </SearchProvider>
  );
}
