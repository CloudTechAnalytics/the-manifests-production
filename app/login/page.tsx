'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Ship,
  Loader2,
  Eye,
  EyeOff,
  Plane,
  Package,
  ClipboardList,
  FileText,
  Warehouse,
  Radar,
  Receipt,
  ShieldCheck,
  Building2,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// Every entry here maps to a real, existing module in the app — no
// aspirational or not-yet-built features listed.
const features = [
  { icon: Package, label: 'Import & Export Operations' },
  { icon: Radar, label: 'Live Shipment Tracking' },
  { icon: ClipboardList, label: 'Shipment Planning' },
  { icon: Receipt, label: 'Finance & Invoicing' },
  { icon: FileText, label: 'Customs Documentation' },
  { icon: ShieldCheck, label: 'Enterprise-grade Security' },
  { icon: Warehouse, label: 'Warehouse Management' },
  { icon: Building2, label: 'Multi-branch Operations' },
];

// A hub node on the route illustration — position is percentage-based so it
// lines up with the SVG path endpoints regardless of container size.
const routeHubs = [
  { icon: Ship, left: '15%', top: '78%' },
  { icon: Plane, left: '85%', top: '20%' },
  { icon: Package, left: '85%', top: '58%' },
];

function RouteIllustration() {
  return (
    <div className="relative mx-auto aspect-[400/180] w-full max-w-sm">
      <svg
        viewBox="0 0 400 180"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <path
          d="M40 140 C 110 50, 210 50, 320 30"
          stroke="hsl(var(--brand-gold-soft))"
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeDasharray="5 7"
          fill="none"
        />
        <path
          d="M40 140 C 100 165, 240 165, 320 100"
          stroke="hsl(var(--brand-gold-soft))"
          strokeOpacity="0.2"
          strokeWidth="1.5"
          strokeDasharray="5 7"
          fill="none"
        />
      </svg>
      {routeHubs.map(({ icon: Icon, left, top }, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left, top }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-gold/20" />
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold/10 ring-1 ring-brand-gold/30 backdrop-blur-sm">
            <Icon className="h-3.5 w-3.5 text-brand-gold-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { user, profile, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (profile?.must_change_password) {
        router.replace('/change-password');
      } else if (profile?.role === 'platform_admin') {
        // Platform admins are onboarding organizations, not running one —
        // the tenant dashboard (shipments, quotations, warehouse…) isn't
        // their workspace, so send them straight to the console instead.
        router.replace('/platform');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [loading, user, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Welcome back!');
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel (lg+) */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-brand-dark px-12 py-10 text-brand-dark-foreground lg:flex">
        {/* Decorative background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 70%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px, 64px 64px',
          }}
        />

        <div className="relative flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold">
              <Ship className="h-5 w-5 text-brand-dark" strokeWidth={2.25} />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-xl font-bold leading-none tracking-tight text-brand-gold-soft">
                The Manifest
              </span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-brand-dark-muted">
                Freight Management Platform
              </span>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark-muted transition-colors hover:text-brand-gold-soft"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>

        <div className="relative space-y-6">
          <RouteIllustration />

          <div className="space-y-2.5">
            <h1 className="font-serif text-2xl font-bold leading-tight tracking-tight">
              The operating system for modern{' '}
              <span className="text-brand-gold-soft">freight forwarders.</span>
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-brand-dark-muted">
              Manage shipments, planning, tracking, warehouse operations,
              quotations, invoices, and documents — all from one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-2">
                <f.icon className="h-4 w-4 shrink-0 text-brand-gold-soft" />
                <span className="text-xs text-brand-dark-muted">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-brand-dark-muted/70">
          &copy; {new Date().getFullYear()} The Manifest. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm space-y-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          {/* Mobile logo (brand panel hidden below lg) */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gold shadow-lg shadow-brand-gold/20">
              <Ship className="h-7 w-7 text-brand-dark" strokeWidth={2.25} />
            </div>
            <div className="text-center">
              <h1 className="font-serif text-xl font-bold tracking-tight">The Manifest</h1>
              <p className="text-sm text-muted-foreground">
                Freight Management Platform
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Welcome back
            </p>
            <h2 className="font-serif text-2xl font-bold tracking-tight">
              Welcome back.
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in to your operations workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Business Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@yourcompany.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            This is an internal business application. Contact your
            administrator for account access.
          </p>
        </div>
      </div>
    </div>
  );
}
