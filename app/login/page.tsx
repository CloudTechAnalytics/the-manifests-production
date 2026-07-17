'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ship,
  Loader2,
  Eye,
  EyeOff,
  Plane,
  Package,
  Globe2,
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const highlights = [
  {
    icon: Package,
    title: 'End-to-end shipment tracking',
    description: 'Follow every booking from origin to delivery in real time.',
  },
  {
    icon: Globe2,
    title: 'Multi-branch operations',
    description: 'Coordinate customers, quotations, and staff across branches.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access control',
    description: 'Keep sensitive freight data scoped to the right people.',
  },
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
    <div className="relative mx-auto aspect-[400/260] w-full max-w-sm">
      <svg
        viewBox="0 0 400 260"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <path
          d="M60 203 C 130 100, 230 100, 340 52"
          stroke="hsl(var(--brand-gold-soft))"
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeDasharray="5 7"
          fill="none"
        />
        <path
          d="M60 203 C 120 235, 260 235, 340 151"
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
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold/10 ring-1 ring-brand-gold/30 backdrop-blur-sm">
            <Icon className="h-4 w-4 text-brand-gold-soft" />
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
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-brand-dark px-12 py-12 text-brand-dark-foreground lg:flex">
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

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold">
            <Ship className="h-5 w-5 text-brand-dark" strokeWidth={2.25} />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-lg font-normal leading-none tracking-tight">
              The Manifest
            </span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-brand-dark-muted">
              Est. 2026 &middot; Nigeria
            </span>
          </div>
        </div>

        <div className="relative space-y-8">
          <RouteIllustration />

          <div className="space-y-3">
            <h1 className="font-serif text-4xl font-normal leading-tight tracking-tight">
              Where every shipment
              <br />
              becomes <em className="font-serif text-brand-gold-soft">manifest.</em>
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-brand-dark-muted">
              A single, refined workspace for the modern freight forwarder —
              quotations, bookings, tracking, and documents, brought into one
              quiet command of operations.
            </p>
          </div>

          <div className="space-y-5">
            {highlights.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gold/10 ring-1 ring-brand-gold/20">
                  <h.icon className="h-4 w-4 text-brand-gold-soft" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand-dark-muted">
                    {h.description}
                  </p>
                </div>
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
          {/* Mobile logo (brand panel hidden below lg) */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gold shadow-lg shadow-brand-gold/20">
              <Ship className="h-7 w-7 text-brand-dark" strokeWidth={2.25} />
            </div>
            <div className="text-center">
              <h1 className="font-serif text-2xl font-normal tracking-tight">The Manifest</h1>
              <p className="text-sm text-muted-foreground">
                Freight Operations Management
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Welcome back
            </p>
            <h2 className="font-serif text-3xl font-normal tracking-tight">
              Sign in to your operations
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
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

            <Button
              type="submit"
              className="w-full bg-brand-dark text-brand-dark-foreground hover:bg-brand-dark-elevated"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
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
