import { supabase } from '@/shared/lib/supabase/client';
import { formatCurrency, formatDate } from '@/shared/lib/utils/status';

export interface ApprovalRow {
  id: string;
  kind: 'expense' | 'quotation';
  title: string;
  subtitle: string;
  amount: string;
  date: string;
  href: string;
}

/**
 * Everything currently awaiting an approval decision — expenses
 * (pending) and quotations (pending_approval) — combined into one queue.
 */
export async function fetchApprovals(branchFilter: string | null): Promise<ApprovalRow[]> {
  let expensesQuery = supabase
    .from('expenses')
    .select('id, expense_number, description, amount, currency, expense_date, category')
    .is('deleted_at', null)
    .eq('status', 'pending')
    .order('expense_date', { ascending: false });
  if (branchFilter) expensesQuery = expensesQuery.eq('branch_id', branchFilter);

  let quotationsQuery = supabase
    .from('quotations')
    .select('id, quotation_number, total, currency, created_at, customer:customers(company_name)')
    .is('deleted_at', null)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false });
  if (branchFilter) quotationsQuery = quotationsQuery.eq('branch_id', branchFilter);

  const [expenses, quotations] = await Promise.all([expensesQuery, quotationsQuery]);

  const expenseRows: ApprovalRow[] = (
    (expenses.data ?? []) as {
      id: string;
      expense_number: string | null;
      description: string;
      amount: number;
      currency: string;
      expense_date: string;
      category: string;
    }[]
  ).map((e) => ({
    id: e.id,
    kind: 'expense',
    title: e.expense_number ?? 'Expense',
    subtitle: `${e.description} · ${e.category.replace(/_/g, ' ')}`,
    amount: formatCurrency(e.amount, e.currency),
    date: formatDate(e.expense_date),
    href: `/expenses/${e.id}`,
  }));

  const quotationRows: ApprovalRow[] = (
    (quotations.data ?? []) as unknown as {
      id: string;
      quotation_number: string | null;
      total: number;
      currency: string;
      created_at: string;
      customer: { company_name: string } | null;
    }[]
  ).map((q) => ({
    id: q.id,
    kind: 'quotation',
    title: q.quotation_number ?? 'Quotation',
    subtitle: q.customer?.company_name ?? 'Unknown customer',
    amount: formatCurrency(q.total, q.currency),
    date: formatDate(q.created_at),
    href: `/quotations/${q.id}`,
  }));

  return [...expenseRows, ...quotationRows];
}
