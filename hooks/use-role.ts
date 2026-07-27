'use client';

import { useAuth } from '@/contexts/auth-context';
import type { UserRole } from '@/types';

export function useRole() {
  const { profile } = useAuth();
  return profile?.role ?? null;
}

export function useIsAdmin() {
  const role = useRole();
  return role === 'admin';
}

export function useCanAccess(branchId: string | null) {
  const { profile } = useAuth();
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return profile.branch_id === branchId;
}

export function useBranchFilter() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role === 'admin') return null;
  return profile.branch_id;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: 'Platform Admin',
  admin: 'Administrator',
  operations: 'Operations',
  sales: 'Sales',
  branch_manager: 'Branch Manager',
};
