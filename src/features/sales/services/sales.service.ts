import { supabase } from '@/shared/lib/supabase/client';
import type { Branch, Quotation } from '@/shared/types';

export type SalesQuotationRow = Quotation & {
  customer?: { id: string; company_name: string } | null;
  branch?: { id: string; name: string } | null;
};

export interface SalesFilters {
  branchId: string | null;
  fromDate: string;
  toDate: string;
}

export async function fetchBranchesForSales(): Promise<Branch[]> {
  const { data } = await supabase.from('branches').select('*').is('deleted_at', null).order('name', { ascending: true });
  return (data as Branch[]) ?? [];
}

export async function fetchSalesQuotations({ branchId, fromDate, toDate }: SalesFilters): Promise<SalesQuotationRow[]> {
  let query = supabase
    .from('quotations')
    .select('*, customer:customers(id, company_name), branch:branches(id, name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  if (fromDate) {
    query = query.gte('created_at', fromDate);
  }
  if (toDate) {
    const endOfDay = new Date(toDate);
    endOfDay.setDate(endOfDay.getDate() + 1);
    query = query.lte('created_at', endOfDay.toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading sales data:', error);
    return [];
  }
  return (data as SalesQuotationRow[]) ?? [];
}
