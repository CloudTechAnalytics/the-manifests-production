import { supabase } from '@/shared/lib/supabase/client';
import type { Quotation } from '@/shared/types';

export type ShipmentLite = {
  id: string;
  reference_number: string | null;
  customer?: { company_name: string } | null;
};

export interface WorkQueueRawData {
  docs: { data: (ShipmentLite & { estimated_departure: string | null })[]; count: number | null };
  customs: { data: { id: string; status: string; shipment: ShipmentLite | null }[]; count: number | null };
  paar: { data: { id: string; shipment: ShipmentLite | null }[]; count: number | null };
  terminal: { data: { id: string; status: string; shipment: ShipmentLite | null }[]; count: number | null };
  quotations: {
    data: { id: string; quotation_number: string | null; customer: { company_name: string } | null; total: number; currency: string }[];
    count: number | null;
  };
  awaitingOps: { data: Quotation[]; count: number | null };
  invoices: {
    data: {
      id: string;
      invoice_number: string | null;
      customer: { company_name: string } | null;
      total: number;
      currency: string;
      due_date: string | null;
    }[];
    count: number | null;
  };
  truck: { data: (ShipmentLite & { estimated_arrival: string | null })[]; count: number | null };
  readyRows: { id: string; shipment: ShipmentLite & { status: string } }[];
  urgentRows: (ShipmentLite & { quotation: { priority: string } | null })[];
  overdue: {
    data: {
      id: string;
      title: string;
      due_date: string | null;
      shipment: { id: string; reference_number: string | null } | null;
    }[];
    count: number | null;
  };
}

/**
 * Every Work Queue section's data in one parallel batch — one section per
 * kind of outstanding operational work, each capped at 8 rows plus its own
 * exact count. Branch-scoped the same way the dashboard is: admin/
 * branch_manager see the whole org, everyone else their own branch.
 */
export async function fetchWorkQueueData(branchFilter: string | null): Promise<WorkQueueRawData> {
  const today = new Date().toISOString().split('T')[0];

  let docsQuery = supabase
    .from('shipments')
    .select('id, reference_number, customer:customers(company_name), estimated_departure', { count: 'exact' })
    .is('deleted_at', null)
    .eq('status', 'documentation')
    .order('estimated_departure', { ascending: true, nullsFirst: false })
    .limit(8);
  if (branchFilter) docsQuery = docsQuery.eq('branch_id', branchFilter);

  let customsQuery = supabase
    .from('shipment_customs')
    .select('id, status, shipment:shipments(id, reference_number, customer:customers(company_name))', {
      count: 'exact',
    })
    .is('deleted_at', null)
    .not('status', 'in', '(released,rejected)')
    .limit(8);
  if (branchFilter) customsQuery = customsQuery.eq('branch_id', branchFilter);

  // "Awaiting PAAR" — no dedicated flag exists; a customs record with
  // no declaration number yet is the closest real proxy for "hasn't
  // been through the PAAR/SGD step".
  let paarQuery = supabase
    .from('shipment_customs')
    .select('id, shipment:shipments(id, reference_number, customer:customers(company_name))', { count: 'exact' })
    .is('deleted_at', null)
    .is('declaration_number', null)
    .not('status', 'in', '(released,rejected)')
    .limit(8);
  if (branchFilter) paarQuery = paarQuery.eq('branch_id', branchFilter);

  let terminalQuery = supabase
    .from('terminal_operations')
    .select('id, status, shipment:shipments(id, reference_number, customer:customers(company_name))', {
      count: 'exact',
    })
    .is('deleted_at', null)
    .neq('status', 'released')
    .limit(8);
  if (branchFilter) terminalQuery = terminalQuery.eq('branch_id', branchFilter);

  let quotationsQuery = supabase
    .from('quotations')
    .select('id, quotation_number, customer:customers(company_name), total, currency', { count: 'exact' })
    .is('deleted_at', null)
    .eq('status', 'sent')
    .limit(8);
  if (branchFilter) quotationsQuery = quotationsQuery.eq('branch_id', branchFilter);

  // Awaiting Operations — accepted, not yet converted to a shipment.
  let awaitingOpsQuery = supabase
    .from('quotations')
    .select('*, customer:customers(*)', { count: 'exact' })
    .is('deleted_at', null)
    .eq('status', 'accepted')
    .is('converted_shipment_id', null)
    .order('approval_date', { ascending: false, nullsFirst: false })
    .limit(8);
  if (branchFilter) awaitingOpsQuery = awaitingOpsQuery.eq('branch_id', branchFilter);

  let invoicesQuery = supabase
    .from('invoices')
    .select('id, invoice_number, customer:customers(company_name), total, currency, due_date', { count: 'exact' })
    .is('deleted_at', null)
    .in('status', ['sent', 'partial'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(8);
  if (branchFilter) invoicesQuery = invoicesQuery.eq('branch_id', branchFilter);

  // "Truck Assignment Required" — a shipment customs/terminal have
  // released, ready for pickup.
  let truckQuery = supabase
    .from('shipments')
    .select('id, reference_number, customer:customers(company_name), estimated_arrival', { count: 'exact' })
    .is('deleted_at', null)
    .eq('status', 'released')
    .limit(8);
  if (branchFilter) truckQuery = truckQuery.eq('branch_id', branchFilter);

  // "Containers Ready for Delivery" — terminal has released it, but
  // the shipment hasn't moved to transport/delivered yet.
  let readyQuery = supabase
    .from('terminal_operations')
    .select('id, shipment:shipments(id, reference_number, status, customer:customers(company_name))', {
      count: 'exact',
    })
    .is('deleted_at', null)
    .eq('status', 'released')
    .limit(8);
  if (branchFilter) readyQuery = readyQuery.eq('branch_id', branchFilter);

  let urgentQuery = supabase
    .from('shipments')
    .select('id, reference_number, customer:customers(company_name), quotation:quotations(priority)', {
      count: 'exact',
    })
    .is('deleted_at', null)
    .not('status', 'in', '(delivered,cancelled)')
    .limit(20);
  if (branchFilter) urgentQuery = urgentQuery.eq('branch_id', branchFilter);

  let overdueTasksQuery = supabase
    .from('shipment_tasks')
    .select('id, title, due_date, shipment:shipments(id, reference_number)', { count: 'exact' })
    .not('status', 'in', '(done,cancelled)')
    .lt('due_date', today)
    .order('due_date', { ascending: true })
    .limit(8);
  if (branchFilter) overdueTasksQuery = overdueTasksQuery.eq('branch_id', branchFilter);

  const [docs, customs, paar, terminal, quotations, awaitingOps, invoices, truck, ready, urgent, overdue] =
    await Promise.all([
      docsQuery,
      customsQuery,
      paarQuery,
      terminalQuery,
      quotationsQuery,
      awaitingOpsQuery,
      invoicesQuery,
      truckQuery,
      readyQuery,
      urgentQuery,
      overdueTasksQuery,
    ]);

  const urgentRows = (
    (urgent.data ?? []) as unknown as (ShipmentLite & { quotation: { priority: string } | null })[]
  )
    .filter((s) => s.quotation?.priority === 'urgent' || s.quotation?.priority === 'vip')
    .slice(0, 8);

  const readyRows = ((ready.data ?? []) as unknown as { id: string; shipment: ShipmentLite & { status: string } }[])
    .filter((r) => r.shipment && !['transport', 'delivered', 'cancelled'].includes(r.shipment.status))
    .slice(0, 8);

  return {
    docs: { data: (docs.data ?? []) as unknown as (ShipmentLite & { estimated_departure: string | null })[], count: docs.count },
    customs: {
      data: (customs.data ?? []) as unknown as { id: string; status: string; shipment: ShipmentLite | null }[],
      count: customs.count,
    },
    paar: {
      data: (paar.data ?? []) as unknown as { id: string; shipment: ShipmentLite | null }[],
      count: paar.count,
    },
    terminal: {
      data: (terminal.data ?? []) as unknown as { id: string; status: string; shipment: ShipmentLite | null }[],
      count: terminal.count,
    },
    quotations: {
      data: (quotations.data ?? []) as unknown as {
        id: string;
        quotation_number: string | null;
        customer: { company_name: string } | null;
        total: number;
        currency: string;
      }[],
      count: quotations.count,
    },
    awaitingOps: { data: (awaitingOps.data ?? []) as unknown as Quotation[], count: awaitingOps.count },
    invoices: {
      data: (invoices.data ?? []) as unknown as {
        id: string;
        invoice_number: string | null;
        customer: { company_name: string } | null;
        total: number;
        currency: string;
        due_date: string | null;
      }[],
      count: invoices.count,
    },
    truck: { data: (truck.data ?? []) as unknown as (ShipmentLite & { estimated_arrival: string | null })[], count: truck.count },
    readyRows,
    urgentRows,
    overdue: {
      data: (overdue.data ?? []) as unknown as {
        id: string;
        title: string;
        due_date: string | null;
        shipment: { id: string; reference_number: string | null } | null;
      }[],
      count: overdue.count,
    },
  };
}
