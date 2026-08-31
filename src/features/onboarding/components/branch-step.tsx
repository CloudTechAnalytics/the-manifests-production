'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, MapPin, Plus } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import * as onboardingService from '@/features/onboarding/services/onboarding.service';

/**
 * Onboarding step 2 — spec section 8. Head Office already exists
 * (provision_organization created it); this step lets the owner rename it
 * and, optionally, add more branches (e.g. Lagos, Kano, Abuja). Both
 * writes go straight to `branches` — RLS (migration 040) already scopes
 * insert/update to the org's own admin, no edge function needed.
 */
export function BranchStep({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['onboarding-branches', organizationId];

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newName, setNewName] = useState('');

  const {
    data: branches = [],
    isLoading: loading,
    error: loadError,
  } = useQuery({
    queryKey,
    queryFn: () => onboardingService.fetchBranches(organizationId),
  });

  useEffect(() => {
    if (loadError) toast.error(getErrorMessage(loadError, 'Failed to load branches'));
  }, [loadError]);

  const renameMutation = useMutation({
    mutationFn: (id: string) => onboardingService.renameBranch(id, renameValue.trim()),
    onSuccess: () => {
      setRenamingId(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to rename branch'));
    },
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => {
      const code = name.slice(0, 3).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
      return onboardingService.createBranch(name, code, organizationId);
    },
    onSuccess: (_data, name) => {
      setNewName('');
      toast.success(`"${name}" branch added`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to add branch'));
    },
  });
  const creating = createMutation.isPending;

  const handleRename = (id: string) => {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    renameMutation.mutate(id);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
  };

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Your branches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We created a &quot;Head Office&quot; branch automatically — rename it, and add more if your organization operates
          from multiple locations.
        </p>
      </div>

      <div className="space-y-2">
        {branches.map((branch) => (
          <div key={branch.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              {renamingId === branch.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(branch.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(branch.id)}
                  className="h-7 w-48"
                />
              ) : (
                <button
                  type="button"
                  className="truncate text-sm font-medium hover:underline"
                  onClick={() => { setRenamingId(branch.id); setRenameValue(branch.name); }}
                >
                  {branch.name}
                </button>
              )}
              <span className="text-xs text-muted-foreground">{branch.code}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-branch">Add another branch</Label>
        <div className="flex items-center gap-2">
          <Input
            id="new-branch"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Lagos"
          />
          <Button type="button" variant="outline" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
