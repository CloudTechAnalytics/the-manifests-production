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
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
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

const mainNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/quotations', label: 'Quotations', icon: FileText },
  { href: '/sales', label: 'Sales', icon: TrendingUp },
  { href: '/shipments', label: 'Shipments', icon: Package },
  { href: '/documents', label: 'Documents', icon: FolderOpen },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

const otherNavItems = [
  { href: '/users', label: 'Users', icon: UserCog, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Logo() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/30">
        <Ship className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-bold tracking-tight">FreightOps</span>
        <span className="text-[10px] text-muted-foreground">
          Operations Platform
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
  items: typeof mainNavItems;
  pathname: string;
  role?: string;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
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
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
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
      <NavGroup
        label="Main"
        items={mainNavItems}
        pathname={pathname}
        onNavigate={onNavigate}
      />
      {/* Flexible spacer pushes "Others" down toward the bottom of the sidebar */}
      <div className="min-h-8 flex-1" />
      <NavGroup
        label="Others"
        items={otherNavItems}
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
    <div className="border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-2 py-2"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
              <span className="w-full truncate text-sm font-medium leading-none text-left">
                {profile?.full_name}
              </span>
              <span className="text-xs capitalize text-muted-foreground">
                {roleLabel}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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

/** Desktop, always-visible sidebar (lg and up). */
export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <Logo />
      <NavLinks />
      <UserMenu />
    </aside>
  );
}

/** Mobile top bar with hamburger-triggered drawer nav (below lg). */
export function MobileTopBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="-ml-2">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Logo />
          <NavLinks onNavigate={() => setOpen(false)} />
          <UserMenu />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Ship className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-sm font-bold tracking-tight">FreightOps</span>
      </div>
    </header>
  );
}
