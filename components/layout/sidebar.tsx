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
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchContext } from '@/contexts/search-context';
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

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

// Professionally grouped navigation. Only real, existing routes are
// included — dead-end links are never added.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/shipments', label: 'Shipments', icon: Package },
      { href: '/planning', label: 'Planning', icon: ClipboardList },
      { href: '/tracking', label: 'Tracking', icon: Radar },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/quotations', label: 'Quotations', icon: FileText },
      { href: '/sales', label: 'Sales', icon: TrendingUp },
    ],
  },
  {
    label: 'Customers',
    items: [{ href: '/customers', label: 'Customers', icon: Users }],
  },
  {
    label: 'Finance',
    items: [
      { href: '/invoices', label: 'Invoices', icon: Receipt },
      { href: '/payments', label: 'Payments', icon: Wallet },
      { href: '/expenses', label: 'Expenses', icon: CreditCard },
    ],
  },
  {
    label: 'Operations Support',
    items: [
      { href: '/documents', label: 'Documents', icon: FolderOpen },
      { href: '/warehouse', label: 'Warehouse', icon: Warehouse },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
];

const administrationItems: NavItem[] = [
  { href: '/users', label: 'Users', icon: UserCog, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Logo() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-brand-dark-border px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gold shadow-sm shadow-brand-gold/30">
        <Ship className="h-[18px] w-[18px] text-brand-dark" strokeWidth={2.25} />
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-bold leading-none tracking-tight text-brand-dark-foreground">
          The Manifest
        </span>
        <span className="mt-1.5 text-xs font-medium uppercase tracking-[0.08em] text-brand-dark-muted">
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
  return (
    <div>
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-dark-muted/80">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          if ('adminOnly' in item && item.adminOnly && role !== 'admin') return null;
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

/** Desktop, always-visible sidebar (lg and up). Permanently dark, regardless
 *  of the app's light/dark theme setting — a fixed brand identity element. */
export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col bg-brand-dark lg:flex">
      <Logo />
      <NavLinks />
      <UserMenu />
    </aside>
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
        </SheetContent>
      </Sheet>
      <div className="flex flex-1 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold">
          <Ship className="h-3.5 w-3.5 text-brand-dark" strokeWidth={2.25} />
        </div>
        <span className="text-base font-bold tracking-tight">The Manifest</span>
      </div>
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
