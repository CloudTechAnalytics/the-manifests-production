'use client';

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Loader2, PartyPopper, Ship } from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import * as onboardingService from '@/features/onboarding/services/onboarding.service';
import { Button } from '@/shared/components/ui/button';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { SummaryCard } from '@/features/onboarding/components/summary-card';
import { OrgInfoStep } from '@/features/onboarding/components/org-info-step';
import { BranchStep } from '@/features/onboarding/components/branch-step';
import { DepartmentsManager } from '@/shared/components/departments-manager';
import { InviteTeamStep } from '@/features/onboarding/components/invite-team-step';
import { SubscriptionStep } from '@/features/onboarding/components/subscription-step';

const STEPS = [
  { id: 'org', label: 'Organization' },
  { id: 'branch', label: 'Branch Setup' },
  { id: 'departments', label: 'Departments' },
  { id: 'invite', label: 'Invite Team' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'ready', label: 'Ready' },
] as const;

const stepFade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.25 },
};

/** Thin header shared by both the welcome screen and the step wizard —
 *  distinct from the split-screen brand panel used for login/reset —
 *  onboarding is a single centered column the whole way through. */
function OnboardingHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2">
        <Ship className="h-5 w-5 text-primary" />
        <span className="font-display text-lg font-bold tracking-tight">The Manifest</span>
      </Link>
      <ThemeToggle />
    </header>
  );
}

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
  const navigate = useNavigate();
  const [stage, setStage] = useState<'welcome' | number>('welcome');

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    if (profile && profile.role !== 'admin') { navigate('/dashboard', { replace: true }); return; }
    if (profile?.organization?.onboarding_completed_at) { navigate('/dashboard', { replace: true }); return; }
  }, [loading, user, profile, navigate]);

  const finishMutation = useMutation({
    mutationFn: () => onboardingService.finishOnboarding(),
    onSuccess: async () => {
      await refreshProfile();
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to finish setup'));
    },
  });
  const finishing = finishMutation.isPending;
  const finish = () => finishMutation.mutate();

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
      <div className="flex min-h-screen flex-col bg-background">
        <OnboardingHeader />
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-lg space-y-8 text-center"
          >
            <div className="flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"
              >
                <PartyPopper className="h-5 w-5 text-primary" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="font-display text-2xl font-bold tracking-tight"
              >
                Welcome to The Manifest
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="max-w-sm text-sm text-muted-foreground"
              >
                Your organization is ready.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              <SummaryCard organization={organization} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
            >
              <Button size="lg" onClick={finish} disabled={finishing}>
                {finishing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Go to Dashboard
              </Button>
              <Button size="lg" variant="outline" onClick={() => setStage(0)}>
                Complete Setup
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  const stepIndex = stage as number;
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OnboardingHeader />
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-bold">
              Step {stepIndex + 1} of {STEPS.length} · {step.label}
            </p>
            {/* Thin segmented progress — each pill is also a jump-to-step
                button, so the click-any-step affordance the old wide
                number grid gave isn't lost, just quieter about it. */}
            <div className="flex w-28 items-center gap-1.5">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStage(i)}
                  title={s.label}
                  aria-label={`Go to ${s.label}`}
                  aria-current={i === stepIndex ? 'step' : undefined}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    i <= stepIndex ? 'bg-primary' : 'bg-border hover:bg-muted-foreground/40'
                  )}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              {...stepFade}
              className="min-h-[320px] rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8"
            >
              {step.id === 'org' && <OrgInfoStep organization={organization} onUpdated={refreshProfile} />}
              {step.id === 'branch' && <BranchStep organizationId={organization.id} />}
              {step.id === 'departments' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-tight">Departments</h2>
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
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-success/12"
                  >
                    <Check className="h-7 w-7 text-success" />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                  >
                    <h2 className="font-display text-xl font-bold tracking-tight">You&apos;re all set</h2>
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="mt-1 text-sm text-muted-foreground"
                  >
                    {organization.name} is ready to go. You can revisit branches, departments, and invites any time
                    from Settings and Users.
                  </motion.p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

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
    </div>
  );
}
