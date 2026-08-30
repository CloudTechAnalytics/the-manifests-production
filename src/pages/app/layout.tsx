import { useEffect } from 'react';
import { useNavigate, useLocation, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { SearchProvider } from '@/contexts/search-context';
import { Sidebar, MobileTopBar, TopBar } from '@/components/layout/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrgPlan } from '@/hooks/use-org-plan';
import { featureForPath } from '@/lib/feature-gating';
import { FeatureLocked } from '@/components/upgrade/feature-locked';

// "Not signed in" is already handled one level up by <RequireAuth>
// (src/app/route-guards.tsx, wraps every authenticated route) — this
// layout only needs its own, shell-specific rule: a platform_admin
// isn't scoped to any single organization, so the tenant shell
// (shipments, quotations, warehouse…) is never their actual
// workspace — bounce them to the console regardless of how they
// arrived here.
export default function AppLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasFeature, planName, loading: planLoading } = useOrgPlan();

  useEffect(() => {
    if (!loading && profile && profile.role === 'platform_admin') {
      navigate('/platform', { replace: true });
    }
  }, [loading, profile, navigate]);

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

  if (profile?.must_change_password && !location.pathname.startsWith('/change-password')) {
    return <Navigate to="/change-password" replace />;
  }

  // Every module has a required feature (lib/feature-gating.ts) or none
  // (cross-cutting utilities like Dashboard/Calendar/Settings, always
  // open). planLoading holds off rendering the gate for an instant so a
  // fully-entitled org never flashes a "locked" screen while the plan is
  // still being fetched.
  const requiredFeature = featureForPath(location.pathname);
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
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </SearchProvider>
  );
}
