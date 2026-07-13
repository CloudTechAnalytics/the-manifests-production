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
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 px-12 py-12 text-white lg:flex">
        {/* Decorative background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 70%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px, 64px 64px',
          }}
        />
        <Plane
          aria-hidden
          className="pointer-events-none absolute -right-10 top-24 h-56 w-56 -rotate-12 text-white/[0.06]"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
            <Ship className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">FreightOps</span>
        </div>

        <div className="relative space-y-10">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              Freight operations,
              <br />
              under control.
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-blue-100/80">
              One platform for quotations, bookings, and shipment tracking
              across every branch you operate.
            </p>
          </div>

          <div className="space-y-5">
            {highlights.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <h.icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-blue-100/70">
                    {h.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-blue-100/50">
          &copy; {new Date().getFullYear()} FreightOps. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo (brand panel hidden below lg) */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
              <Ship className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">FreightOps</h1>
              <p className="text-sm text-muted-foreground">
                Freight Operations Management Platform
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-center lg:text-left">
            <h2 className="text-xl font-semibold tracking-tight">
              Sign in to your account
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the platform
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
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
                'Sign in'
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
