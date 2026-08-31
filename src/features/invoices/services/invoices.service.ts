import { supabase } from '@/shared/lib/supabase/client';
import type {
  Invoice,
  Customer,
  Shipment,
  Quotation,
  PaymentAllocation,
  Branch,
} from '@/shared/types';

export type InvoiceDetail = Invoice & {
  customer: Customer | null;
  shipment: Shipment | null;
  quotation: Quotation | null;
  branch: Branch | null;
};

export type InvoiceAllocationRow = PaymentAllocation & {
  payment: {
    id: string;
    payment_number: string | null;
    payment_date: string;
    payment_method: string;
  } | null;
};

export interface InvoiceDetailData {
  invoice: InvoiceDetail | null;
  allocations: InvoiceAllocationRow[];
}

/** Detail-page read: the invoice plus its payment allocation history. */
export async function fetchInvoiceDetail(invoiceId: string): Promise<InvoiceDetailData> {
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), shipment:shipments(*), quotation:quotations(*), branch:branches(*)')
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (invErr || !inv) {
    return { invoice: null, allocations: [] };
  }

  const { data: allocs } = await supabase
    .from('payment_allocations')
    .select('*, payment:payments(id, payment_number, payment_date, payment_method)')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  return {
    invoice: inv as InvoiceDetail,
    allocations: (allocs as InvoiceAllocationRow[]) ?? [],
  };
}

/** Soft-delete flow (non-admin): release allocations, then soft-delete the invoice. */
export async function deleteInvoiceWithAllocations(
  invoiceId: string,
  updatedBy: string,
  branchId: string | null,
  invoiceNumber: string | null
): Promise<void> {
  // Remove allocations first so the sync trigger recalculates the
  // affected payments' allocated/unallocated amounts before this
  // invoice disappears — otherwise a payment would keep counting
  // money as allocated to an invoice that's now hidden everywhere
  // (deleted_at IS NULL is required by every SELECT policy), with no
  // way to free that cash without direct DB intervention. Mirrors
  // payments/[id]'s delete handler.
  const { error: allocDeleteError } = await supabase
    .from('payment_allocations')
    .delete()
    .eq('invoice_id', invoiceId);
  if (allocDeleteError) throw allocDeleteError;

  const { error } = await supabase
    .from('invoices')
    .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('id', invoiceId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'invoice.deleted',
    entity_type: 'invoice',
    entity_id: invoiceId,
    description: `Deleted invoice ${invoiceNumber ?? ''}`,
    metadata: { invoice_number: invoiceNumber },
  });
}

export async function cancelInvoice(
  invoiceId: string,
  updatedBy: string,
  branchId: string | null,
  invoiceNumber: string | null
): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled', updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'invoice.cancelled',
    entity_type: 'invoice',
    entity_id: invoiceId,
    description: `Cancelled invoice ${invoiceNumber ?? ''}`,
  });
}

/** Edit-page prefill read. */
export async function fetchInvoiceForEdit(invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return data as Invoice;
}

export interface UpdateInvoiceInput {
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  terms: string | null;
  updated_by: string;
  branch_id: string | null;
  invoice_number: string | null;
}

export async function updateInvoice(invoiceId: string, input: UpdateInvoiceInput): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      issue_date: input.issue_date,
      due_date: input.due_date,
      currency: input.currency,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      total: input.total,
      notes: input.notes,
      terms: input.terms,
      updated_by: input.updated_by,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: input.updated_by,
    branch_id: input.branch_id,
    action: 'invoice.updated',
    entity_type: 'invoice',
    entity_id: invoiceId,
    description: `Updated invoice ${input.invoice_number ?? ''}`,
    metadata: { total: input.total, currency: input.currency },
  });
}

/** New-invoice form: active customers, scoped by branch for non-admins. */
export async function fetchActiveCustomersForInvoiceForm(
  isAdmin: boolean,
  myBranchId: string | null
): Promise<Customer[]> {
  let query = supabase
    .from('customers')
    .select('*')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('company_name', { ascending: true });
  if (!isAdmin && myBranchId) query = query.eq('branch_id', myBranchId);
  const { data, error } = await query;
  if (error) {
    console.error('Error loading customers:', error);
    return [];
  }
  return (data as Customer[]) ?? [];
}

export interface ShipmentsAndQuotations {
  shipments: Shipment[];
  quotations: Quotation[];
}

/** New-invoice form: shipments + approved quotations for the selected customer. */
export async function fetchShipmentsAndQuotationsForCustomer(
  customerId: string,
  isAdmin: boolean,
  myBranchId: string | null
): Promise<ShipmentsAndQuotations> {
  let shipQuery = supabase
    .from('shipments')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  let quotQuery = supabase
    .from('quotations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (!isAdmin && myBranchId) {
    shipQuery = shipQuery.eq('branch_id', myBranchId);
    quotQuery = quotQuery.eq('branch_id', myBranchId);
  }
  const [shipRes, quotRes] = await Promise.all([shipQuery, quotQuery]);
  return {
    shipments: (shipRes.data as Shipment[]) ?? [],
    quotations: (quotRes.data as Quotation[]) ?? [],
  };
}

export interface CreateInvoiceInput {
  customer_id: string;
  shipment_id: string | null;
  quotation_id: string | null;
  branch_id: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  terms: string | null;
  created_by: string;
  customer_name: string;
}

export async function createInvoice(
  input: CreateInvoiceInput
): Promise<{ id: string; invoice_number: string | null }> {
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      customer_id: input.customer_id,
      shipment_id: input.shipment_id,
      quotation_id: input.quotation_id,
      branch_id: input.branch_id,
      status: 'sent',
      issue_date: input.issue_date,
      due_date: input.due_date,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      total: input.total,
      currency: input.currency,
      notes: input.notes,
      terms: input.terms,
      created_by: input.created_by,
      updated_by: input.created_by,
    })
    .select('id, invoice_number')
    .single();

  if (invoiceError || !invoiceData) {
    throw new Error(invoiceError?.message ?? 'Failed to create invoice');
  }

  await supabase.from('activities').insert({
    user_id: input.created_by,
    branch_id: input.branch_id,
    action: 'invoice.created',
    entity_type: 'invoice',
    entity_id: invoiceData.id,
    description: `Created invoice ${invoiceData.invoice_number ?? ''} for "${input.customer_name}"`,
    metadata: {
      customer_id: input.customer_id,
      total: input.total,
      currency: input.currency,
    },
  });

  return invoiceData;
}
