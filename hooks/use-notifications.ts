'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';

/*
 * Notifications for the tenant top-bar bell.
 *
 * These are live operational signals, not an inbox: each item is a count
 * of outstanding work derived from the same rules the dashboard's
 * Operational Alerts card uses, so the bell and the dashboard never
 * disagree. Because they are live, the badge clears when the underlying
 * work is done rather than when the dropdown is opened — there is no
 * fake "mark as read".
 *
 * Every query is a HEAD count (no rows fetched) and branch-scoped exactly
 * like the dashboard: an admin sees the whole organization, everyone else
 * only their own branch. RLS is the real boundary; the branch filter just
 * matches what each role already sees elsewhere.
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

export function useNotifications(): NotificationsState {
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';
  const branchFilter = isAdmin ? null : profile?.branch_id ?? null;

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Built then conditionally narrowed by branch, mirroring the dashboard
      // hook. Reassigning the builder (rather than a generic wrapper) keeps
      // TypeScript from recursing into Supabase's query-builder types.
      let docsQuery = supabase
        .from('shipments')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'documentation');
      if (branchFilter) docsQuery = docsQuery.eq('branch_id', branchFilter);

      let quotesQuery = supabase
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'sent');
      if (branchFilter) quotesQuery = quotesQuery.eq('branch_id', branchFilter);

      let delayedQuery = supabase
        .from('shipments')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .not('status', 'in', '(delivered,cancelled)')
        .not('estimated_arrival', 'is', null)
        .lt('estimated_arrival', today);
      if (branchFilter) delayedQuery = delayedQuery.eq('branch_id', branchFilter);

      const [docs, quotes, delayed] = await Promise.all([
        docsQuery,
        quotesQuery,
        delayedQuery,
      ]);

      const defs: NotificationItem[] = [
        {
          key: 'delayed',
          label: 'Shipments delayed',
          description: 'Past estimated arrival',
          href: '/shipments',
          count: delayed.count ?? 0,
        },
        {
          key: 'documentation',
          label: 'Awaiting documentation',
          description: 'Need paperwork to proceed',
          href: '/shipments?status=documentation',
          count: docs.count ?? 0,
        },
        {
          key: 'quotations',
          label: 'Quotations pending',
          description: 'Awaiting customer response',
          href: '/quotations?status=sent',
          count: quotes.count ?? 0,
        },
      ];

      // Only surface signals that actually have outstanding items.
      setItems(defs.filter((d) => d.count > 0));
    } catch {
      // A failed count shouldn't break the shell — show nothing rather
      // than a broken bell.
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [profile, branchFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const total = items.reduce((sum, i) => sum + i.count, 0);
  return { items, total, loading, refresh: load };
}
