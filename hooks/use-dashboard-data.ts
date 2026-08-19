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

/**
 * Receivables position, derived from `invoices`. "Outstanding" is any
 * non-cancelled invoice that has been issued but not settled (status
 * `sent` or `partial`), valued at total - amount_paid so a partially
 * paid invoice only counts for the balance still owed.
 */
export interface FinanceSummaryData {
  invoicedByCurrency: Record<string, number>;
  outstandingByCurrency: Record<string, number>;
  collectedByCurrency: Record<string, number>;
  expensesByCurrency: Record<string, number>;
  /** Approved expenses in the demurrage/storage/re_examination_penalty
   *  categories — a subset of expensesByCurrency, broken out so the
   *  financial cost of customs-clearance delays is visible on its own. */
  costOfDelayByCurrency: Record<string, number>;
  primaryCurrency: string | null;
  outstandingCount: number;
  overdueCount: number;
}

/** Live counts by `shipment_plans.status`, plus high-priority workload. */
export interface PlanningOverviewData {
  total: number;
  planned: number;
  approved: number;
  inProgress: number;
  completed: number;
  highPriority: number;
}

export interface ActivityItem {
  id: string;
  action: string;
  description: string;
  created_at: string;
  userName: string;
}

export type ScheduleEventType =
  | 'booking'
  | 'est_departure'
  | 'est_arrival'
  | 'actual_departure'
  | 'actual_arrival';

/**
 * A single dated milestone falling on today, expanded from the date
 * columns already on `shipments` — the same fields the Calendar page
 * derives its events from, so the dashboard preview and the calendar
 * can never disagree.
 */
export interface ScheduleEvent {
  id: string;
  shipmentId: string;
  type: ScheduleEventType;
  reference: string | null;
  customerName: string;
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
    quotationsAwaitingResponse: number;
    shipmentsDelayed: number;
    shipmentsMissingDocuments: number;
  };
  recentShipments: Shipment[];
  recentQuotations: Quotation[];
  recentDeliveries: RecentDelivery[];
  topCustomersByVolume: TopCustomerByVolume[];
  branchStats: BranchStat[];
  finance: FinanceSummaryData;
  planning: PlanningOverviewData;
  todaySchedule: ScheduleEvent[];
  recentActivity: ActivityItem[];
  isAdmin: boolean;
}

const EMPTY_FINANCE: FinanceSummaryData = {
  invoicedByCurrency: {},
  outstandingByCurrency: {},
  collectedByCurrency: {},
  expensesByCurrency: {},
  costOfDelayByCurrency: {},
  primaryCurrency: null,
  outstandingCount: 0,
  overdueCount: 0,
};

const EMPTY_PLANNING: PlanningOverviewData = {
  total: 0,
  planned: 0,
  approved: 0,
  inProgress: 0,
  completed: 0,
  highPriority: 0,
};

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
    quotationsAwaitingResponse: 0,
    shipmentsDelayed: 0,
    shipmentsMissingDocuments: 0,
  });
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [recentQuotations, setRecentQuotations] = useState<Quotation[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  const [topCustomersByVolume, setTopCustomersByVolume] = useState<TopCustomerByVolume[]>([]);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [finance, setFinance] = useState<FinanceSummaryData>(EMPTY_FINANCE);
  const [planning, setPlanning] = useState<PlanningOverviewData>(EMPTY_PLANNING);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleEvent[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      setLoading(true);

      try {
        const today = new Date().toISOString().split('T')[0];

        // ------------------------------------------------------------------
        // Every read below is independent of the others, so they are built
        // first and then issued as ONE concurrent batch. Awaiting them in
        // sequence cost a full network round-trip each — on a high-latency
        // link that serialised delay, not query time, dominated how long the
        // dashboard took to paint. Only the activity-actor lookup further
        // down genuinely depends on an earlier result, so it stays after.
        // ------------------------------------------------------------------

        // Customers (id + branch_id): Total Customers KPI and, for admins,
        // per-branch customer counts in the branch summary.
        let custQuery = supabase
          .from('customers')
          .select('id, branch_id')
          .is('deleted_at', null);
        if (branchFilter) custQuery = custQuery.eq('branch_id', branchFilter);

        // Quotations: Pending Quotations KPI, Revenue KPI, Quotation stage of
        // the pipeline, Quotation Conversion Rate, the "pending approval"
        // alert, and per-branch quotation counts.
        let quotAggQuery = supabase
          .from('quotations')
          .select('status, total, currency, branch_id, updated_at')
          .is('deleted_at', null);
        if (branchFilter) quotAggQuery = quotAggQuery.eq('branch_id', branchFilter);

        // Payments: Revenue Collected — actual cash received via the Finance
        // module, kept distinct from "Pipeline Value Won" (approved-quotation
        // value, not money in hand). Payments don't carry a currency column
        // in this schema (same reasoning as app/(app)/payments/page.tsx) —
        // treated as NGN below, not selected here since the column doesn't
        // exist (selecting it 400s the whole query).
        let paymentsQuery = supabase
          .from('payments')
          .select('amount, payment_date, branch_id')
          .is('deleted_at', null);
        if (branchFilter) paymentsQuery = paymentsQuery.eq('branch_id', branchFilter);

        // Shipments: Active/Delivered/Delayed KPIs, pipeline stages, top
        // customers by volume, recent deliveries, today's schedule, the
        // "missing documents" alert, and per-branch shipment counts.
        let shipAggQuery = supabase
          .from('shipments')
          .select(
            'id, reference_number, status, booking_date, estimated_departure, actual_departure, estimated_arrival, actual_arrival, updated_at, customer_id, branch_id, customer:customers(company_name)'
          )
          .is('deleted_at', null);
        if (branchFilter) shipAggQuery = shipAggQuery.eq('branch_id', branchFilter);

        // Documents with a shipment link (for the "missing documents" alert).
        let docQuery = supabase
          .from('documents')
          .select('shipment_id')
          .is('deleted_at', null)
          .not('shipment_id', 'is', null);
        if (branchFilter) docQuery = docQuery.eq('branch_id', branchFilter);

        // Recent shipments (rich, for the table).
        let recentShipQuery = supabase
          .from('shipments')
          .select(
            '*, customer:customers(*), branch:branches(*), assigned_user:profiles!shipments_assigned_to_fkey(id, full_name)'
          )
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (branchFilter) recentShipQuery = recentShipQuery.eq('branch_id', branchFilter);

        // Recent quotations (any status, for the table).
        let recentQuotQuery = supabase
          .from('quotations')
          .select('*, customer:customers(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (branchFilter) recentQuotQuery = recentQuotQuery.eq('branch_id', branchFilter);

        // Invoices: Outstanding Invoices KPI and the Finance Summary card.
        let invQuery = supabase
          .from('invoices')
          .select('status, total, amount_paid, currency, due_date')
          .is('deleted_at', null);
        if (branchFilter) invQuery = invQuery.eq('branch_id', branchFilter);

        // Expenses: approved spend, for the Finance Summary. category is
        // included to break out the Cost of Delay figure (demurrage,
        // storage, re-examination penalties).
        let expQuery = supabase
          .from('expenses')
          .select('amount, currency, status, category')
          .is('deleted_at', null);
        if (branchFilter) expQuery = expQuery.eq('branch_id', branchFilter);

        // Shipment plans: Planning Overview.
        let planQuery = supabase
          .from('shipment_plans')
          .select('status, priority')
          .is('deleted_at', null);
        if (branchFilter) planQuery = planQuery.eq('branch_id', branchFilter);

        // Recent activity feed.
        let actQuery = supabase
          .from('activities')
          .select('id, action, description, created_at, user_id')
          .order('created_at', { ascending: false })
          .limit(6);
        if (branchFilter) actQuery = actQuery.eq('branch_id', branchFilter);

        // Branches (admin only) — resolved to an empty set for everyone else
        // so it can still join the same concurrent batch.
        const branchesQuery = isAdmin
          ? supabase.from('branches').select('id, name').is('deleted_at', null)
          : Promise.resolve({ data: [] as { id: string; name: string }[] });

        const [
          { data: custRows },
          { data: quotAgg },
          { data: paymentRows },
          { data: shipAgg },
          { data: docRows },
          { data: recentShips },
          { data: recentQuots },
          { data: invRows },
          { data: expRows },
          { data: planRows },
          { data: actRows },
          { data: branches },
        ] = await Promise.all([
          custQuery,
          quotAggQuery,
          paymentsQuery,
          shipAggQuery,
          docQuery,
          recentShipQuery,
          recentQuotQuery,
          invQuery,
          expQuery,
          planQuery,
          actQuery,
          branchesQuery,
        ]);

        let pendingQuotations = 0;
        let sentCount = 0;
        // "Won" = customer accepted, not merely internally approved —
        // approved is now a pre-send gate (see migration 044), accepted is
        // the terminal won state.
        let acceptedCount = 0;
        let rejectedCount = 0;
        let expiredCount = 0;
        const revenue: Record<string, number> = {};
        const quotationsByBranch = new Map<string, number>();

        (quotAgg ?? []).forEach((q) => {
          if (
            q.status === 'draft' ||
            q.status === 'pending_approval' ||
            q.status === 'approved' ||
            q.status === 'sent'
          ) {
            pendingQuotations++;
          }
          if (q.status === 'sent') sentCount++;
          if (q.status === 'accepted') {
            acceptedCount++;
            revenue[q.currency] = (revenue[q.currency] ?? 0) + Number(q.total);
          }
          if (q.status === 'rejected') rejectedCount++;
          if (q.status === 'expired') expiredCount++;
          quotationsByBranch.set(
            q.branch_id,
            (quotationsByBranch.get(q.branch_id) ?? 0) + 1
          );
        });

        const decided = acceptedCount + rejectedCount + expiredCount;
        const conversionRate = decided > 0 ? (acceptedCount / decided) * 100 : null;

        // --- Revenue trend: cumulative accepted-quotation revenue, day by
        // day, for the current month so far (primary currency only, same
        // reasoning as the Revenue KPI — avoids blending currencies). ---
        const trendCurrency = pickPrimaryCurrency(revenue);
        const now = new Date();
        const trendYear = now.getFullYear();
        const trendMonth = now.getMonth();
        const daysSoFar = now.getDate();

        const dailyTotals = new Map<number, number>();
        (quotAgg ?? []).forEach((q) => {
          if (q.status !== 'accepted') return;
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

        const collected: Record<string, number> = {};
        (paymentRows ?? []).forEach((p) => {
          collected.NGN = (collected.NGN ?? 0) + Number(p.amount);
        });
        const collectedPrimaryCurrency = pickPrimaryCurrency(collected);

        let collectedThisMonth = 0;
        (paymentRows ?? []).forEach((p) => {
          const d = new Date(p.payment_date);
          if (d.getFullYear() === trendYear && d.getMonth() === trendMonth) {
            collectedThisMonth += Number(p.amount);
          }
        });

        type ShipAggRow = {
          id: string;
          reference_number: string | null;
          status: ShipmentStatus;
          booking_date: string | null;
          estimated_departure: string | null;
          actual_departure: string | null;
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
            return { key: stage.key, label: stage.label, count: acceptedCount };
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

        // --- Receivables position, from the invoices already fetched --------
        // "Outstanding" = issued but unsettled (sent/partial), valued at the
        // remaining balance (total - amount_paid) rather than face value.
        const invoicedByCurrency: Record<string, number> = {};
        const outstandingByCurrency: Record<string, number> = {};
        let outstandingCount = 0;
        let overdueCount = 0;

        (invRows ?? []).forEach((inv) => {
          if (inv.status === 'cancelled' || inv.status === 'draft') return;
          invoicedByCurrency[inv.currency] =
            (invoicedByCurrency[inv.currency] ?? 0) + Number(inv.total);

          if (inv.status === 'sent' || inv.status === 'partial') {
            const balance = Number(inv.total) - Number(inv.amount_paid);
            if (balance > 0) {
              outstandingByCurrency[inv.currency] =
                (outstandingByCurrency[inv.currency] ?? 0) + balance;
              outstandingCount++;
              if (inv.due_date && inv.due_date < today) overdueCount++;
            }
          }
        });

        const DELAY_COST_CATEGORIES = new Set(['demurrage', 'storage', 're_examination_penalty']);
        const expensesByCurrency: Record<string, number> = {};
        const costOfDelayByCurrency: Record<string, number> = {};
        (expRows ?? []).forEach((e) => {
          if (e.status !== 'approved') return;
          expensesByCurrency[e.currency] =
            (expensesByCurrency[e.currency] ?? 0) + Number(e.amount);
          if (DELAY_COST_CATEGORIES.has(e.category)) {
            costOfDelayByCurrency[e.currency] =
              (costOfDelayByCurrency[e.currency] ?? 0) + Number(e.amount);
          }
        });

        const planningData: PlanningOverviewData = {
          total: (planRows ?? []).length,
          planned: 0,
          approved: 0,
          inProgress: 0,
          completed: 0,
          highPriority: 0,
        };
        (planRows ?? []).forEach((p) => {
          if (p.status === 'planned') planningData.planned++;
          if (p.status === 'approved') planningData.approved++;
          if (p.status === 'in_progress') planningData.inProgress++;
          if (p.status === 'completed') planningData.completed++;
          if (
            p.priority === 'high' &&
            p.status !== 'completed' &&
            p.status !== 'cancelled'
          ) {
            planningData.highPriority++;
          }
        });

        // --- Today's schedule, expanded from shipment date columns ----------
        // Same source fields the Calendar page uses, filtered to today only.
        const scheduleFields: [keyof ShipAggRow, ScheduleEventType][] = [
          ['booking_date', 'booking'],
          ['estimated_departure', 'est_departure'],
          ['actual_departure', 'actual_departure'],
          ['estimated_arrival', 'est_arrival'],
          ['actual_arrival', 'actual_arrival'],
        ];
        const schedule: ScheduleEvent[] = [];
        shipRows.forEach((s) => {
          scheduleFields.forEach(([field, type]) => {
            if (s[field] === today) {
              schedule.push({
                id: `${s.id}-${type}`,
                shipmentId: s.id,
                type,
                reference: s.reference_number,
                customerName: s.customer?.company_name ?? 'Unknown',
              });
            }
          });
        });

        // --- Recent activity actors -------------------------------------------
        // NOTE: activities.user_id is a FK to auth.users, not profiles, so a
        // PostgREST embed (profiles!activities_user_id_fkey) does not exist and
        // would fail the whole query. Names are mapped in memory instead. This
        // is the one read that must follow the batch — it needs the ids above.
        const actorIds = Array.from(
          new Set((actRows ?? []).map((a) => a.user_id).filter(Boolean))
        ) as string[];
        const actorNames = new Map<string, string>();
        if (actorIds.length > 0) {
          const { data: actorRows } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', actorIds);
          (actorRows ?? []).forEach((p) => actorNames.set(p.id, p.full_name));
        }

        const activityItems: ActivityItem[] = (actRows ?? []).map((a) => ({
          id: a.id,
          action: a.action,
          description: a.description,
          created_at: a.created_at,
          userName: a.user_id
            ? actorNames.get(a.user_id) ?? 'Unknown user'
            : 'System',
        }));

        setFinance({
          invoicedByCurrency,
          outstandingByCurrency,
          collectedByCurrency: collected,
          expensesByCurrency,
          costOfDelayByCurrency,
          primaryCurrency: pickPrimaryCurrency(invoicedByCurrency),
          outstandingCount,
          overdueCount,
        });
        setPlanning(planningData);
        setTodaySchedule(schedule);
        setRecentActivity(activityItems);

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
          quotationsAwaitingResponse: sentCount,
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
  // Keyed on profile?.id (not the whole profile object) deliberately —
  // auth-context can hand back a new profile object reference (e.g. after
  // refreshProfile() elsewhere in the app) without the identity, role, or
  // branch actually changing, and isAdmin/branchFilter already capture
  // every field this effect cares about.
  }, [profile?.id, isAdmin, branchFilter]);

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
    finance,
    planning,
    todaySchedule,
    recentActivity,
    isAdmin,
  };
}
