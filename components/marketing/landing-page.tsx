'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ship,
  Plane,
  Truck,
  Package,
  Radar,
  ClipboardList,
  FileText,
  Receipt,
  Warehouse,
  Building2,
  ShieldCheck,
  Users,
  BarChart3,
  History,
  Mail,
  Phone,
  Menu,
  ArrowRight,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_HREF } from '@/lib/contact';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Platform', href: '#platform' },
  { label: 'Contact', href: '#contact' },
];

// Every entry maps to a real, existing module — nothing aspirational.
const FEATURES = [
  {
    icon: Package,
    title: 'Shipment Management',
    description:
      'Create and manage ocean, air, and road shipments with a full status timeline from booking to delivery.',
  },
  {
    icon: Radar,
    title: 'Live Tracking',
    description:
      'A dedicated tracking board surfaces every active shipment, its carrier, and its current milestone at a glance.',
  },
  {
    icon: ClipboardList,
    title: 'Shipment Planning',
    description:
      'Pre-booking checklists, container and vessel details, and task assignment before a shipment goes live.',
  },
  {
    icon: FileText,
    title: 'Quotations & Sales',
    description:
      'Build itemized quotations, send them to customers, and convert accepted quotes straight into a shipment plan.',
  },
  {
    icon: Receipt,
    title: 'Finance & Invoicing',
    description:
      'Issue invoices, record payments against one or many invoices, and track approved operational expenses.',
  },
  {
    icon: Warehouse,
    title: 'Warehouse Management',
    description:
      'Multiple storage locations, stock items, and a full movement ledger so every unit is accounted for.',
  },
  {
    icon: Building2,
    title: 'Multi-Branch Operations',
    description:
      'Run every branch from one workspace, with data scoped per branch and rolled up for admins.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-Based Access',
    description:
      'Admin, branch manager, operations, sales, and finance roles — each sees exactly what their job requires.',
  },
];

const MARQUEE_ITEMS = [
  'Ocean Freight',
  'Air Freight',
  'Road Freight',
  'Customs Documentation',
  'Warehouse & Inventory',
  'Quotations',
  'Invoicing & Payments',
  'Live Tracking',
  'Multi-Branch',
  'Audit Trail',
];

const WORKFLOW_STEPS = [
  {
    title: 'Quote',
    description: 'Build an itemized quotation for the customer and send it for approval.',
    icon: FileText,
  },
  {
    title: 'Book',
    description: 'Convert the accepted quote into a shipment plan, then a live shipment.',
    icon: ClipboardList,
  },
  {
    title: 'Track',
    description: 'Follow every milestone — documentation, customs, transit, delivery.',
    icon: Radar,
  },
  {
    title: 'Bill',
    description: 'Invoice the customer, record payments, and reconcile expenses.',
    icon: Receipt,
  },
];

const PLATFORM_POINTS = [
  'Onboard organizations with their own branches, staff, and branding',
  'Assign subscription plans and manage billing status per organization',
  'One platform-wide audit log across every tenant, kept separate from tenant data',
  'Live system health monitoring for the platform operator',
];

function RouteIllustration() {
  const hubs = [
    { icon: Ship, left: '10%', top: '75%', delay: '0s' },
    { icon: Plane, left: '50%', top: '15%', delay: '1.2s' },
    { icon: Truck, left: '88%', top: '60%', delay: '2.4s' },
  ];
  return (
    <div className="relative mx-auto aspect-[5/3] w-full max-w-md">
      <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden>
        <path
          d="M40 180 C 120 60, 260 60, 360 40"
          stroke="hsl(var(--brand-gold))"
          strokeOpacity="0.3"
          strokeWidth="1.5"
          strokeDasharray="6 8"
          fill="none"
        />
        <path
          d="M40 180 C 140 220, 300 210, 360 145"
          stroke="hsl(var(--brand-gold))"
          strokeOpacity="0.18"
          strokeWidth="1.5"
          strokeDasharray="6 8"
          fill="none"
        />
      </svg>
      {hubs.map(({ icon: Icon, left, top, delay }, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-float"
          style={{ left, top, animationDelay: delay }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30 backdrop-blur-sm">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ShipmentJourney() {
  const milestones = [
    { label: 'Quoted', icon: FileText },
    { label: 'Booked', icon: ClipboardList },
    { label: 'Customs', icon: ShieldCheck },
    { label: 'Transit', icon: Ship },
    { label: 'Delivered', icon: CheckCircle2 },
  ];
  return (
    <div className="relative rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">
          REF-2049 &middot; Live
        </span>
        <span className="text-[11px] text-muted-foreground">Lagos → Rotterdam</span>
      </div>

      <div className="relative mt-8 h-9">
        <div className="absolute left-[10%] right-[10%] top-1/2 h-0.5 -translate-y-1/2 bg-border" />
        <div
          aria-hidden
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-journey-dot rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
        />
        <div className="relative flex h-full items-center justify-between">
          {milestones.map((m, i) => (
            <div
              key={m.label}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-border bg-background text-muted-foreground animate-journey-pulse"
              style={{ animationDelay: `${i * 1.2}s` }}
            >
              <m.icon className="h-4 w-4" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {milestones.map((m) => (
          <span key={m.label} className="w-9 text-center text-[10px] text-muted-foreground">
            {m.label}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted p-2.5">
          <p className="text-[10px] text-muted-foreground">Current Stage</p>
          <p className="font-serif text-base font-bold">Customs Clearance</p>
        </div>
        <div className="rounded-lg bg-muted p-2.5">
          <p className="text-[10px] text-muted-foreground">ETA</p>
          <p className="font-serif text-base font-bold">4 days</p>
        </div>
      </div>

      {/* Floating accent chip */}
      <div className="absolute -right-6 -top-6 hidden animate-float items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 shadow-lg sm:flex">
        <Radar className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium">Live milestone alerts</span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------------------------------------------------------------- */}
      {/* Nav */}
      {/* ---------------------------------------------------------------- */}
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

      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div aria-hidden className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hero-port.jpg"
            alt=""
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-dark via-brand-dark/85 to-brand-dark/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/80 via-transparent to-brand-dark/40" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-gold-soft backdrop-blur-sm">
              <Layers className="h-3.5 w-3.5" />
              Freight Operations Platform
            </div>
            <h1 className="mt-5 font-serif text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              The operating system for modern{' '}
              <span className="text-brand-gold-soft">freight forwarders.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-brand-dark-muted sm:text-lg">
              Quotations, shipments, planning, tracking, warehouse, invoicing, and
              documents — one workspace for your whole operation, with every
              branch and role scoped to exactly what it needs.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Start Free Trial
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-brand-dark-border bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#contact">Request a Demo</a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-brand-dark-muted">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-brand-gold-soft hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          <div className="relative animate-fade-up" style={{ animationDelay: '150ms' }}>
            <RouteIllustration />
            <div className="mt-4">
              <ShipmentJourney />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Marquee */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border bg-muted/40 py-5">
        <div className="flex overflow-hidden">
          <div className="flex shrink-0 animate-marquee items-center gap-3 pr-3">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span
                key={i}
                className="shrink-0 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Features */}
      {/* ---------------------------------------------------------------- */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Everything in one place
          </p>
          <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            Built for how freight operations actually run
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every module below is a real, working part of the platform — not a
            roadmap item.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i % 4}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Workflow */}
      {/* ---------------------------------------------------------------- */}
      <section id="workflow" className="bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              How it flows
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              From quotation to cash, in one thread
            </h2>
          </Reveal>

          <div className="relative mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div
              aria-hidden
              className="absolute left-0 right-0 top-6 hidden h-px bg-border lg:block"
            />
            {WORKFLOW_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i} className="relative">
                <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background font-serif text-lg font-bold text-primary">
                    {i + 1}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <step.icon className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">{step.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Platform highlight */}
      {/* ---------------------------------------------------------------- */}
      <section id="platform" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              For the platform operator
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              One console to run every organization on the platform
            </h2>
            <p className="mt-4 text-muted-foreground">
              Alongside the day-to-day operations workspace, a separate
              Platform Console lets you onboard and manage every tenant
              organization from one place.
            </p>
            <ul className="mt-6 space-y-3">
              {PLATFORM_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground/90">{point}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={1}>
            <div className="rounded-2xl border border-brand-dark-border bg-brand-dark p-6 text-brand-dark-foreground shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-gold-soft">
                  Organizations
                </span>
                <Building2 className="h-4 w-4 text-brand-gold-soft" />
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { name: 'Blue Economy Agency', plan: 'Growth', status: 'Active' },
                  { name: 'Northbound Logistics', plan: 'Starter', status: 'Active' },
                  { name: 'Cargo Route Partners', plan: 'Enterprise', status: 'Trial' },
                ].map((org) => (
                  <div
                    key={org.name}
                    className="flex items-center justify-between rounded-lg border border-brand-dark-border bg-brand-dark-elevated px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{org.name}</p>
                      <p className="text-[11px] text-brand-dark-muted">{org.plan} plan</p>
                    </div>
                    <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-medium text-brand-gold-soft">
                      {org.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-brand-dark-border pt-4">
                {[
                  { icon: Users, label: 'Staff directory' },
                  { icon: BarChart3, label: 'Plans & billing' },
                  { icon: History, label: 'Audit logs' },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-1.5 text-center">
                    <item.icon className="h-4 w-4 text-brand-gold-soft" />
                    <span className="text-[10px] leading-tight text-brand-dark-muted">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Contact CTA */}
      {/* ---------------------------------------------------------------- */}
      <section id="contact" className="relative overflow-hidden bg-brand-dark py-24 text-brand-dark-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 70% 70%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px, 64px 64px',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold-soft">
              Get in touch
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to modernize your freight operations?
            </h2>
            <p className="mt-4 text-brand-dark-muted">
              Reach out and we'll set up your organization, branches, and staff
              on The Manifest.
            </p>
          </Reveal>

          <Reveal delay={1} className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="group flex items-center gap-3 rounded-xl border border-brand-dark-border bg-brand-dark-elevated px-5 py-4 text-left transition-colors hover:border-brand-gold/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold/15">
                <Mail className="h-4.5 w-4.5 text-brand-gold-soft" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-brand-dark-muted">Email us</p>
                <p className="truncate text-sm font-medium">{CONTACT_EMAIL}</p>
              </div>
            </a>
            <a
              href={`tel:${CONTACT_PHONE_HREF}`}
              className="group flex items-center gap-3 rounded-xl border border-brand-dark-border bg-brand-dark-elevated px-5 py-4 text-left transition-colors hover:border-brand-gold/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold/15">
                <Phone className="h-4.5 w-4.5 text-brand-gold-soft" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-brand-dark-muted">Call us</p>
                <p className="truncate text-sm font-medium">{CONTACT_PHONE}</p>
              </div>
            </a>
          </Reveal>

          <Reveal delay={2} className="mt-8">
            <Button size="lg" variant="outline" className="border-brand-dark-border bg-transparent text-brand-dark-foreground hover:bg-brand-dark-elevated hover:text-brand-dark-foreground" asChild>
              <Link href="/login">
                Already a customer? Sign in
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Footer */}
      {/* ---------------------------------------------------------------- */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Ship className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-serif text-sm font-bold tracking-tight">The Manifest</span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} The Manifest. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/track" className="hover:text-foreground">
              Track a Shipment
            </Link>
            <span className="hidden sm:inline">&middot;</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
              {CONTACT_EMAIL}
            </a>
            <span className="hidden sm:inline">&middot;</span>
            <a href={`tel:${CONTACT_PHONE_HREF}`} className="hidden hover:text-foreground sm:inline">
              {CONTACT_PHONE}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
