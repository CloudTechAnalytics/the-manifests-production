import type { UserRole } from '@/types';

interface CanDeleteArgs {
  hasRole: (role: UserRole) => boolean;
}

/**
 * Mirrors migration 051 (delete_restricted_to_manager_admin): only
 * admin and branch_manager may delete any record. An earlier attempt
 * (migrations 049/050) let a user delete records they personally
 * created/were assigned to, but that ownership check could not be made
 * to reliably pass RLS despite extensive verification, so it was
 * dropped in favor of this simpler, easy-to-reason-about rule. Used
 * purely to decide what the UI shows — the database is the real
 * enforcement point, this just avoids presenting a Delete action that
 * would only fail.
 */
export function canDeleteOwnRecord({ hasRole }: CanDeleteArgs): boolean {
  return hasRole('admin') || hasRole('branch_manager');
}
