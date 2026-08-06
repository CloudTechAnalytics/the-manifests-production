'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';

/*
 * Sidebar badge counts — outstanding work per department, for the nav
 * items that show a number (Documentation, Customs, Terminal, Warehouse,
 * Transport, Invoices, Approvals). Every query is a HEAD count (no rows
 * fetched) except Warehouse, which needs quantity vs. reorder_point from
 * two tables and has no other way to filter that server-side without a
 * new view. Branch-scoped exactly like useNotifications/useDashboardData:
 * an admin or branch_manager sees the whole org, everyone else only
 * their own branch — RLS is the real boundary, this just matches what
 * each role already sees elsewhere.
 *
 * Fired once on mount, not polled — a stale-by-a-few-minutes badge count
 * is an acceptable tradeoff against "unnecessary API calls" on every
 * render/navigation.
 */

export interface NavBadgeCounts {
  documentation: number;
  customs: number;
  terminal: number;
  warehouse: number;
  transport: number;
  invoices: number;
  approvals: number;
}

const EMPTY_COUNTS: NavBadgeCounts = {
  documentation: 0,
  customs: 0,
  terminal: 0,
  warehouse: 0,
  transport: 0,
  invoices: 0,
  approvals: 0,
};

export function useNavBadges(): NavBadgeCounts & { loading: boolean } {
  const { profile, hasRole } = useAuth();
  const [counts, setCounts] = useState<NavBadgeCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';
  const seesWholeOrg = isAdmin || hasRole('branch_manager');
  const branchFilter = seesWholeOrg ? null : profile?.branch_id ?? null;

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let docsQuery = supabase
        .from('shipments')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'documentation');
      if (branchFilter) docsQuery = docsQuery.eq('branch_id', branchFilter);

      let customsQuery = supabase
        .from('shipment_customs')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .not('status', 'in', '(released,rejected)');
      if (branchFilter) customsQuery = customsQuery.eq('branch_id', branchFilter);

      let terminalQuery = supabase
        .from('terminal_operations')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .neq('status', 'released');
      if (branchFilter) terminalQuery = terminalQuery.eq('branch_id', branchFilter);

      let transportQuery = supabase
        .from('shipments')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'arrived');
      if (branchFilter) transportQuery = transportQuery.eq('branch_id', branchFilter);

      let invoicesQuery = supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['sent', 'partial']);
      if (branchFilter) invoicesQuery = invoicesQuery.eq('branch_id', branchFilter);

      let expenseApprovalsQuery = supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'pending');
      if (branchFilter) expenseApprovalsQuery = expenseApprovalsQuery.eq('branch_id', branchFilter);

      let quotationApprovalsQuery = supabase
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'pending_approval');
      if (branchFilter) quotationApprovalsQuery = quotationApprovalsQuery.eq('branch_id', branchFilter);

      // Warehouse can't be a head-count: "low stock" is quantity vs. the
      // item's own reorder_point, two tables, no server-side filter for
      // that comparison without a new SQL view. Fetches the (small, per-
      // branch) stock list once and compares client-side instead.
      let warehouseQuery = supabase
        .from('warehouse_stock')
        .select('quantity, item:stock_items(reorder_point, branch_id)');
      if (branchFilter) warehouseQuery = warehouseQuery.eq('branch_id', branchFilter);

      const [
        docs,
        customs,
        terminal,
        transport,
        invoices,
        expenseApprovals,
        quotationApprovals,
        warehouseStock,
      ] = await Promise.all([
        docsQuery,
        customsQuery,
        terminalQuery,
        transportQuery,
        invoicesQuery,
        expenseApprovalsQuery,
        quotationApprovalsQuery,
        warehouseQuery,
      ]);

      const lowStockCount = (
        (warehouseStock.data as unknown as { quantity: number; item: { reorder_point: number } | null }[]) ?? []
      ).filter((row) => row.item && row.quantity <= row.item.reorder_point).length;

      setCounts({
        documentation: docs.count ?? 0,
        customs: customs.count ?? 0,
        terminal: terminal.count ?? 0,
        warehouse: lowStockCount,
        transport: transport.count ?? 0,
        invoices: invoices.count ?? 0,
        approvals: (expenseApprovals.count ?? 0) + (quotationApprovals.count ?? 0),
      });
    } catch {
      // A failed count shouldn't break the sidebar — show no badges
      // rather than a broken one.
      setCounts(EMPTY_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [profile, branchFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...counts, loading };
}
