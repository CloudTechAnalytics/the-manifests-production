'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Loader2, PartyPopper, Ship } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SummaryCard } from '@/components/onboarding/summary-card';
import { OrgInfoStep } from '@/components/onboarding/org-info-step';
import { BranchStep } from '@/components/onboarding/branch-step';
import { DepartmentsManager } from '@/components/organization/departments-manager';
import { InviteTeamStep } from '@/components/onboarding/invite-team-step';
import { SubscriptionStep } from '@/components/onboarding/subscription-step';

const STEPS = [
  { id: 'org', label: 'Organization' },
  { id: 'branch', label: 'Branch Setup' },
  { id: 'departments', label: 'Departments' },
  { id: 'invite', label: 'Invite Team' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'ready', label: 'Ready' },
] as const;

/**
 * Post-verification setup wizard — spec section 9. The organization,
 * branch, departments, and trial already exist (provisioned at
 * registration, migration 064) — every step here reviews/extends that,
 * never creates it from scratch. Every step can be skipped; finishing or
 * skipping either way marks organizations.onboarding_completed_at so
 * login's redirect (app/login/page.tsx) stops sending the owner back here.
 */
export default function OnboardingPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<'welcome' | number>('welcome');
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (profile && profile.role !== 'admin') { router.replace('/dashboard'); return; }
    if (profile?.organization?.onboarding_completed_at) { router.replace('/dashboard'); return; }
  }, [loading, user, profile, router]);

  const finish = async () => {
    setFinishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Your session has expired. Please sign in again.'); return; }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-organization-profile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ mark_onboarding_complete: true }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to finish setup');
      await refreshProfile();
      router.replace('/dashboard');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to finish setup'));
    } finally {
      setFinishing(false);
    }
  };

  if (loading || !profile?.organization) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const organization = profile.organization;

  if (stage === 'welcome') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-xl space-y-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gold shadow-lg shadow-brand-gold/20">
              <PartyPopper className="h-7 w-7 text-brand-dark" strokeWidth={2.25} />
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-tight">Welcome to The Manifest</h1>
            <p className="max-w-sm text-sm text-muted-foreground">Your organization is ready.</p>
          </div>

          <SummaryCard organization={organization} />

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={finish} disabled={finishing}>
              {finishing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Go to Dashboard
            </Button>
            <Button size="lg" variant="outline" onClick={() => setStage(0)}>
              Complete Setup
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const stepIndex = stage as number;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const percent = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-2.5">
          <Ship className="h-5 w-5 text-primary" />
          <span className="font-serif text-lg font-bold tracking-tight">Set up The Manifest</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {stepIndex + 1} of {STEPS.length}</span>
            <span className="font-medium text-foreground">{percent}% Complete</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStage(i)}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-full border px-1.5 py-1 text-center text-[10px] font-medium leading-tight transition-colors',
                  i === stepIndex
                    ? 'border-primary bg-primary text-primary-foreground'
                    : i < stepIndex
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent/50'
                )}
              >
                {i < stepIndex ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[320px] rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {step.id === 'org' && <OrgInfoStep organization={organization} onUpdated={refreshProfile} />}
          {step.id === 'branch' && <BranchStep organizationId={organization.id} />}
          {step.id === 'departments' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-serif text-xl font-bold tracking-tight">Departments</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We created sensible defaults. Rename, disable, or add your own — no organization has to use all of them.
                  These are just labels for your org chart — they don&apos;t grant access to anything. What a team member
                  can see and do comes entirely from the Role you give them when you invite them, next.
                </p>
              </div>
              <DepartmentsManager organizationId={organization.id} />
            </div>
          )}
          {step.id === 'invite' && <InviteTeamStep organizationId={organization.id} />}
          {step.id === 'subscription' && <SubscriptionStep organizationId={organization.id} />}
          {step.id === 'ready' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-serif text-xl font-bold tracking-tight">You&apos;re all set</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {organization.name} is ready to go. You can revisit branches, departments, and invites any time
                  from Settings and Users.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => setStage(stepIndex === 0 ? 'welcome' : stepIndex - 1)}>
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {!isLast && (
              <Button type="button" variant="ghost" onClick={() => setStage(stepIndex + 1)}>
                Skip for now
              </Button>
            )}
            {isLast ? (
              <Button onClick={finish} disabled={finishing}>
                {finishing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Go to Dashboard
              </Button>
            ) : (
              <Button onClick={() => setStage(stepIndex + 1)}>
                Next
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
