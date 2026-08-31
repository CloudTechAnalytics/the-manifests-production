import { supabase } from '@/shared/lib/supabase/client';
import type { Expense, Shipment, Profile } from '@/shared/types';

export type ExpenseDetail = Expense & {
  shipment: Shipment | null;
  paid_by_user: Profile | null;
  approved_by_user: Profile | null;
};

/** Detail-page read. */
export async function fetchExpenseDetail(expenseId: string): Promise<ExpenseDetail | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      '*, shipment:shipments(*), paid_by_user:profiles!expenses_paid_by_fkey(*), approved_by_user:profiles!expenses_approved_by_fkey(*)'
    )
    .eq('id', expenseId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExpenseDetail;
}

export async function decideExpense(
  expenseId: string,
  decision: 'approved' | 'rejected',
  approvedBy: string,
  branchId: string | null,
  expenseNumber: string | null
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({
      status: decision,
      approved_by: approvedBy,
      updated_by: approvedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', expenseId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: approvedBy,
    branch_id: branchId,
    action: `expense.${decision}`,
    entity_type: 'expense',
    entity_id: expenseId,
    description: `${decision === 'approved' ? 'Approved' : 'Rejected'} expense ${expenseNumber ?? ''}`,
    metadata: { expense_number: expenseNumber },
  });
}

export async function softDeleteExpense(
  expenseId: string,
  updatedBy: string,
  branchId: string | null,
  expenseNumber: string | null
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('id', expenseId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'expense.deleted',
    entity_type: 'expense',
    entity_id: expenseId,
    description: `Deleted expense ${expenseNumber ?? ''}`,
    metadata: { expense_number: expenseNumber },
  });
}

/** Edit-page prefill read. */
export async function fetchExpenseForEdit(expenseId: string): Promise<Expense | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return data as Expense;
}

/** New/edit-expense form: shipments dropdown, branch-scoped for non-admins. */
export async function fetchShipmentsForExpenseForm(
  isAdmin: boolean,
  userBranchId: string | null
): Promise<Shipment[]> {
  let query = supabase
    .from('shipments')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!isAdmin && userBranchId) query = query.eq('branch_id', userBranchId);
  const { data, error } = await query;
  if (error) {
    console.error('Error loading shipments:', error);
    return [];
  }
  return (data as Shipment[]) ?? [];
}

export interface UpdateExpenseInput {
  description: string;
  category: string;
  shipment_id: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  notes: string | null;
  updated_by: string;
  branch_id: string | null;
  expense_number: string | null;
}

export async function updateExpense(expenseId: string, input: UpdateExpenseInput): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({
      description: input.description,
      category: input.category,
      shipment_id: input.shipment_id,
      amount: input.amount,
      currency: input.currency,
      expense_date: input.expense_date,
      notes: input.notes,
      updated_by: input.updated_by,
      updated_at: new Date().toISOString(),
    })
    .eq('id', expenseId);

  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: input.updated_by,
    branch_id: input.branch_id,
    action: 'expense.updated',
    entity_type: 'expense',
    entity_id: expenseId,
    description: `Updated expense ${input.expense_number ?? ''}`,
    metadata: { category: input.category, amount: input.amount },
  });
}

export interface CreateExpenseInput {
  description: string;
  category: string;
  shipment_id: string | null;
  branch_id: string;
  amount: number;
  currency: string;
  expense_date: string;
  notes: string | null;
  created_by: string;
}

export async function createExpense(
  input: CreateExpenseInput
): Promise<{ id: string; expense_number: string | null }> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      description: input.description,
      category: input.category,
      shipment_id: input.shipment_id,
      branch_id: input.branch_id,
      amount: input.amount,
      currency: input.currency,
      expense_date: input.expense_date,
      status: 'pending',
      paid_by: input.created_by,
      notes: input.notes,
      created_by: input.created_by,
      updated_by: input.created_by,
    })
    .select('id, expense_number')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create expense');
  }

  await supabase.from('activities').insert({
    user_id: input.created_by,
    branch_id: input.branch_id,
    action: 'expense.created',
    entity_type: 'expense',
    entity_id: data.id,
    description: `Logged expense ${data.expense_number ?? ''}: "${input.description}"`,
    metadata: { category: input.category, amount: input.amount },
  });

  return data;
}
