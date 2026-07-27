'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { SearchProvider } from '@/contexts/search-context';
import { Sidebar, MobileTopBar, TopBar } from '@/components/layout/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

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

  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <TopBar />
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            {children}
          </main>
        </div>
      </div>
    </SearchProvider>
  );
}
