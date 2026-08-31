import { supabase } from '@/shared/lib/supabase/client';
import type {
  Customer,
  Quotation,
  Shipment,
  ShipmentStatus,
  Activity,
  Branch,
} from '@/shared/types';

export type CustomerReportRow = Customer & {
  shipment_count?: number;
  quotation_count?: number;
};

export type ShipmentReportRow = Shipment & {
  customer?: { id: string; company_name: string } | null;
};

export type QuotationReportRow = Quotation & {
  customer?: { id: string; company_name: string } | null;
};

export type ActivityReportRow = Activity & {
  userName: string;
};

export type ProfitabilityRow = {
  id: string;
  reference_number: string | null;
  status: ShipmentStatus;
  customer_name: string;
  currency: string;
  revenue: number;
  cost: number;
  margin: number;
};

export interface ReportFilters {
  branchId: string | null;
  fromDate: string;
  toDate: string;
}

/** Applies the shared from/to date-range filter to a report query. */
function applyDateRange<Q extends { gte: (col: string, val: string) => Q; lte: (col: string, val: string) => Q }>(
  query: Q,
  column: string,
  fromDate: string,
  toDate: string
): Q {
  let q = query;
  if (fromDate) {
    q = q.gte(column, fromDate);
  }
  if (toDate) {
    // Add one day to make the "to" date inclusive (end of day)
    const endOfDay = new Date(toDate);
    endOfDay.setDate(endOfDay.getDate() + 1);
    q = q.lte(column, endOfDay.toISOString().split('T')[0]);
  }
  return q;
}

export async function fetchBranchesForReports(): Promise<Branch[]> {
  const { data } = await supabase.from('branches').select('*').is('deleted_at', null).order('name', { ascending: true });
  return (data as Branch[]) ?? [];
}

export async function fetchCustomersReport({ branchId, fromDate, toDate }: ReportFilters): Promise<CustomerReportRow[]> {
  let query = supabase
    .from('customers')
    .select('*, branch:branches(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);
  query = applyDateRange(query, 'created_at', fromDate, toDate);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading customers report:', error);
    return [];
  }
  const customerRows = (data as CustomerReportRow[]) ?? [];

  // Per-customer shipment/quotation counts via one grouped SQL query
  // (migration 070) instead of fetching every matching shipment/
  // quotation row unbounded just to .length them in JS.
  if (customerRows.length > 0) {
    const customerIds = customerRows.map((c) => c.id);
    const { data: counts, error: countsError } = await supabase.rpc('customer_shipment_quotation_counts', {
      p_customer_ids: customerIds,
    });
    if (countsError) {
      console.error('Error loading customer report counts:', countsError);
    } else {
      const countMap = new Map(
        (counts as { customer_id: string; shipment_count: number; quotation_count: number }[]).map((row) => [
          row.customer_id,
          row,
        ])
      );
      customerRows.forEach((c) => {
        const row = countMap.get(c.id);
        c.shipment_count = row?.shipment_count ?? 0;
        c.quotation_count = row?.quotation_count ?? 0;
      });
    }
  }

  return customerRows;
}

export async function fetchShipmentsReport({ branchId, fromDate, toDate }: ReportFilters): Promise<ShipmentReportRow[]> {
  let query = supabase
    .from('shipments')
    .select('*, customer:customers(id, company_name), branch:branches(id, name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);
  query = applyDateRange(query, 'booking_date', fromDate, toDate);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading shipments report:', error);
    return [];
  }
  return (data as ShipmentReportRow[]) ?? [];
}

export async function fetchQuotationsReport({ branchId, fromDate, toDate }: ReportFilters): Promise<QuotationReportRow[]> {
  let query = supabase
    .from('quotations')
    .select('*, customer:customers(id, company_name), branch:branches(id, name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);
  query = applyDateRange(query, 'created_at', fromDate, toDate);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading quotations report:', error);
    return [];
  }
  return (data as QuotationReportRow[]) ?? [];
}

export async function fetchActivitiesReport({ branchId, fromDate, toDate }: ReportFilters): Promise<ActivityReportRow[]> {
  let query = supabase.from('activities').select('*').order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);
  query = applyDateRange(query, 'created_at', fromDate, toDate);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading activities report:', error);
    return [];
  }
  const rows = (data as Activity[]) ?? [];

  // activities.user_id is a FK to auth.users, not profiles — no PostgREST
  // embed exists for it, so actor names are batch-fetched separately and
  // mapped in memory (same pattern used in activity-log and audit-logs).
  const actorIds = Array.from(new Set(rows.map((a) => a.user_id).filter(Boolean))) as string[];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actorRows } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
    (actorRows ?? []).forEach((p) => actorNames.set(p.id, p.full_name));
  }

  return rows.map((a) => ({
    ...a,
    userName: a.user_id ? actorNames.get(a.user_id) ?? 'Unknown user' : 'System',
  }));
}

// Revenue = billed invoice totals per shipment. Cost = approved expenses
// plus customs duty — the two real out-of-pocket costs already tracked
// elsewhere in the app.
async function computeProfitability(shipmentRows: ShipmentReportRow[]): Promise<ProfitabilityRow[]> {
  if (shipmentRows.length === 0) return [];
  const ids = shipmentRows.map((s) => s.id);

  const [{ data: invoiceRows }, { data: expenseRows }, { data: customsRows }] = await Promise.all([
    supabase.from('invoices').select('shipment_id, total, currency').in('shipment_id', ids).is('deleted_at', null),
    supabase
      .from('expenses')
      .select('shipment_id, amount')
      .in('shipment_id', ids)
      .eq('status', 'approved')
      .is('deleted_at', null),
    supabase.from('shipment_customs').select('shipment_id, duty_amount').in('shipment_id', ids).is('deleted_at', null),
  ]);

  const revenueByShipment = new Map<string, number>();
  const currencyByShipment = new Map<string, string>();
  (invoiceRows ?? []).forEach((row: { shipment_id: string | null; total: number; currency: string }) => {
    if (!row.shipment_id) return;
    revenueByShipment.set(row.shipment_id, (revenueByShipment.get(row.shipment_id) ?? 0) + Number(row.total));
    if (!currencyByShipment.has(row.shipment_id)) currencyByShipment.set(row.shipment_id, row.currency);
  });

  const costByShipment = new Map<string, number>();
  (expenseRows ?? []).forEach((row: { shipment_id: string | null; amount: number }) => {
    if (!row.shipment_id) return;
    costByShipment.set(row.shipment_id, (costByShipment.get(row.shipment_id) ?? 0) + Number(row.amount));
  });
  (customsRows ?? []).forEach((row: { shipment_id: string; duty_amount: number }) => {
    costByShipment.set(row.shipment_id, (costByShipment.get(row.shipment_id) ?? 0) + Number(row.duty_amount));
  });

  return shipmentRows
    .filter((s) => revenueByShipment.has(s.id) || costByShipment.has(s.id))
    .map((s) => {
      const revenue = revenueByShipment.get(s.id) ?? 0;
      const cost = costByShipment.get(s.id) ?? 0;
      return {
        id: s.id,
        reference_number: s.reference_number,
        status: s.status,
        customer_name: s.customer?.company_name ?? '—',
        currency: currencyByShipment.get(s.id) ?? 'NGN',
        revenue,
        cost,
        margin: revenue - cost,
      };
    });
}

export async function fetchProfitabilityReport(filters: ReportFilters): Promise<ProfitabilityRow[]> {
  const shipmentRows = await fetchShipmentsReport(filters);
  return computeProfitability(shipmentRows);
}
