import { supabase } from '@/shared/lib/supabase/client';

export type AdminDeleteEntityType =
  | 'customer'
  | 'quotation'
  | 'shipment'
  | 'invoice'
  | 'payment'
  | 'expense'
  | 'shipment_customs'
  | 'terminal_operations'
  | 'shipment_examinations'
  | 'shipment_transportation'
  | 'user';

/**
 * Calls the admin-delete-record edge function — a permanent, cascading
 * delete available to org admins only. Every other role's delete stays
 * on the ordinary RLS-governed soft-delete path; this is a distinct,
 * separately-gated action, not a drop-in replacement.
 */
export async function adminForceDelete(
  entityType: AdminDeleteEntityType,
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    return { success: false, error: 'Your session has expired. Please sign in again.' };
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-record`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ entity_type: entityType, id }),
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    return { success: false, error: result.error ?? `Request failed (${response.status})` };
  }
  return { success: true };
}
