'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isTrialExpired } from '@/lib/utils/status';
import type { ActivityItem } from '@/hooks/use-dashboard-data';
import type { Organization, Plan, OrgSubscription } from '@/types';

export interface PlatformStats {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  activeUsers: number;
  platformTeamCount: number;
  newUsersThisMonth: number;
  mrr: number;
  arr: number;
  trialCount: number;
  expiredTrialCount: number;
}

export interface OrgGrowthPoint {
  month: string;
  label: string;
  count: number;
  cumulative: number;
}

export interface RecentOrganization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  memberCount: number;
}

export interface PlatformDashboardData {
  stats: PlatformStats;
  growth: OrgGrowthPoint[];
  recentOrganizations: RecentOrganization[];
  recentActivity: ActivityItem[];
  loading: boolean;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Last 6 calendar months, oldest first, keyed "YYYY-M" to match grouping below. */
function lastSixMonths(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS[d.getMonth()] });
  }
  return out;
}

export function usePlatformDashboardData(): PlatformDashboardData {
  const [stats, setStats] = useState<PlatformStats>({
    totalOrganizations: 0,
    activeOrganizations: 0,
    suspendedOrganizations: 0,
    totalUsers: 0,
    activeUsers: 0,
    platformTeamCount: 0,
    newUsersThisMonth: 0,
    mrr: 0,
    arr: 0,
    trialCount: 0,
    expiredTrialCount: 0,
  });
  const [growth, setGrowth] = useState<OrgGrowthPoint[]>([]);
  const [recentOrganizations, setRecentOrganizations] = useState<RecentOrganization[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      try {
        const months = lastSixMonths();
        const [earliestYear, earliestMonth] = months[0].key.split('-').map(Number);
        const earliestDate = new Date(earliestYear, earliestMonth, 1);

        // Stats, growth-window count, growth-window rows, top-5 recent
        // orgs, and activities are all independent — one batch instead of
        // a chain. Deliberately NOT a plain "fetch every organization and
        // every profile" like before: those numbers are presented as true
        // platform-wide totals, and capping them with .limit() would make
        // them silently wrong once the platform grew past that cap, so
        // the totals come from platform_dashboard_stats() (migration
        // 071 — one SQL aggregate, correct at any scale) instead. Only the
        // genuinely bounded-by-nature pieces (this org's last 6 months of
        // signups; the 5 most recent orgs) still fetch real rows.
        const [statsRes, cumulativeBeforeRes, recentSignupsRes, topOrgsRes, activitiesRes, subsRes] =
          await Promise.all([
            supabase.rpc('platform_dashboard_stats'),
            supabase
              .from('organizations')
              .select('id', { count: 'exact', head: true })
              .is('deleted_at', null)
              .lt('created_at', earliestDate.toISOString()),
            supabase
              .from('organizations')
              .select('id, created_at')
              .is('deleted_at', null)
              .gte('created_at', earliestDate.toISOString()),
            supabase
              .from('organizations')
              .select('id, name, slug, is_active')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(5),
            supabase
              .from('activities')
              .select('id, user_id, action, description, created_at')
              .order('created_at', { ascending: false })
              .limit(8),
            supabase.from('org_subscriptions').select('*, plan:plans(*)'),
          ]);

        if (!isMounted) return;

        const statsRow = (statsRes.data?.[0] ?? null) as {
          total_organizations: number;
          active_organizations: number;
          total_users: number;
          active_users: number;
          platform_team_count: number;
          new_users_this_month: number;
        } | null;
        const recentSignups = (recentSignupsRes.data as { id: string; created_at: string }[]) ?? [];
        const topOrgs = (topOrgsRes.data as Pick<Organization, 'id' | 'name' | 'slug' | 'is_active'>[]) ?? [];
        const actRows = activitiesRes.data ?? [];
        const subs = (subsRes.data as unknown as (OrgSubscription & { plan: Plan })[]) ?? [];

        // Same monthly-equivalent logic as the Subscriptions page: an
        // annual subscription's monthly value is its annual price / 12
        // (or the monthly price * 12, if no distinct annual price is set).
        const monthlyEquivalent = (sub: OrgSubscription & { plan: Plan }) =>
          sub.billing_cycle === 'annual'
            ? (sub.plan.annual_price ?? sub.plan.monthly_price * 12) / 12
            : sub.plan.monthly_price;

        const activeSubs = subs.filter((s) => s.status === 'active');
        const mrr = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
        const trialSubs = subs.filter((s) => s.status === 'trial');
        const trialCount = trialSubs.length;
        // Lazily computed, same as effectiveOrganizationStatus() — no
        // stored status is flipped by a background job, so this is always
        // exactly as current as each subscription's trial_ends_at.
        const expiredTrialCount = trialSubs.filter((s) => isTrialExpired('active_trial', s.trial_ends_at)).length;

        // --- Stats ------------------------------------------------------------
        setStats({
          totalOrganizations: statsRow?.total_organizations ?? 0,
          activeOrganizations: statsRow?.active_organizations ?? 0,
          suspendedOrganizations: (statsRow?.total_organizations ?? 0) - (statsRow?.active_organizations ?? 0),
          totalUsers: statsRow?.total_users ?? 0,
          activeUsers: statsRow?.active_users ?? 0,
          platformTeamCount: statsRow?.platform_team_count ?? 0,
          newUsersThisMonth: statsRow?.new_users_this_month ?? 0,
          mrr,
          arr: mrr * 12,
          trialCount,
          expiredTrialCount,
        });

        // --- Organization growth (last 6 months, cumulative) -------------------
        const countsByMonth = new Map<string, number>();
        recentSignups.forEach((o) => {
          const d = new Date(o.created_at);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
        });
        // Orgs created before the 6-month window still count toward the
        // starting cumulative total, so the chart doesn't understate
        // history — from the exact-count query above, not a full fetch.
        let cumulative = cumulativeBeforeRes.count ?? 0;

        const growthPoints: OrgGrowthPoint[] = months.map(({ key, label }) => {
          const count = countsByMonth.get(key) ?? 0;
          cumulative += count;
          return { month: key, label, count, cumulative };
        });
        setGrowth(growthPoints);

        // --- Recent organizations (with member counts) --------------------------
        // Member counts scoped to just these 5 org ids — cheap and exact
        // regardless of total platform size, unlike counting from every
        // profile on the platform.
        const memberCounts = new Map<string, number>();
        if (topOrgs.length > 0) {
          const { data: memberRows } = await supabase
            .from('profiles')
            .select('organization_id')
            .in('organization_id', topOrgs.map((o) => o.id))
            .is('deleted_at', null);
          (memberRows ?? []).forEach((p: { organization_id: string | null }) => {
            if (!p.organization_id) return;
            memberCounts.set(p.organization_id, (memberCounts.get(p.organization_id) ?? 0) + 1);
          });
        }
        setRecentOrganizations(
          topOrgs.map((o) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            is_active: o.is_active,
            memberCount: memberCounts.get(o.id) ?? 0,
          }))
        );

        // --- Recent activity actors ---------------------------------------------
        // activities.user_id is a FK to auth.users, not profiles, so there is
        // no PostgREST embed for it — names are batch-fetched and mapped in
        // memory, same as the tenant dashboard's use-dashboard-data.ts.
        const actorIds = Array.from(
          new Set(actRows.map((a) => a.user_id).filter(Boolean))
        ) as string[];
        const actorNames = new Map<string, string>();
        if (actorIds.length > 0) {
          const { data: actorRows } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', actorIds);
          (actorRows ?? []).forEach((p) => actorNames.set(p.id, p.full_name));
        }

        setRecentActivity(
          actRows.map((a) => ({
            id: a.id,
            action: a.action,
            description: a.description,
            created_at: a.created_at,
            userName: a.user_id ? actorNames.get(a.user_id) ?? 'Unknown user' : 'System',
          }))
        );
      } catch (err) {
        console.error('Error loading platform dashboard data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return { stats, growth, recentOrganizations, recentActivity, loading };
}
