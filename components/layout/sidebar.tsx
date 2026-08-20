'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
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
  ChevronRight,
  Menu,
  Search,
  Radar,
  CalendarDays,
  Receipt,
  Wallet,
  CreditCard,
  Warehouse,
  ClipboardList,
  ListChecks,
  Building2,
  Network,
  Bell,
  CheckCircle2,
  History,
  ShieldAlert,
  ShieldCheck,
  Landmark,
  FileSearch,
  Truck,
  PackageCheck,
  Send,
  BadgeDollarSign,
  Sun,
  Moon,
  UserRound,
  Gauge,
  IdCard,
  Boxes,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchContext } from '@/contexts/search-context';
import { useNotifications } from '@/hooks/use-notifications';
import { useNavBadges, type NavBadgeCounts } from '@/hooks/use-nav-badges';
import { useOrgPlan } from '@/hooks/use-org-plan';
import { featureForPath } from '@/lib/feature-gating';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
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
import type { UserRole, AppNotification } from '@/types';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  platformAdminOnly?: boolean;
  roles?: UserRole[];
  /** Key into useNavBadges' counts — shown as a number beside the label,
   *  hidden entirely at 0. Omitted for items with no outstanding-work
   *  concept (Shipments, Customers, Settings, ...). */
  badgeKey?: keyof NavBadgeCounts;
};

// Every group below mirrors a stage of the freight-forwarding lifecycle
// (Customer -> Quotation -> Shipment -> Planning -> Documentation ->
// Customs -> Terminal -> Warehouse -> Transport -> Delivery -> Invoice ->
// Payment -> Reports), not a technical grouping of tables. `roles`
// restricts an item to the specialist roles that actually own it — a
// department role (documentation/customs/terminal/warehouse/transport)
// sees only its own lane plus Dashboard and Work Queue; admin and
// branch_manager see everything (branch_manager loses only Organization).
const OPERATIONS_ROLES: UserRole[] = ['admin', 'branch_manager', 'operations'];
const SALES_ROLES: UserRole[] = ['admin', 'branch_manager', 'sales'];
const FINANCE_ROLES: UserRole[] = ['admin', 'branch_manager', 'finance'];
const APPROVAL_ROLES: UserRole[] = ['admin', 'branch_manager'];
const WORK_QUEUE_ROLES: UserRole[] = [
  'admin',
  'branch_manager',
  'operations',
  'documentation',
  'customs',
  'terminal',
  'warehouse',
  'transport',
  'finance',
  'examination',
  'planning',
];
const HR_ROLES: UserRole[] = ['admin', 'branch_manager', 'hr_manager', 'hr_officer'];

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { href: '/planning', label: 'Planning Centre', icon: ClipboardList, roles: [...OPERATIONS_ROLES, 'planning'] },
      { href: '/shipments', label: 'Shipments', icon: Package, roles: OPERATIONS_ROLES },
      { href: '/tracking', label: 'Tracking', icon: Radar, roles: OPERATIONS_ROLES },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, roles: OPERATIONS_ROLES },
      { href: '/work-queue', label: 'Work Queue', icon: ListChecks, roles: WORK_QUEUE_ROLES },
    ],
  },
  {
    label: 'Clearance',
    items: [
      { href: '/documents', label: 'Documentation', icon: FolderOpen, roles: ['admin', 'branch_manager', 'documentation'], badgeKey: 'documentation' },
      { href: '/customs', label: 'Customs', icon: Landmark, roles: ['admin', 'branch_manager', 'customs'], badgeKey: 'customs' },
      { href: '/terminal', label: 'Terminal', icon: Building2, roles: ['admin', 'branch_manager', 'terminal'], badgeKey: 'terminal' },
      { href: '/examination', label: 'Examination', icon: FileSearch, roles: ['admin', 'branch_manager', 'examination'] },
      { href: '/terminal', label: 'Release', icon: PackageCheck, roles: ['admin', 'branch_manager', 'terminal'] },
    ],
  },
  {
    label: 'Logistics',
    items: [
      { href: '/warehouse', label: 'Warehouse', icon: Warehouse, roles: ['admin', 'branch_manager', 'warehouse'], badgeKey: 'warehouse' },
      { href: '/transportation', label: 'Transport', icon: Truck, roles: ['admin', 'branch_manager', 'transport'] },
      { href: '/transportation', label: 'Delivery', icon: Send, roles: ['admin', 'branch_manager', 'transport'] },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { href: '/customers', label: 'Customers', icon: Users, roles: SALES_ROLES },
      { href: '/quotations', label: 'Quotations', icon: FileText, roles: SALES_ROLES },
      { href: '/rates', label: 'Rate Cards', icon: BadgeDollarSign, roles: SALES_ROLES },
      { href: '/sales', label: 'Sales', icon: TrendingUp, roles: SALES_ROLES },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/invoices', label: 'Invoices', icon: Receipt, roles: FINANCE_ROLES, badgeKey: 'invoices' },
      { href: '/payments', label: 'Payments', icon: Wallet, roles: FINANCE_ROLES },
      { href: '/expenses', label: 'Expenses', icon: CreditCard, roles: FINANCE_ROLES },
      { href: '/approvals', label: 'Approvals', icon: ShieldCheck, roles: APPROVAL_ROLES, badgeKey: 'approvals' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, roles: [...FINANCE_ROLES] },
      { href: '/activity-log', label: 'Operations Log', icon: History, roles: APPROVAL_ROLES },
      { href: '/activity-log?view=audit', label: 'Audit Trail', icon: ShieldAlert, roles: APPROVAL_ROLES },
    ],
  },
  {
    // Phase 1 of the HR & People Capacity module — Dashboard, People/
    // Department/Branch Capacity, Employees. Leave/Attendance/Documents/
    // Onboarding/Offboarding/Performance/Training/Reports/Settings are
    // deliberately not listed yet: they ship (and get their own nav
    // entries) in later phases, not as dead links now. Gated behind the
    // 'HR & People Management' plan feature (Professional+, see
    // lib/feature-gating.ts) — genuine back-office tooling, same
    // category as Expense Tracking/Rate Management, never something a
    // shipment can get stuck on.
    label: 'HR & People',
    items: [
      { href: '/hr/dashboard', label: 'HR Dashboard', icon: LayoutDashboard, roles: HR_ROLES },
      { href: '/hr/capacity', label: 'People Capacity', icon: Gauge, roles: HR_ROLES },
      { href: '/hr/employees', label: 'Employees', icon: IdCard, roles: HR_ROLES },
      { href: '/hr/capacity/departments', label: 'Department Capacity', icon: Boxes, roles: HR_ROLES },
      { href: '/hr/capacity/branches', label: 'Branch Capacity', icon: Network, roles: HR_ROLES },
    ],
  },
];

const administrationItems: NavItem[] = [
  { href: '/users', label: 'Users', icon: UserCog, roles: APPROVAL_ROLES },
  { href: '/settings?tab=branches', label: 'Branches', icon: Network, roles: APPROVAL_ROLES },
  { href: '/settings?tab=company', label: 'Organization', icon: Building2, adminOnly: true },
  { href: '/settings?tab=profile', label: 'Settings', icon: Settings },
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
  currentHref,
  roles,
  badges,
  hasFeature,
  onNavigate,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  currentHref: string;
  roles: UserRole[];
  badges: NavBadgeCounts;
  /** Same source of truth as the route-level gate (app/(app)/layout.tsx) —
   *  an item whose href maps to a feature the org's plan doesn't include
   *  is hidden here rather than left to 404/lock on click. */
  hasFeature: (label: string) => boolean;
  onNavigate?: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const visibleItems = items.filter((item) => {
    if (item.adminOnly && !roles.includes('admin')) return false;
    if (item.platformAdminOnly && !roles.includes('platform_admin')) return false;
    // A user can hold several departments — a nav item scoped to a set
    // of roles shows as soon as any one of them matches.
    if (item.roles && !item.roles.some((r) => roles.includes(r))) return false;
    const requiredFeature = featureForPath(item.href.split('?')[0]);
    if (requiredFeature && !hasFeature(requiredFeature)) return false;
    return true;
  });

  // A role with no access to any item in a track-specific group (e.g.
  // Finance, for an operations user) shouldn't show a floating heading
  // with nothing underneath it.
  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={collapsible ? onToggleCollapse : undefined}
        className={cn(
          'flex w-full items-center justify-between px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-dark-muted/80',
          collapsible && 'cursor-pointer hover:text-brand-dark-muted'
        )}
      >
        {label}
        {collapsible && (
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform duration-200', !collapsed && 'rotate-90')}
          />
        )}
      </button>
      <div
        className={cn(
          'space-y-0.5 overflow-hidden transition-all duration-200',
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100'
        )}
      >
        {visibleItems.map((item) => {
          const Icon = item.icon;
          // Dual-purpose hrefs (Release/Delivery aliasing Terminal/
          // Transport; Operations Log/Audit Trail aliasing Activity Log
          // via ?view=) carry a query string, so an exact current-URL
          // match is used instead of startsWith — otherwise every alias
          // sharing a base path would light up together.
          const active = item.href.includes('?')
            ? currentHref === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const count = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <Link
              key={`${item.href}-${item.label}`}
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
              <span className="flex-1">{item.label}</span>
              {!!count && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                    active ? 'bg-brand-gold/20 text-brand-gold-soft' : 'bg-brand-dark-elevated text-brand-dark-muted'
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const COLLAPSE_STORAGE_KEY = 'sidebar-collapsed-groups';

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (stored) setCollapsed(JSON.parse(stored));
    } catch {
      // Corrupt or inaccessible storage just means every group starts
      // expanded — not worth surfacing an error for.
    }
  }, []);

  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence — a failed write just means the
        // preference won't survive a reload this time.
      }
      return next;
    });
  };

  return { collapsed, toggle };
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { roles } = useAuth();
  const badges = useNavBadges();
  const { hasFeature } = useOrgPlan();
  const { collapsed, toggle } = useCollapsedGroups();

  const search = searchParams.toString();
  const currentHref = search ? `${pathname}?${search}` : pathname;

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto scrollbar-thin px-3 py-4">
      <div className="space-y-1">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            'relative mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/dashboard'
              ? 'bg-brand-dark-elevated text-brand-gold-soft'
              : 'text-brand-dark-muted hover:bg-brand-dark-elevated/60 hover:text-brand-dark-foreground'
          )}
        >
          {pathname === '/dashboard' && (
            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-gold" />
          )}
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </Link>
      </div>
      <div className="space-y-5">
        {navGroups.map((group) => (
          <NavGroup
            key={group.label}
            label={group.label}
            items={group.items}
            pathname={pathname}
            currentHref={currentHref}
            roles={roles}
            badges={badges}
            hasFeature={hasFeature}
            onNavigate={onNavigate}
            collapsible
            collapsed={!!collapsed[group.label]}
            onToggleCollapse={() => toggle(group.label)}
          />
        ))}
      </div>
      {/* Flexible spacer pushes "Administration" down toward the bottom */}
      <div className="min-h-8 flex-1" />
      <NavGroup
        label="Administration"
        items={administrationItems}
        pathname={pathname}
        currentHref={currentHref}
        roles={roles}
        badges={badges}
        hasFeature={hasFeature}
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
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/settings?tab=profile">
              <UserRound className="mr-2 h-4 w-4" />
              My Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/settings?tab=preferences">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
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
    <aside className="no-print hidden h-screen w-64 shrink-0 flex-col bg-brand-dark lg:flex">
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
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings?tab=profile">
            <UserRound className="mr-2 h-4 w-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings?tab=preferences">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
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

/** Notifications bell: a real per-user inbox (migration 053's
 *  `notifications` table) — shipment created, docs needed, customs
 *  released, etc. Unread count badges the bell; opening an item marks
 *  it read and navigates to the record it's about. */
function NotificationsBell() {
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();

  const handleOpen = (item: AppNotification) => {
    if (!item.read_at) markRead(item.id);
    const href = item.entity_type === 'shipment' ? `/shipments/${item.entity_id}` : `/quotations/${item.entity_id}`;
    router.push(href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount})` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div>
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium">Nothing yet</p>
            <p className="text-xs text-muted-foreground">
              You&apos;ll see updates here as things happen.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleOpen(item)}
                className="flex cursor-pointer items-start gap-2.5 py-2"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-transparent' : 'bg-primary'}`}
                />
                <span className="flex flex-col">
                  <span className={`text-sm leading-tight ${item.read_at ? 'font-normal' : 'font-medium'}`}>
                    {item.title}
                  </span>
                  {item.body && <span className="text-xs text-muted-foreground">{item.body}</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
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
    <header className="no-print hidden h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-6 lg:flex">
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
        <ThemeToggle />
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
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
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
      <ThemeToggle />
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
