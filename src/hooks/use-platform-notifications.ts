'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

/*
 * Notifications for the Platform Console's bell — the platform-scoped
 * counterpart to hooks/use-notifications.ts. Same shape, same idea: live
 * counts of outstanding onboarding work, not a persistent inbox. No
 * "mark as read" — a badge clears when the underlying thing is resolved
 * (an admin is invited, an invite is accepted, a trial is converted or
 * lapses), not when someone opens the dropdown.
 */

export interface NotificationItem {
  key: string;
  label: string;
  description: string;
  href: string;
  count: number;
}

export interface NotificationsState {
  items: NotificationItem[];
  total: number;
  loading: boolean;
  refresh: () => void;
}

const INVITE_SOON_DAYS = 2;
const TRIAL_SOON_DAYS = 3;

export function usePlatformNotifications(): NotificationsState {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const inviteSoonAt = new Date(
        now.getTime() + INVITE_SOON_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const trialSoonAt = new Date(
        now.getTime() + TRIAL_SOON_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const [orgsRes, profilesRes, invitesRes, trialsRes] = await Promise.all([
        supabase.from('organizations').select('id').is('deleted_at', null),
        supabase.from('profiles').select('organization_id').is('deleted_at', null),
        supabase
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .is('accepted_at', null)
          .is('deleted_at', null)
          .gte('expires_at', now.toISOString())
          .lte('expires_at', inviteSoonAt),
        supabase
          .from('org_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'trial')
          .not('trial_ends_at', 'is', null)
          .gte('trial_ends_at', now.toISOString())
          .lte('trial_ends_at', trialSoonAt),
      ]);

      const orgIdsWithMembers = new Set(
        (profilesRes.data ?? []).map((p) => p.organization_id).filter(Boolean)
      );
      const orgsWithoutMembers = (orgsRes.data ?? []).filter(
        (o) => !orgIdsWithMembers.has(o.id)
      ).length;

      const defs: NotificationItem[] = [
        {
          key: 'no-admin',
          label: 'Organizations need an admin',
          description: 'No members yet',
          href: '/platform/organizations',
          count: orgsWithoutMembers,
        },
        {
          key: 'invites-expiring',
          label: 'Invitations expiring soon',
          description: `Within ${INVITE_SOON_DAYS} days`,
          href: '/platform/organizations',
          count: invitesRes.count ?? 0,
        },
        {
          key: 'trials-ending',
          label: 'Trials ending soon',
          description: `Within ${TRIAL_SOON_DAYS} days`,
          href: '/platform/subscriptions',
          count: trialsRes.count ?? 0,
        },
      ];

      setItems(defs.filter((d) => d.count > 0));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = items.reduce((sum, i) => sum + i.count, 0);
  return { items, total, loading, refresh: load };
}
