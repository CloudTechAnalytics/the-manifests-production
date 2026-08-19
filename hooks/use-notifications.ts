'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function useNotifications(): NotificationsState {
  const { profile } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT);

      if (error) {
        console.error('Error loading notifications:', error);
        setItems([]);
        return;
      }
      setItems((data as AppNotification[]) ?? []);
    } finally {
      setLoading(false);
    }
  // Keyed on profile?.id, not the whole profile object — see
  // use-dashboard-data.ts for why.
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
      const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id);
      if (error) console.error('Error marking notification read:', error);
    },
    []
  );

  const markAllRead = useCallback(async () => {
    if (!profile) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('recipient_id', profile.id)
      .is('read_at', null);
    if (error) console.error('Error marking all notifications read:', error);
  // Keyed on profile?.id, not the whole profile object — see
  // use-dashboard-data.ts for why.
  }, [profile?.id]);

  const unreadCount = items.filter((n) => !n.read_at).length;
  return { items, unreadCount, loading, refresh: load, markRead, markAllRead };
}
