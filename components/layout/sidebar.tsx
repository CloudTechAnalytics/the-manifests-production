'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FileText,
  Package,
  FolderOpen,
  BarChart3,
  TrendingUp,
  UserCog,
  Settings,
  Ship,
  LogOut,
  ChevronDown,
  Menu,
  Search,
  Radar,
  CalendarDays,
  Receipt,
  Wallet,
  CreditCard,
  Warehouse,
  ClipboardList,
  Building2,
  Bell,
  CheckCircle2,
  History,
  Landmark,
  FileSearch,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchContext } from '@/contexts/search-context';
import { useNotifications } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { UserRole } from '@/types';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  platformAdminOnly?: boolean;
  roles?: UserRole[];
};

const OPERATIONS_ROLES: UserRole[] = ['admin', 'branch_manager', 'operations'];
const SALES_ROLES: UserRole[] = ['admin', 'branch_manager', 'sales'];
const FINANCE_ROLES: UserRole[] = ['admin', 'branch_manager', 'finance'];
const CUSTOMS_ROLES: UserRole[] = ['admin', 'branch_manager', 'customs'];

// Professionally grouped navigation. Only real, existing routes are
// included — dead-end links are never added. `roles` restricts a track
// to the specialist roles that actually manage it (see the RBAC
// migrations) — omitted entirely means visible to every role, used for
// cross-cutting items like Dashboard/Documents/Reports/Activity Log.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/shipments', label: 'Shipments', icon: Package, roles: OPERATIONS_ROLES },
      { href: '/planning', label: 'Planning', icon: ClipboardList, roles: OPERATIONS_ROLES },
      { href: '/tracking', label: 'Tracking', icon: Radar, roles: OPERATIONS_ROLES },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, roles: OPERATIONS_ROLES },
      { href: '/customs', label: 'Customs', icon: Landmark, roles: CUSTOMS_ROLES },
      { href: '/terminal', label: 'Terminal', icon: Building2, roles: CUSTOMS_ROLES },
      { href: '/examination', label: 'Examination', icon: FileSearch, roles: CUSTOMS_ROLES },
      { href: '/transportation', label: 'Transportation', icon: Truck, roles: OPERATIONS_ROLES },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/quotations', label: 'Quotations', icon: FileText, roles: SALES_ROLES },
      { href: '/sales', label: 'Sales', icon: TrendingUp, roles: SALES_ROLES },
    ],
  },
  {
    label: 'Customers',
    items: [{ href: '/customers', label: 'Customers', icon: Users, roles: SALES_ROLES }],
  },
  {
    label: 'Finance',
    items: [
      { href: '/invoices', label: 'Invoices', icon: Receipt, roles: FINANCE_ROLES },
      { href: '/payments', label: 'Payments', icon: Wallet, roles: FINANCE_ROLES },
      { href: '/expenses', label: 'Expenses', icon: CreditCard, roles: FINANCE_ROLES },
    ],
  },
  {
    label: 'Operations Support',
    items: [
      { href: '/documents', label: 'Documents', icon: FolderOpen },
      { href: '/warehouse', label: 'Warehouse', icon: Warehouse, roles: OPERATIONS_ROLES },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/activity-log', label: 'Activity Log', icon: History },
    ],
  },
];

const administrationItems: NavItem[] = [
  { href: '/users', label: 'Users', icon: UserCog, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
  {
    href: '/platform',
    label: 'Platform Console',
    icon: Building2,
    platformAdminOnly: true,
  },
];

// Two-letter monogram from an organization name, used as its logo mark
// until real logo uploads exist.
function orgMonogram(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/** Compact brand for the mobile top bar: org monogram + name, same
 *  fallback as the sidebar Logo. */
function MobileBrand() {
  const { profile } = useAuth();
  const orgName = profile?.organization?.name;
  const logoUrl = profile?.organization?.logo_url;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={orgName ?? 'Organization logo'}
          className="h-7 w-7 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-gold">
          {orgName ? (
            <span className="text-xs font-bold text-brand-dark">{orgMonogram(orgName)}</span>
          ) : (
            <Ship className="h-3.5 w-3.5 text-brand-dark" strokeWidth={2.25} />
          )}
        </div>
      )}
      <span className="truncate font-serif text-base font-bold tracking-tight">
        {orgName ?? 'The Manifest'}
      </span>
    </div>
  );
}

/** Sidebar brand block. Shows the signed-in user's organization once it's
 *  loaded; falls back to the product identity while loading or for a user
 *  with no organization. */
function Logo() {
  const { profile } = useAuth();
  const orgName = profile?.organization?.name;
  const logoUrl = profile?.organization?.logo_url;

  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-brand-dark-border px-6">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={orgName ?? 'Organization logo'}
          className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-sm shadow-brand-gold/30"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gold shadow-sm shadow-brand-gold/30">
          {orgName ? (
            <span className="text-sm font-bold text-brand-dark">
              {orgMonogram(orgName)}
            </span>
          ) : (
            <Ship className="h-[18px] w-[18px] text-brand-dark" strokeWidth={2.25} />
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-serif text-base font-bold leading-tight tracking-tight text-brand-dark-foreground">
          {orgName ?? 'The Manifest'}
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-brand-dark-muted">
          Freight Management
        </span>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  role,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  role?: string;
  onNavigate?: () => void;
}) {
  const visibleItems = items.filter((item) => {
    if (item.adminOnly && role !== 'admin') return false;
    if (item.platformAdminOnly && role !== 'platform_admin') return false;
    if (item.roles && !item.roles.includes(role as UserRole)) return false;
    return true;
  });

  // A role with no access to any item in a track-specific group (e.g.
  // Finance, for an operations user) shouldn't show a floating heading
  // with nothing underneath it.
  if (visibleItems.length === 0) return null;

  return (
    <div>
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-dark-muted/80">
        {label}
      </p>
      <div className="space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
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
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile } = useAuth();

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto scrollbar-thin px-3 py-4">
      <div className="space-y-5">
        {navGroups.map((group) => (
          <NavGroup
            key={group.label}
            label={group.label}
            items={group.items}
            pathname={pathname}
            role={profile?.role}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      {/* Flexible spacer pushes "Administration" down toward the bottom */}
      <div className="min-h-8 flex-1" />
      <NavGroup
        label="Administration"
        items={administrationItems}
        pathname={pathname}
        role={profile?.role}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function UserMenu() {
  const { profile, signOut } = useAuth();

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '??';

  const roleLabel = profile?.role?.replace('_', ' ') ?? '';

  return (
    <div className="border-t border-brand-dark-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-2 py-2 text-brand-dark-foreground hover:bg-brand-dark-elevated hover:text-brand-dark-foreground"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-brand-gold/15 text-xs font-semibold text-brand-gold-soft">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
              <span className="w-full truncate text-sm font-medium leading-none text-left">
                {profile?.full_name}
              </span>
              <span className="text-xs capitalize text-brand-dark-muted">
                {roleLabel}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-brand-dark-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{profile?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.email}
            </p>
            {profile?.branch && (
              <Badge variant="secondary" className="mt-1.5 text-[10px]">
                {profile.branch.name}
              </Badge>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut()}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Version footer pinned to the bottom of the sidebar on every page. */
function SidebarFooter() {
  return (
    <div className="shrink-0 border-t border-brand-dark-border px-6 py-3">
      <p className="text-[11px] font-medium text-brand-dark-muted/70">
        The Manifest · v1.0
      </p>
    </div>
  );
}

/** Desktop, always-visible sidebar (lg and up). Permanently dark, regardless
 *  of the app's light/dark theme setting — a fixed brand identity element.
 *  The account control lives in the TopBar now, not here. */
export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col bg-brand-dark lg:flex">
      <Logo />
      <NavLinks />
      <SidebarFooter />
    </aside>
  );
}

/** Light-themed account dropdown for the top bar (the sidebar's own
 *  UserMenu is styled for the dark sidebar and stays in the mobile drawer). */
function HeaderUserMenu() {
  const { profile, signOut } = useAuth();

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '??';
  const roleLabel = profile?.role?.replace('_', ' ') ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2.5 px-2 py-1.5 hover:bg-accent">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-brand-gold/15 text-xs font-semibold text-brand-gold-soft">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start gap-0.5 overflow-hidden sm:flex">
            <span className="max-w-[140px] truncate text-sm font-medium leading-none">
              {profile?.full_name}
            </span>
            <span className="text-xs capitalize text-muted-foreground">{roleLabel}</span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{profile?.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
          {profile?.branch && (
            <Badge variant="secondary" className="mt-1.5 text-[10px]">
              {profile.branch.name}
            </Badge>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Notifications bell: live operational signals (delayed shipments,
 *  paperwork due, quotations awaiting response) from useNotifications.
 *  The badge reflects outstanding work and clears when the work is done. */
function NotificationsBell() {
  const { items, total, loading } = useNotifications();

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
              : 'Outstanding operational items'}
          </p>
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground">
              No outstanding items right now.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.key} asChild className="cursor-pointer">
              <Link href={item.href} className="flex items-start gap-3 py-2">
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

/** Desktop top bar (lg and up): global search on the left, notifications
 *  and the account menu on the right. h-16 matches the sidebar's logo block
 *  so both bottom borders line up across the shell. */
export function TopBar() {
  const { openSearch } = useSearchContext();

  return (
    <header className="hidden h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-6 lg:flex">
      <button
        type="button"
        onClick={openSearch}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
          Ctrl K
        </kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <NotificationsBell />
        <HeaderUserMenu />
      </div>
    </header>
  );
}

/** Mobile top bar with hamburger-triggered drawer nav (below lg). */
export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const { openSearch } = useSearchContext();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="-ml-2">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col bg-brand-dark p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Logo />
          <NavLinks onNavigate={() => setOpen(false)} />
          <UserMenu />
          <SidebarFooter />
        </SheetContent>
      </Sheet>
      <MobileBrand />
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        onClick={openSearch}
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </Button>
    </header>
  );
}
