'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Ship, Loader2 } from 'lucide-react';
import { LandingPage } from '@/components/marketing/landing-page';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (profile?.must_change_password) {
      router.replace('/change-password');
    } else if (profile?.role === 'platform_admin') {
      // Platform admins are onboarding organizations, not running one —
      // send them straight to the console, same as the login page does.
      router.replace('/platform');
    } else {
      router.replace('/dashboard');
    }
  }, [loading, user, profile, router]);

  // Still resolving the session, or an authenticated user is mid-redirect
  // above — show a bare loading screen rather than flashing the landing
  // page at someone who's about to be sent to their dashboard.
  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <Ship className="h-7 w-7 text-primary-foreground" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return <LandingPage />;
}
