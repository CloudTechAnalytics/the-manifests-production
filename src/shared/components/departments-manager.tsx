'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building, Loader2, Plus, Power } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { Department } from '@/shared/types';

/**
 * Create / rename / disable departments for the current organization —
 * spec section 8. Departments are a labeling/assignment layer only (see
 * migration 062's docstring); RLS already scopes reads/writes to the
 * caller's own organization via can_access_org()/is_admin(), so this talks
 * to the table directly rather than through an edge function, same as any
 * other org-admin-owned table with correct RLS.
 *
 * Shared between the onboarding "Departments" step and the Settings page.
 */
export function DepartmentsManager({ organizationId }: { organizationId: string }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setDepartments((data ?? []) as Department[]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load departments'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { error } = await supabase.from('departments').insert({
        organization_id: organizationId,
        name,
        sort_order: departments.length,
      });
      if (error) throw error;
      setNewName('');
      toast.success(`"${name}" department added`);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add department'));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    try {
      const { error } = await supabase.from('departments').update({ name }).eq('id', id);
      if (error) throw error;
      setRenamingId(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to rename department'));
    }
  };

  const handleToggle = async (dept: Department) => {
    setTogglingId(dept.id);
    try {
      const { error } = await supabase
        .from('departments')
        .update({ is_active: !dept.is_active })
        .eq('id', dept.id);
      if (error) throw error;
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update department'));
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {departments.map((dept) => (
          <div
            key={dept.id}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5',
              !dept.is_active && 'opacity-60'
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Building className="h-4 w-4 shrink-0 text-muted-foreground" />
              {renamingId === dept.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(dept.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(dept.id)}
                  className="h-7 w-40"
                />
              ) : (
                <button
                  type="button"
                  className="truncate text-sm font-medium hover:underline"
                  onClick={() => { setRenamingId(dept.id); setRenameValue(dept.name); }}
                >
                  {dept.name}
                </button>
              )}
              {dept.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
              {!dept.is_active && <Badge variant="outline" className="text-[10px]">Disabled</Badge>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={togglingId === dept.id}
              onClick={() => handleToggle(dept)}
            >
              {togglingId === dept.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              <span className="ml-1.5">{dept.is_active ? 'Disable' : 'Enable'}</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Add a department (e.g. Business Development)"
        />
        <Button type="button" variant="outline" onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Not every department has to be used — disable any that don&apos;t apply to your organization.
      </p>
    </div>
  );
}
