'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { AppNotification } from '@/types';

/*
 * Notifications for the tenant top-bar bell — a real per-user inbox
 * (migration 053's `notifications` table), not a derived live count.
 * Rows are written only by trusted server-side paths (currently the
 * convert_quotation_to_shipment RPC, notifying Operations on shipment
 * creation; more event triggers land there over time) — there's no
 * client INSERT policy, so this hook only ever reads and marks read.
 *
 * The previous "live operational signals" version of this hook (delayed
 * shipments, docs due, quotations pending) still exists as
 * components/dashboard/operational-alerts.tsx — a distinct, always-live
 * metrics concept that isn't lost, just no longer conflated with the
 * bell.
 *
 * markRead/markAllRead use SWR's optimistic-mutate: the bell updates
 * instantly, the DB write happens in the background, and a failure
 * rolls the local state back — this is exactly the kind of low-stakes,
 * easily-reversible action optimistic UI is meant for, unlike payments/
 * invoices/shipment creation, which always wait for server confirmation.
 */

export interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const RECENT_LIMIT = 20;

async function fetchNotifications(recipientId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);

  if (error) {
    console.error('Error loading notifications:', error);
    return [];
  }
  return (data as AppNotification[]) ?? [];
}

export function useNotifications(): NotificationsState {
  const { profile } = useAuth();

  const { data, isLoading, mutate } = useSWR(
    profile?.id ? ['notifications', profile.id] : null,
    () => fetchNotifications(profile!.id),
    { dedupingInterval: 5000 }
  );

  const items = data ?? [];
  const refresh = () => {
    mutate();
  };

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const optimistic = items.map((n) => (n.id === id ? { ...n, read_at: now } : n));
      await mutate(
        async () => {
          const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id);
          if (error) {
            console.error('Error marking notification read:', error);
            throw error;
          }
          return optimistic;
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
      );
    },
    [items, mutate]
  );

  const markAllRead = useCallback(async () => {
    if (!profile) return;
    const now = new Date().toISOString();
    const optimistic = items.map((n) => (n.read_at ? n : { ...n, read_at: now }));
    await mutate(
      async () => {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: now })
          .eq('recipient_id', profile.id)
          .is('read_at', null);
        if (error) {
          console.error('Error marking all notifications read:', error);
          throw error;
        }
        return optimistic;
      },
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
    );
  }, [profile, items, mutate]);

  const unreadCount = items.filter((n) => !n.read_at).length;
  return { items, unreadCount, loading: isLoading, refresh, markRead, markAllRead };
}
