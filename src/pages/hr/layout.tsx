'use client';

import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Users2,
  LayoutDashboard,
  IdCard,
  Gauge,
  Building2,
  Boxes,
  GraduationCap,
  ArrowLeft,
  ChevronDown,
  LogOut,
  Menu,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useOrgPlan } from '@/hooks/use-org-plan';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { FeatureLocked } from '@/components/upgrade/feature-locked';
import type { Profile, UserRole } from '@/types';

/**
 * A fully separate workspace from the main tenant shell
 * (components/layout/sidebar.tsx) — its own branding, its own nav, its
 * own "Back to Workspace" link — reached via "HR Workspace" in the
 * account dropdown (see UserMenu/HeaderUserMenu in the tenant sidebar).
 * This mirrors app/platform/layout.tsx's shape (a self-contained shell
 * with its own auth gate) rather than nesting under app/(app)/layout.tsx,
 * since app/hr lives outside the (app) route group.
 *
 * URLs are unaffected by that move: (app) is an invisible Next.js route
 * group, so app/(app)/hr/dashboard/page.tsx and app/hr/dashboard/page.tsx
 * both serve at the exact same /hr/dashboard.
 */
const HR_ROLES: UserRole[] = ['admin', 'branch_manager', 'hr_manager', 'hr_officer'];

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; roles?: UserRole[] };

const navItems: NavItem[] = [
  { href: '/hr/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: HR_ROLES },
  { href: '/hr/employees', label: 'Employees', icon: IdCard, roles: HR_ROLES },
  { href: '/hr/capacity', label: 'People Capacity', icon: Gauge, roles: HR_ROLES },
  { href: '/hr/capacity/departments', label: 'Department Capacity', icon: Building2, roles: HR_ROLES },
  { href: '/hr/capacity/branches', label: 'Branch Capacity', icon: Boxes, roles: HR_ROLES },
  // No role restriction — every employee can browse the catalog and
  // self-enroll ("My Learning" is a link on this page, not a separate
  // nav entry), same as the module had in the tenant sidebar.
  { href: '/hr/training', label: 'Training', icon: GraduationCap },
];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function SidebarContent({
  pathname,
  onNavigate,
  hasRole,
  orgName,
}: {
  pathname: string;
  onNavigate?: () => void;
  hasRole: (role: UserRole) => boolean;
  orgName?: string | null;
}) {
  const visibleItems = navItems.filter((item) => !item.roles || item.roles.some(hasRole));

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent shadow-sm shadow-sidebar-accent/30">
          <Users2 className="h-[18px] w-[18px] text-sidebar" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="truncate font-serif text-lg font-bold leading-none tracking-tight text-sidebar-foreground">
            HR Workspace
          </span>
          {orgName && (
            <span className="mt-1.5 truncate text-xs font-medium uppercase tracking-[0.08em] text-sidebar-muted">
              {orgName}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-sidebar-border px-3 py-3">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover/60 hover:text-sidebar-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to Workspace
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-4">
        {visibleItems.map((item) => {
          const active =
            item.href === '/hr/capacity' ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-hover text-sidebar-accent'
                  : 'text-sidebar-muted hover:bg-sidebar-hover/60 hover:text-sidebar-foreground'
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-accent" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border px-6 py-3">
        <p className="text-[11px] font-medium text-sidebar-muted/70">HR Workspace · v1.0</p>
      </div>
    </>
  );
}

function UserMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2.5 px-2 py-1.5 hover:bg-accent">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-sidebar-accent/15 text-xs font-semibold text-sidebar-accent">
              {initials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start gap-0.5 overflow-hidden sm:flex">
            <span className="max-w-[140px] truncate text-sm font-medium leading-none">
              {profile.full_name}
            </span>
            <span className="text-xs text-muted-foreground">{profile.role.replace(/_/g, ' ')}</span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{profile.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// "Not signed in" is handled one level up by <RequireAuth> — this
// only needs its own shell-specific rule: a platform_admin has no
// organization_id, so HR Workspace isn't their workspace at all, same
// reasoning as the main tenant shell bouncing them to /platform.
export default function HrLayout() {
  const { user, profile, loading, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasFeature, planName, loading: planLoading } = useOrgPlan();

  useEffect(() => {
    if (loading) return;
    if (profile && profile.role === 'platform_admin') {
      navigate('/platform', { replace: true });
      return;
    }
    if (profile?.must_change_password) {
      navigate('/change-password', { replace: true });
    }
  }, [loading, profile, navigate]);

  if (
    loading ||
    !user ||
    !profile ||
    profile.role === 'platform_admin' ||
    profile.must_change_password
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  const locked = !planLoading && !hasFeature('HR & People Management');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="relative hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <SidebarContent pathname={location.pathname} hasRole={hasRole} orgName={profile.organization?.name} />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">HR Workspace navigation</SheetTitle>
              <SidebarContent
                pathname={location.pathname}
                onNavigate={() => setMobileOpen(false)}
                hasRole={hasRole}
                orgName={profile.organization?.name}
              />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1" />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label="Refresh"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <UserMenu profile={profile} onSignOut={signOut} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6 lg:p-8">
          {locked ? <FeatureLocked feature="HR & People Management" planName={planName} /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
