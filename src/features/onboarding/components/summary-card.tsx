'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { daysRemaining } from '@/shared/lib/utils/status';
import * as onboardingService from '@/features/onboarding/services/onboarding.service';
import type { Organization } from '@/shared/types';

interface Summary {
  planName: string;
  isTrial: boolean;
  remaining: number | null;
  userCount: number;
  userLimit: number | null;
  branchName: string;
}

/** The "Organization / Plan / Users / Branch" summary block from spec section 27, shared by the onboarding welcome splash and its Ready step. */
export function SummaryCard({ organization }: { organization: Organization }) {
  const { data } = useQuery({
    queryKey: ['onboarding-org-summary', organization.id],
    queryFn: () => onboardingService.fetchOrgSummaryData(organization.id),
  });

  const summary = useMemo<Summary | null>(() => {
    if (!data) return null;
    const { sub, userCount, branchName } = data;
    return {
      planName: sub?.plan?.name ?? 'Trial',
      isTrial: sub?.status === 'trial',
      remaining: sub?.trial_ends_at ? daysRemaining(sub.trial_ends_at) : null,
      userCount: typeof userCount === 'number' ? userCount : 1,
      userLimit: sub?.plan?.max_users ?? null,
      branchName: branchName ?? 'Head Office',
    };
  }, [data]);

  if (!summary) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-5 text-left sm:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">Organization</p>
        <p className="mt-0.5 truncate font-semibold">{organization.name}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Plan</p>
        <p className="mt-0.5 font-semibold">
          {summary.planName}{summary.isTrial ? ' Trial' : ''}
          {summary.remaining !== null && <span className="block text-xs font-normal text-muted-foreground">{summary.remaining} days remaining</span>}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Users</p>
        <p className="mt-0.5 font-semibold">{summary.userCount} / {summary.userLimit ?? 'Unlimited'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Branch</p>
        <p className="mt-0.5 truncate font-semibold">{summary.branchName}</p>
      </div>
    </div>
  );
}
