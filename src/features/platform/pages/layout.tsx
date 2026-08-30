'use client';

import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Ship,
  LogOut,
  Building2,
  Users,
  ScrollText,
  Activity,
  ShieldCheck,
  LayoutDashboard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  CreditCard,
  Tag,
  Bell,
  Settings,
  CheckCircle2,
  LineChart,
  BarChart3,
  LifeBuoy,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { usePlatformNotifications } from '@/shared/hooks/use-platform-notifications';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/shared/components/ui/sheet';
import { PlatformSearch } from '@/features/platform/components/platform-search';
import { ThemeToggle } from '@/shared/components/theme-toggle';

/** Live onboarding signals (orgs with no admin, invites/trials expiring
 *  soon) from usePlatformNotifications — the badge clears when the
 *  underlying thing is resolved, not on a "mark as read" click. */
function PlatformNotificationsBell() {
  const { items, total, loading } = usePlatformNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
          aria-label={total > 0 ? `Notifications (${total})` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {total > 9 ? '9+' : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">Notifications</p>
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `${total} item${total === 1 ? '' : 's'} need attention`
              : 'Onboarding & billing signals'}
          </p>
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground">No outstanding items right now.</p>
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.key} asChild className="cursor-pointer">
              <Link to={item.href} className="flex items-start gap-3 py-2">
                <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-xs font-semibold text-destructive">
                  {item.count}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium leading-tight">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
import type { Profile } from '@/shared/types';

type NavItem = { href: string; label: string; icon: typeof Building2 };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Tenancy',
    items: [
      { href: '/platform/organizations', label: 'Organizations', icon: Building2 },
      { href: '/platform/organization-users', label: 'Organization Users', icon: Users },
      { href: '/platform/subscriptions', label: 'Subscriptions', icon: CreditCard },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/platform/billing', label: 'Billing', icon: CreditCard },
      { href: '/platform/revenue-analytics', label: 'Revenue Analytics', icon: LineChart },
      { href: '/platform/platform-analytics', label: 'Platform Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/platform/support-tickets', label: 'Support Tickets', icon: LifeBuoy },
      { href: '/platform/audit-logs', label: 'Audit Logs', icon: ScrollText },
      { href: '/platform/system-health', label: 'System Health', icon: Activity },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { href: '/platform/plans-pricing', label: 'Plans & Pricing', icon: Tag },
      { href: '/platform/platform-users', label: 'Platform Users', icon: ShieldCheck },
      { href: '/platform/settings', label: 'Platform Settings', icon: Settings },
    ],
  },
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
  collapsed = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  /** Icon-only mode — always false for the mobile Sheet (an overlay has
   *  room to spare; collapsing only makes sense for the persistent
   *  desktop rail). Labels/group headers hide, a native `title`
   *  attribute stands in for a tooltip. */
  collapsed?: boolean;
}) {
  const isDashboard = pathname === '/platform';

  return (
    <>
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-6')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent shadow-sm shadow-sidebar-accent/30">
          <Ship className="h-[18px] w-[18px] text-sidebar" strokeWidth={2.25} />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate font-serif text-lg font-bold leading-none tracking-tight text-sidebar-foreground">
              The Manifest
            </span>
            <span className="mt-1.5 truncate text-xs font-medium uppercase tracking-[0.08em] text-sidebar-muted">
              Platform Console
            </span>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-4">
        <Link
          to="/platform"
          onClick={onNavigate}
          title={collapsed ? 'Dashboard' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            collapsed && 'justify-center px-0',
            isDashboard
              ? 'bg-sidebar-hover text-sidebar-accent'
              : 'text-sidebar-muted hover:bg-sidebar-hover/60 hover:text-sidebar-foreground'
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!collapsed && 'Dashboard'}
        </Link>

        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted/80">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      active
                        ? 'bg-sidebar-hover text-sidebar-accent'
                        : 'text-sidebar-muted hover:bg-sidebar-hover/60 hover:text-sidebar-foreground'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-accent" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="shrink-0 border-t border-sidebar-border px-6 py-3">
          <p className="text-[11px] font-medium text-sidebar-muted/70">
            Platform Console · v1.0
          </p>
        </div>
      )}
    </>
  );
}

/**
 * The account control, lifted out of the sidebar and into the top bar's
 * right edge. Shared by the header on every platform page.
 */
function UserMenu({
  profile,
  onSignOut,
}: {
  profile: Profile;
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto gap-2.5 px-2 py-1.5 hover:bg-accent"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-sidebar-accent/15 text-xs font-semibold text-sidebar-accent">
              {initials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start gap-0.5 overflow-hidden sm:flex">
            <span className="max-w-[140px] truncate text-sm font-medium leading-none">
              {profile.full_name}
            </span>
            <span className="text-xs text-muted-foreground">Platform Admin</span>
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
          <Link to="/platform/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Shell for the platform_admin-only console. Deliberately not the tenant
 * Sidebar: a platform_admin isn't scoped to one organization's branches,
 * shipments, customers, etc., so none of that nav applies here. This is a
 * separate top-level route group precisely to keep platform operations
 * and tenant operations visually and structurally apart.
 */
const SIDEBAR_COLLAPSED_KEY = 'platform-sidebar-collapsed';

export default function PlatformLayout() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      // Corrupt/inaccessible storage just means the sidebar starts expanded.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Best-effort persistence — a failed write just won't survive a reload.
      }
      return next;
    });
  };

  useEffect(() => {
    if (loading) return;
    if (profile && profile.role !== 'platform_admin') {
      navigate('/dashboard', { replace: true });
      return;
    }
    // A platform user created via "Add platform user" signs in with an
    // admin-set temporary password — same forced-change gate the tenant
    // shell (src/pages/app/layout.tsx) already applies, just missing here
    // until now. /change-password is a separate top-level route, so
    // this layout unmounts once redirected — no loop to guard against.
    if (profile?.must_change_password) {
      navigate('/change-password', { replace: true });
    }
  }, [loading, profile, navigate]);

  if (
    loading ||
    !user ||
    !profile ||
    profile.role !== 'platform_admin' ||
    profile.must_change_password
  ) {
    return (
      <div className="platform-light-theme flex h-screen items-center justify-center bg-background">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="platform-light-theme flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'relative hidden h-screen shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        <SidebarContent pathname={location.pathname} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-20 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:flex"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* h-16 matches the sidebar's logo block so both bottom borders sit
            on the same line across the sidebar and the main column. */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">Platform navigation</SheetTitle>
              <SidebarContent
                pathname={location.pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <PlatformSearch />
          </div>
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
            <PlatformNotificationsBell />
            <UserMenu profile={profile} onSignOut={signOut} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
