'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { PIPELINE_STAGES, pickPrimaryCurrency } from '@/lib/utils/status';
import type {
  Quotation,
  Shipment,
  ShipmentStatus,
} from '@/types';

export interface DashboardStats {
  totalCustomers: number;
  pendingQuotations: number;
  activeShipments: number;
  deliveredShipments: number;
  delayedShipments: number;
}

export interface PipelineCounts {
  key: string;
  label: string;
  count: number;
}

export interface TopCustomerByVolume {
  id: string;
  name: string;
  shipmentCount: number;
}

export interface RecentDelivery {
  id: string;
  reference_number: string | null;
  customerName: string;
  deliveredOn: string;
}

export interface BranchStat {
  branch_id: string;
  branch_name: string;
  customers: number;
  shipments: number;
  quotations: number;
}

export interface RevenueTrendPoint {
  day: string;
  label: string;
  cumulative: number;
}

export interface DashboardData {
  loading: boolean;
  stats: DashboardStats;
  revenueByCurrency: Record<string, number>;
  primaryCurrency: string | null;
  revenueCollectedByCurrency: Record<string, number>;
  primaryCollectedCurrency: string | null;
  revenueCollectedThisMonth: number;
  quotationConversionRate: number | null;
  shipmentCompletionRate: number | null;
  pipeline: PipelineCounts[];
  revenueTrend: RevenueTrendPoint[];
  alerts: {
    awaitingDocumentation: number;
    quotationsPendingApproval: number;
    shipmentsDelayed: number;
    shipmentsMissingDocuments: number;
  };
  recentShipments: Shipment[];
  recentQuotations: Quotation[];
  recentDeliveries: RecentDelivery[];
  topCustomersByVolume: TopCustomerByVolume[];
  branchStats: BranchStat[];
  isAdmin: boolean;
}

const EMPTY_STATS: DashboardStats = {
  totalCustomers: 0,
  pendingQuotations: 0,
  activeShipments: 0,
  deliveredShipments: 0,
  delayedShipments: 0,
};

/**
 * Single source of truth for every query the Operations Center dashboard
 * needs. Consolidates what used to be several narrow count-only queries
 * (plus a per-branch N+1 loop for the admin branch summary) into a
 * handful of broader fetches that get aggregated in memory, so derived
 * metrics (pipeline stages, top customers, delayed shipments, missing
 * documents, branch summary) don't need extra round-trips per widget.
 */
export function useDashboardData(): DashboardData {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchFilter = isAdmin ? null : profile?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [revenueByCurrency, setRevenueByCurrency] = useState<Record<string, number>>({});
  const [revenueCollectedByCurrency, setRevenueCollectedByCurrency] = useState<
    Record<string, number>
  >({});
  const [revenueCollectedThisMonth, setRevenueCollectedThisMonth] = useState(0);
  const [quotationConversionRate, setQuotationConversionRate] = useState<number | null>(null);
  const [shipmentCompletionRate, setShipmentCompletionRate] = useState<number | null>(null);
  const [pipeline, setPipeline] = useState<PipelineCounts[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
  const [alerts, setAlerts] = useState({
    awaitingDocumentation: 0,
    quotationsPendingApproval: 0,
    shipmentsDelayed: 0,
    shipmentsMissingDocuments: 0,
  });
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [recentQuotations, setRecentQuotations] = useState<Quotation[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  const [topCustomersByVolume, setTopCustomersByVolume] = useState<TopCustomerByVolume[]>([]);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      setLoading(true);

      try {
        const today = new Date().toISOString().split('T')[0];

        // --- Build every query up front, then fire them all in parallel ----
        // None of these queries depends on another's result (only on
        // branchFilter/isAdmin, both already known), so there's no reason
        // to pay their network round-trips one after another. Sequentially
        // awaiting 8 queries at ~300-900ms each was adding several seconds
        // to every dashboard load; Promise.all bounds total wait time to
        // the single slowest query instead of their sum.

        let custQuery = supabase
          .from('customers')
          .select('id, branch_id')
          .is('deleted_at', null);
        if (branchFilter) custQuery = custQuery.eq('branch_id', branchFilter);

        let quotAggQuery = supabase
          .from('quotations')
          .select('status, total, currency, branch_id, updated_at')
          .is('deleted_at', null);
        if (branchFilter) quotAggQuery = quotAggQuery.eq('branch_id', branchFilter);

        let paymentsQuery = supabase
          .from('payments')
          .select('amount, currency, payment_date, branch_id')
          .is('deleted_at', null);
        if (branchFilter) paymentsQuery = paymentsQuery.eq('branch_id', branchFilter);

        let shipAggQuery = supabase
          .from('shipments')
          .select(
            'id, reference_number, status, estimated_arrival, actual_arrival, updated_at, customer_id, branch_id, customer:customers(company_name)'
          )
          .is('deleted_at', null);
        if (branchFilter) shipAggQuery = shipAggQuery.eq('branch_id', branchFilter);

        let docQuery = supabase
          .from('documents')
          .select('shipment_id')
          .is('deleted_at', null)
          .not('shipment_id', 'is', null);
        if (branchFilter) docQuery = docQuery.eq('branch_id', branchFilter);

        let recentShipQuery = supabase
          .from('shipments')
          .select(
            '*, customer:customers(*), branch:branches(*), assigned_user:profiles!shipments_assigned_to_fkey(id, full_name)'
          )
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (branchFilter) recentShipQuery = recentShipQuery.eq('branch_id', branchFilter);

        let recentQuotQuery = supabase
          .from('quotations')
          .select('*, customer:customers(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (branchFilter) recentQuotQuery = recentQuotQuery.eq('branch_id', branchFilter);

        const branchesQuery = isAdmin
          ? supabase.from('branches').select('id, name').is('deleted_at', null)
          : null;

        const [
          { data: custRows },
          { data: quotAgg },
          { data: paymentRows },
          { data: shipAgg },
          { data: docRows },
          { data: recentShips },
          { data: recentQuots },
          branchesResult,
        ] = await Promise.all([
          custQuery,
          quotAggQuery,
          paymentsQuery,
          shipAggQuery,
          docQuery,
          recentShipQuery,
          recentQuotQuery,
          branchesQuery ?? Promise.resolve({ data: null }),
        ]);

        let pendingQuotations = 0;
        let sentCount = 0;
        let approvedCount = 0;
        let rejectedCount = 0;
        let expiredCount = 0;
        const revenue: Record<string, number> = {};
        const quotationsByBranch = new Map<string, number>();

        (quotAgg ?? []).forEach((q) => {
          if (q.status === 'draft' || q.status === 'sent') pendingQuotations++;
          if (q.status === 'sent') sentCount++;
          if (q.status === 'approved') {
            approvedCount++;
            revenue[q.currency] = (revenue[q.currency] ?? 0) + Number(q.total);
          }
          if (q.status === 'rejected') rejectedCount++;
          if (q.status === 'expired') expiredCount++;
          quotationsByBranch.set(
            q.branch_id,
            (quotationsByBranch.get(q.branch_id) ?? 0) + 1
          );
        });

        const decided = approvedCount + rejectedCount + expiredCount;
        const conversionRate = decided > 0 ? (approvedCount / decided) * 100 : null;

        // --- Revenue trend: cumulative approved-quotation revenue, day by
        // day, for the current month so far (primary currency only, same
        // reasoning as the Revenue KPI — avoids blending currencies). ---
        const trendCurrency = pickPrimaryCurrency(revenue);
        const now = new Date();
        const trendYear = now.getFullYear();
        const trendMonth = now.getMonth();
        const daysSoFar = now.getDate();

        const dailyTotals = new Map<number, number>();
        (quotAgg ?? []).forEach((q) => {
          if (q.status !== 'approved') return;
          if (trendCurrency && q.currency !== trendCurrency) return;
          const d = new Date(q.updated_at);
          if (d.getFullYear() !== trendYear || d.getMonth() !== trendMonth) return;
          const day = d.getDate();
          dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + Number(q.total));
        });

        let runningTotal = 0;
        const trend: RevenueTrendPoint[] = [];
        for (let day = 1; day <= daysSoFar; day++) {
          runningTotal += dailyTotals.get(day) ?? 0;
          const d = new Date(trendYear, trendMonth, day);
          trend.push({
            day: String(day),
            label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            cumulative: Math.round(runningTotal * 100) / 100,
          });
        }

        // --- Payments aggregation -------------------------------------------
        // Powers: Revenue Collected — actual cash received via the Finance
        // module, kept distinct from "Pipeline Value Won" above (which is
        // approved-quotation value, not money in hand).
        const collected: Record<string, number> = {};
        (paymentRows ?? []).forEach((p) => {
          collected[p.currency] = (collected[p.currency] ?? 0) + Number(p.amount);
        });
        const collectedPrimaryCurrency = pickPrimaryCurrency(collected);

        let collectedThisMonth = 0;
        (paymentRows ?? []).forEach((p) => {
          if (p.currency !== collectedPrimaryCurrency) return;
          const d = new Date(p.payment_date);
          if (d.getFullYear() === trendYear && d.getMonth() === trendMonth) {
            collectedThisMonth += Number(p.amount);
          }
        });

        // --- Shipments aggregation -------------------------------------------
        // Powers: Active/Delivered/Delayed KPIs, pipeline stages, top
        // customers by volume, recent deliveries, the "missing documents"
        // alert, and per-branch shipment counts.
        type ShipAggRow = {
          id: string;
          reference_number: string | null;
          status: ShipmentStatus;
          estimated_arrival: string | null;
          actual_arrival: string | null;
          updated_at: string;
          customer_id: string;
          branch_id: string;
          customer: { company_name: string } | null;
        };
        const shipRows = (shipAgg ?? []) as unknown as ShipAggRow[];

        let activeCount = 0;
        let deliveredCount = 0;
        let delayedCount = 0;
        const activeShipmentIds = new Set<string>();
        const customerVolume = new Map<string, { name: string; count: number }>();
        const shipmentsByBranch = new Map<string, number>();

        shipRows.forEach((s) => {
          const isTerminal = s.status === 'delivered' || s.status === 'cancelled';
          if (!isTerminal) {
            activeCount++;
            activeShipmentIds.add(s.id);
            if (s.estimated_arrival && s.estimated_arrival < today) {
              delayedCount++;
            }
          }
          if (s.status === 'delivered') deliveredCount++;

          const existing = customerVolume.get(s.customer_id);
          if (existing) {
            existing.count++;
          } else {
            customerVolume.set(s.customer_id, {
              name: s.customer?.company_name ?? 'Unknown',
              count: 1,
            });
          }

          shipmentsByBranch.set(
            s.branch_id,
            (shipmentsByBranch.get(s.branch_id) ?? 0) + 1
          );
        });

        const completionRate =
          deliveredCount + activeCount > 0
            ? (deliveredCount / (deliveredCount + activeCount)) * 100
            : null;

        const pipelineCounts: PipelineCounts[] = PIPELINE_STAGES.map((stage) => {
          if (stage.key === 'quotation') {
            return { key: stage.key, label: stage.label, count: approvedCount };
          }
          const count = shipRows.filter((s) =>
            (stage.statuses as ShipmentStatus[]).includes(s.status)
          ).length;
          return { key: stage.key, label: stage.label, count };
        });

        const topCustomers: TopCustomerByVolume[] = Array.from(
          customerVolume.entries()
        )
          .map(([id, v]) => ({ id, name: v.name, shipmentCount: v.count }))
          .sort((a, b) => b.shipmentCount - a.shipmentCount)
          .slice(0, 5);

        const deliveries: RecentDelivery[] = shipRows
          .filter((s) => s.status === 'delivered')
          .sort(
            (a, b) =>
              new Date(b.actual_arrival ?? b.updated_at).getTime() -
              new Date(a.actual_arrival ?? a.updated_at).getTime()
          )
          .slice(0, 5)
          .map((s) => ({
            id: s.id,
            reference_number: s.reference_number,
            customerName: s.customer?.company_name ?? 'Unknown',
            deliveredOn: s.actual_arrival ?? s.updated_at,
          }));

        // --- Documents with a shipment link (for "missing documents" alert) --
        const shipmentsWithDocs = new Set(
          (docRows ?? []).map((d) => d.shipment_id as string)
        );
        let missingDocsCount = 0;
        activeShipmentIds.forEach((id) => {
          if (!shipmentsWithDocs.has(id)) missingDocsCount++;
        });

        // --- Branch summary (admin only), derived from data already fetched --
        let bStats: BranchStat[] = [];
        if (isAdmin) {
          const branches = branchesResult.data;

          const customersByBranch = new Map<string, number>();
          (custRows ?? []).forEach((c) => {
            customersByBranch.set(
              c.branch_id,
              (customersByBranch.get(c.branch_id) ?? 0) + 1
            );
          });

          bStats = (branches ?? []).map((b) => ({
            branch_id: b.id,
            branch_name: b.name,
            customers: customersByBranch.get(b.id) ?? 0,
            shipments: shipmentsByBranch.get(b.id) ?? 0,
            quotations: quotationsByBranch.get(b.id) ?? 0,
          }));
        }

        setStats({
          totalCustomers: (custRows ?? []).length,
          pendingQuotations,
          activeShipments: activeCount,
          deliveredShipments: deliveredCount,
          delayedShipments: delayedCount,
        });
        setRevenueByCurrency(revenue);
        setRevenueCollectedByCurrency(collected);
        setRevenueCollectedThisMonth(collectedThisMonth);
        setQuotationConversionRate(conversionRate);
        setShipmentCompletionRate(completionRate);
        setPipeline(pipelineCounts);
        setRevenueTrend(trend);
        setAlerts({
          awaitingDocumentation:
            pipelineCounts.find((p) => p.key === 'documentation')?.count ?? 0,
          quotationsPendingApproval: sentCount,
          shipmentsDelayed: delayedCount,
          shipmentsMissingDocuments: missingDocsCount,
        });
        setRecentShipments((recentShips as Shipment[]) ?? []);
        setRecentQuotations((recentQuots as Quotation[]) ?? []);
        setRecentDeliveries(deliveries);
        setTopCustomersByVolume(topCustomers);
        setBranchStats(bStats);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile, isAdmin, branchFilter]);

  return {
    loading,
    stats,
    revenueByCurrency,
    primaryCurrency: pickPrimaryCurrency(revenueByCurrency),
    revenueCollectedByCurrency,
    primaryCollectedCurrency: pickPrimaryCurrency(revenueCollectedByCurrency),
    revenueCollectedThisMonth,
    quotationConversionRate,
    shipmentCompletionRate,
    pipeline,
    revenueTrend,
    alerts,
    recentShipments,
    recentQuotations,
    recentDeliveries,
    topCustomersByVolume,
    branchStats,
    isAdmin,
  };
}
