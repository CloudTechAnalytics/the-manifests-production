'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ship, Menu, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Platform', href: '#platform' },
  { label: 'Contact', href: '#contact' },
];

/**
 * The only genuinely interactive part of the landing page (a scroll
 * listener for the header's backdrop, and the mobile nav sheet) — split
 * out from LandingPage so that page can be a server component. Static
 * marketing content has no reason to ship as client JS or skip static
 * rendering just because one header needs a scroll listener.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-border bg-background/90 backdrop-blur-md shadow-sm'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Ship className="h-4.5 w-4.5 text-primary-foreground" strokeWidth={2.25} />
          </div>
          <span
            className={cn(
              'font-serif text-lg font-bold tracking-tight transition-colors',
              scrolled ? 'text-foreground' : 'text-white'
            )}
          >
            The Manifest
          </span>
        </div>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                'text-sm font-medium transition-colors',
                scrolled
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-white/80 hover:text-white'
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            asChild
            className={cn(!scrolled && 'text-white hover:bg-white/10 hover:text-white')}
          >
            <Link href="/login">Sign In</Link>
          </Button>
          <Button
            variant="outline"
            asChild
            className={cn(!scrolled && 'border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white')}
          >
            <a href="#contact">Request a Demo</a>
          </Button>
          <Button asChild>
            <Link href="/register">
              Start Free Trial
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="right" className="flex w-72 flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-left">
                <Ship className="h-5 w-5 text-primary" />
                The Manifest
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1">
              {NAV_LINKS.map((l) => (
                <SheetClose asChild key={l.href}>
                  <a
                    href={l.href}
                    className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {l.label}
                  </a>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-auto space-y-2 pb-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="#contact">Request a Demo</a>
              </Button>
              <SheetClose asChild>
                <Button className="w-full" asChild>
                  <Link href="/register">Start Free Trial</Link>
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md transition-colors md:hidden',
              scrolled ? 'text-foreground' : 'text-white'
            )}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </Sheet>
      </div>
    </header>
  );
}
