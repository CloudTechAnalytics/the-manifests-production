'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Branch, Profile } from '@/types';

/**
 * Most staff belong to exactly one branch, so record creation has always
 * silently used profile.branch_id. That breaks for an admin who has none
 * yet — e.g. the first admin of a brand-new organization, created before
 * any branch exists — who would otherwise be hard-blocked from creating
 * anything. This surfaces an explicit branch picker only in that case,
 * leaving the common case (a staff member with a branch already) exactly
 * as it was.
 */
export function useBranchSelector(profile: Profile | null) {
  const needsSelection = !profile?.branch_id;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!needsSelection) return;
    let isMounted = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (!isMounted) return;
      if (error) {
        console.error('Error loading branches:', error);
      } else {
        setBranches((data as Branch[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
    // profile.branch_id only flips needsSelection when it changes, so this
    // intentionally does not depend on the whole profile object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSelection]);

  const branchId = profile?.branch_id || selectedBranchId;

  return { needsSelection, branches, selectedBranchId, setSelectedBranchId, branchId, loading };
}
