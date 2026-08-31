'use client';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Warehouse as WarehouseIcon, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { useBranchSelector } from '@/shared/hooks/use-branch-selector';
import { BranchSelectField } from '@/shared/components/branch-select-field';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import {
  createWarehouse,
  deleteWarehouse,
  editWarehouse,
  fetchWarehouses,
} from '@/features/warehouse/services/warehouse.service';
import type { Warehouse } from '@/shared/types';

export default function WarehouseLocationsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const {
    needsSelection: needsBranchSelection,
    branches: selectableBranches,
    selectedBranchId,
    setSelectedBranchId,
    branchId: newWarehouseBranchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);

  const { data: warehouses = [], isLoading: loading } = useQuery({
    queryKey: ['warehouses', isAdmin, branchId],
    queryFn: () => fetchWarehouses({ isAdmin, branchId }),
    enabled: !!profile,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [branchError, setBranchError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCity('');
    setAddress('');
    setSelectedBranchId('');
    setBranchError('');
    setDialogOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setName(w.name);
    setCity(w.city ?? '');
    setAddress(w.address ?? '');
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        await editWarehouse(editing, { name, city, address }, { id: profile!.id });
      } else {
        await createWarehouse({ name, city, address }, newWarehouseBranchId!, { id: profile!.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(editing ? 'Warehouse updated' : 'Warehouse created');
      setDialogOpen(false);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save warehouse'));
    },
  });

  const handleSubmit = () => {
    if (!profile?.id || !name.trim()) return;
    if (!editing && !newWarehouseBranchId) {
      setBranchError('Please select a branch');
      return;
    }
    setBranchError('');
    saveMutation.mutate();
  };
  const submitting = saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (target: Warehouse) => deleteWarehouse(target, { id: profile!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Warehouse deleted');
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to delete warehouse'));
    },
  });

  const handleDelete = () => {
    if (!deleteTarget || !profile) return;
    deleteMutation.mutate(deleteTarget);
  };
  const deleting = deleteMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/warehouse">Warehouse</Link>
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
          <Link to="/warehouse">
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
            {!editing && needsBranchSelection && (
              <BranchSelectField
                branches={selectableBranches}
                value={selectedBranchId}
                onChange={setSelectedBranchId}
                loading={branchesLoading}
                error={branchError}
              />
            )}
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
