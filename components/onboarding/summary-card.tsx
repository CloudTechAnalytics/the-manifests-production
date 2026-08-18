'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import { daysRemaining } from '@/lib/utils/status';
import type { Organization } from '@/types';

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
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: sub }, { data: count }, { data: branch }] = await Promise.all([
        supabase.from('org_subscriptions').select('*, plan:plans(*)').eq('organization_id', organization.id).maybeSingle(),
        supabase.rpc('org_user_count', { p_org_id: organization.id }),
        supabase
          .from('branches')
          .select('name')
          .eq('organization_id', organization.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      setSummary({
        planName: sub?.plan?.name ?? 'Trial',
        isTrial: sub?.status === 'trial',
        remaining: sub?.trial_ends_at ? daysRemaining(sub.trial_ends_at) : null,
        userCount: typeof count === 'number' ? count : 1,
        userLimit: sub?.plan?.max_users ?? null,
        branchName: branch?.name ?? 'Head Office',
      });
    })();
  }, [organization.id]);

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
