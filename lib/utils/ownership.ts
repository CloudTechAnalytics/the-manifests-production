import type { UserRole } from '@/types';

interface OwnershipCheckArgs {
  hasRole: (role: UserRole) => boolean;
  userId: string | null | undefined;
  /** created_by, assigned_to, sales_rep_id, planned_by — whichever this record has. */
  ownerIds: Array<string | null | undefined>;
}

/**
 * Mirrors the ownership condition added to each table's soft-delete RLS
 * policy in migration 049 (ownership_scoped_delete): admin and
 * branch_manager remain the escalation path and can delete anything in
 * their branch; everyone else may only delete a record they created or
 * are assigned to. Used purely to decide what the UI shows/enables —
 * the database is the real enforcement point, this just avoids
 * presenting a Delete action that would only fail.
 */
export function canDeleteOwnRecord({ hasRole, userId, ownerIds }: OwnershipCheckArgs): boolean {
  if (hasRole('admin') || hasRole('branch_manager')) return true;
  if (!userId) return false;
  return ownerIds.some((id) => id === userId);
}
