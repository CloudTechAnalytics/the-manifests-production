'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Menu,
  CreditCard,
  Tag,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
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
import type { Profile } from '@/types';

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
    label: 'Operations',
    items: [
      { href: '/platform/audit-logs', label: 'Audit Logs', icon: ScrollText },
      { href: '/platform/system-health', label: 'System Health', icon: Activity },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { href: '/platform/plans-pricing', label: 'Plans & Pricing', icon: Tag },
      { href: '/platform/platform-users', label: 'Platform Users', icon: ShieldCheck },
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
  profile,
  pathname,
  onNavigate,
  onSignOut,
}: {
  profile: Profile;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  const isDashboard = pathname === '/platform';

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-brand-dark-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gold shadow-sm shadow-brand-gold/30">
          <Ship className="h-[18px] w-[18px] text-brand-dark" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col">
          <span className="font-serif text-lg font-bold leading-none tracking-tight text-brand-dark-foreground">
            The Manifest
          </span>
          <span className="mt-1.5 text-xs font-medium uppercase tracking-[0.08em] text-brand-dark-muted">
            Platform Console
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto scrollbar-thin px-3 py-4">
        <Link
          href="/platform"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isDashboard
              ? 'bg-brand-dark-elevated text-brand-gold-soft'
              : 'text-brand-dark-muted hover:bg-brand-dark-elevated/60 hover:text-brand-dark-foreground'
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </Link>

        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-dark-muted/80">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-dark-elevated text-brand-gold-soft'
                        : 'text-brand-dark-muted hover:bg-brand-dark-elevated/60 hover:text-brand-dark-foreground'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-gold" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-brand-dark-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-2 py-2 text-brand-dark-foreground hover:bg-brand-dark-elevated hover:text-brand-dark-foreground"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-brand-gold/15 text-xs font-semibold text-brand-gold-soft">
                  {initials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
                <span className="w-full truncate text-left text-sm font-medium leading-none">
                  {profile.full_name}
                </span>
                <span className="text-xs text-brand-dark-muted">Platform Admin</span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-brand-dark-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
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
      </div>
    </>
  );
}

/**
 * Shell for the platform_admin-only console. Deliberately not the tenant
 * Sidebar: a platform_admin isn't scoped to one organization's branches,
 * shipments, customers, etc., so none of that nav applies here. This is a
 * separate top-level route group precisely to keep platform operations
 * and tenant operations visually and structurally apart.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'platform_admin') {
      router.replace('/dashboard');
    }
  }, [loading, user, profile, router]);

  if (loading || !user || !profile || profile.role !== 'platform_admin') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  const activeGroup = navGroups.find((g) =>
    g.items.some((i) => pathname.startsWith(i.href))
  );
  const activeItem = activeGroup?.items.find((i) => pathname.startsWith(i.href));
  const isDashboard = pathname === '/platform';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col bg-brand-dark lg:flex">
        <SidebarContent profile={profile} pathname={pathname} onSignOut={signOut} />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-brand-dark p-0">
              <SheetTitle className="sr-only">Platform navigation</SheetTitle>
              <SidebarContent
                profile={profile}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                onSignOut={signOut}
              />
            </SheetContent>
          </Sheet>
          <p className="text-sm text-muted-foreground">
            {activeItem?.label ?? (isDashboard ? 'Dashboard' : 'Platform Console')}
          </p>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
