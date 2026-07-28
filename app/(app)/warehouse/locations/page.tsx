'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Warehouse as WarehouseIcon, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Warehouse } from '@/types';

export default function WarehouseLocationsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadWarehouses = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('warehouses')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (!isAdmin && branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) {
        console.error('Error loading warehouses:', error);
        setWarehouses([]);
        return;
      }
      setWarehouses((data as Warehouse[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, branchId]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCity('');
    setAddress('');
    setDialogOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setName(w.name);
    setCity(w.city ?? '');
    setAddress(w.address ?? '');
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!profile?.branch_id || !profile.id || !name.trim()) return;
    setSubmitting(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('warehouses')
          .update({
            name: name.trim(),
            city: city.trim() || null,
            address: address.trim() || null,
            updated_by: profile.id,
          })
          .eq('id', editing.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: editing.branch_id,
          action: 'warehouse.updated',
          entity_type: 'warehouse',
          entity_id: editing.id,
          description: `Updated warehouse "${name.trim()}"`,
        });

        toast.success('Warehouse updated');
      } else {
        const { data: created, error } = await supabase
          .from('warehouses')
          .insert({
            name: name.trim(),
            city: city.trim() || null,
            address: address.trim() || null,
            branch_id: profile.branch_id,
            created_by: profile.id,
            updated_by: profile.id,
          })
          .select('id')
          .single();
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: profile.branch_id,
          action: 'warehouse.created',
          entity_type: 'warehouse',
          entity_id: created?.id,
          description: `Created warehouse "${name.trim()}"`,
        });

        toast.success('Warehouse created');
      }
      setDialogOpen(false);
      loadWarehouses();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to save warehouse');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !profile) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('warehouses')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', deleteTarget.id);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: deleteTarget.branch_id,
        action: 'warehouse.deleted',
        entity_type: 'warehouse',
        entity_id: deleteTarget.id,
        description: `Deleted warehouse "${deleteTarget.name}"`,
      });

      toast.success('Warehouse deleted');
      setDeleteTarget(null);
      loadWarehouses();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to delete warehouse');
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/warehouse">Warehouse</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Warehouses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/warehouse">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 page-title">
              <WarehouseIcon className="h-6 w-6 text-primary" />
              Warehouses
            </h1>
            <p className="text-sm text-muted-foreground">Manage your physical storage locations.</p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Warehouse
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : warehouses.length === 0 ? (
            <EmptyState
              icon={WarehouseIcon}
              title="No warehouses yet"
              message="Add your first warehouse location to start tracking stock."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground">{w.city ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{w.address ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={w.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}>
                        {w.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget(w)}
                        >
                          <Trash2 className="h-4 w-4" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Warehouse' : 'New Warehouse'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this warehouse location.' : 'Add a new physical storage location.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lagos Main Warehouse" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-city">City</Label>
              <Input id="wh-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-address">Address</Label>
              <Input id="wh-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Warehouse'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete warehouse?</DialogTitle>
            <DialogDescription>
              This will soft-delete &quot;{deleteTarget?.name}&quot;. Its stock and movement history are
              preserved but the location will no longer appear in selectors.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
