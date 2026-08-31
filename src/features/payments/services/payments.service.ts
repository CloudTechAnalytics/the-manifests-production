import { supabase } from '@/shared/lib/supabase/client';
import type { Payment, Customer, PaymentAllocation, Invoice } from '@/shared/types';

export type PaymentDetail = Payment & { customer: Customer | null };

export type PaymentAllocationRow = PaymentAllocation & {
  invoice: { id: string; invoice_number: string | null; total: number; currency: string } | null;
};

export interface PaymentDetailData {
  payment: PaymentDetail | null;
  allocations: PaymentAllocationRow[];
}

/** Detail-page read: the payment plus the invoices it has been applied to. */
export async function fetchPaymentDetail(paymentId: string): Promise<PaymentDetailData> {
  const { data: p, error: pErr } = await supabase
    .from('payments')
    .select('*, customer:customers(*)')
    .eq('id', paymentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (pErr || !p) {
    return { payment: null, allocations: [] };
  }

  const { data: allocs } = await supabase
    .from('payment_allocations')
    .select('*, invoice:invoices(id, invoice_number, total, currency)')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: false });

  return {
    payment: p as PaymentDetail,
    allocations: (allocs as PaymentAllocationRow[]) ?? [],
  };
}

/** Outstanding invoices for a customer, for the "Allocate to Invoice" dialog. */
export async function fetchOutstandingInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .in('status', ['sent', 'partial'])
    .is('deleted_at', null)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Error loading outstanding invoices:', error);
    return [];
  }
  return (data as Invoice[]) ?? [];
}

export async function allocatePayment(
  paymentId: string,
  branchId: string | null,
  paymentNumber: string | null,
  createdBy: string,
  entries: [string, number][]
): Promise<void> {
  const { error } = await supabase.from('payment_allocations').insert(
    entries.map(([invoiceId, amt]) => ({
      payment_id: paymentId,
      invoice_id: invoiceId,
      amount: amt,
      created_by: createdBy,
    }))
  );
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: branchId,
    action: 'payment.allocated',
    entity_type: 'payment',
    entity_id: paymentId,
    description: `Applied ${paymentNumber ?? ''} to ${entries.length} invoice${entries.length === 1 ? '' : 's'}`,
    metadata: { total_allocated: entries.reduce((sum, [, amt]) => sum + amt, 0) },
  });
}

export async function deletePaymentWithAllocations(
  paymentId: string,
  updatedBy: string,
  branchId: string | null,
  paymentNumber: string | null,
  amount: number,
  hasAllocations: boolean
): Promise<void> {
  // Remove allocations first so the sync trigger recalculates the
  // affected invoices' amount_paid/status back down before we soft
  // delete the payment itself — otherwise those invoices would stay
  // "paid" against a payment that no longer counts.
  if (hasAllocations) {
    const { error: allocDeleteError } = await supabase
      .from('payment_allocations')
      .delete()
      .eq('payment_id', paymentId);
    if (allocDeleteError) throw allocDeleteError;
  }

  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('id', paymentId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'payment.deleted',
    entity_type: 'payment',
    entity_id: paymentId,
    description: `Deleted payment ${paymentNumber ?? ''}`,
    metadata: { payment_number: paymentNumber, amount },
  });
}

/** New-payment form: customers, scoped by branch for non-admins. */
export async function fetchCustomersForPaymentForm(
  isAdmin: boolean,
  myBranchId: string | null
): Promise<Customer[]> {
  let query = supabase
    .from('customers')
    .select('*')
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

/** New-payment form: preselect the customer of an invoice arrived from via ?invoice_id=. */
export async function fetchInvoiceCustomerId(invoiceId: string): Promise<string | null> {
  const { data } = await supabase
    .from('invoices')
    .select('customer_id')
    .eq('id', invoiceId)
    .maybeSingle();
  return data?.customer_id ?? null;
}

/** New-payment form: outstanding invoices for the selected customer, branch-scoped for non-admins. */
export async function fetchOutstandingInvoicesForPaymentForm(
  customerId: string,
  isAdmin: boolean,
  myBranchId: string | null
): Promise<Invoice[]> {
  let query = supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .in('status', ['sent', 'partial'])
    .is('deleted_at', null)
    .order('due_date', { ascending: true });
  if (!isAdmin && myBranchId) query = query.eq('branch_id', myBranchId);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading outstanding invoices:', error);
    return [];
  }
  return (data as Invoice[]) ?? [];
}

export interface CreatePaymentInput {
  customer_id: string;
  branch_id: string;
  payment_date: string;
  payment_method: string;
  amount: number;
  reference: string | null;
  notes: string | null;
  created_by: string;
  customer_name: string;
  allocations: [string, number][];
}

export interface CreatePaymentResult {
  id: string;
  payment_number: string | null;
  /** True when the payment itself saved but its allocations failed to insert. */
  allocationFailed: boolean;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const { data: paymentData, error: paymentError } = await supabase
    .from('payments')
    .insert({
      customer_id: input.customer_id,
      branch_id: input.branch_id,
      payment_date: input.payment_date,
      payment_method: input.payment_method,
      amount: input.amount,
      reference: input.reference,
      notes: input.notes,
      created_by: input.created_by,
      updated_by: input.created_by,
    })
    .select('id, payment_number')
    .single();

  if (paymentError || !paymentData) {
    throw new Error(paymentError?.message ?? 'Failed to record payment');
  }

  let allocationFailed = false;
  if (input.allocations.length > 0) {
    const { error: allocError } = await supabase.from('payment_allocations').insert(
      input.allocations.map(([invoiceId, amt]) => ({
        payment_id: paymentData.id,
        invoice_id: invoiceId,
        amount: amt,
        created_by: input.created_by,
      }))
    );
    if (allocError) {
      console.error('Allocation insert error:', allocError);
      allocationFailed = true;
    }
  }

  await supabase.from('activities').insert({
    user_id: input.created_by,
    branch_id: input.branch_id,
    action: 'payment.created',
    entity_type: 'payment',
    entity_id: paymentData.id,
    description: `Recorded payment ${paymentData.payment_number ?? ''} from "${input.customer_name}"`,
    metadata: { customer_id: input.customer_id, amount: input.amount },
  });

  return { ...paymentData, allocationFailed };
}
