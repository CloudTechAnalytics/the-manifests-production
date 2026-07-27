'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trash2, ArchiveRestore, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { formatDate } from '@/lib/utils/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Organization } from '@/types';

export default function OrganizationsTrashPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<Organization | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      setOrgs((data as Organization[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load trash'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ deleted_at: null })
        .eq('id', restoreTarget.id);
      if (error) throw error;
      toast.success(`${restoreTarget.name} restored`);
      setRestoreTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to restore organization'));
    } finally {
      setRestoring(false);
    }
  };

  const handleDeletePermanently = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // FK constraints don't care whether a referencing row is itself
      // soft-deleted — only whether it physically exists — so branches
      // and members must be gone first. Checked up front for a clear
      // message instead of a raw Postgres constraint-violation error.
      const [branchesRes, profilesRes] = await Promise.all([
        supabase
          .from('branches')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', deleteTarget.id),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', deleteTarget.id),
      ]);

      const branchCount = branchesRes.count ?? 0;
      const memberCount = profilesRes.count ?? 0;

      if (branchCount > 0 || memberCount > 0) {
        toast.error(
          `Can't permanently delete ${deleteTarget.name}: it still has ${memberCount} member${memberCount === 1 ? '' : 's'} and ${branchCount} branch${branchCount === 1 ? '' : 'es'}. Remove those first.`
        );
        return;
      }

      const { error } = await supabase.from('organizations').delete().eq('id', deleteTarget.id);
      if (error) throw error;

      toast.success(`${deleteTarget.name} permanently deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to permanently delete organization'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/platform/organizations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="page-title">Trash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleted organizations, kept until you restore or permanently delete them.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Trash2 className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">Trash is empty</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {org.deleted_at ? formatDate(org.deleted_at) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRestoreTarget(org)}
                        >
                          <ArchiveRestore className="mr-1.5 h-4 w-4" />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteTarget(org)}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Delete Permanently
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArchiveRestore className="h-5 w-5 text-emerald-600" />
              Restore organization?
            </DialogTitle>
            <DialogDescription>
              {restoreTarget?.name} will reappear in Organizations and its staff
              will regain access, if the organization was active before deletion.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={restoring}>
              {restoring && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Permanently delete organization?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. <strong>{deleteTarget?.name}</strong> can only
              be permanently deleted once it has no branches and no members left —
              you'll be told what's still blocking it if anything is.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeletePermanently} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
