'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  deleteShipmentContainer,
  saveShipmentContainer,
} from '@/features/shipments/services/shipments.service';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { DGPackingGroup, ShipmentContainer } from '@/shared/types';

const PACKING_GROUPS: DGPackingGroup[] = ['I', 'II', 'III'];

interface ShipmentContainersPanelProps {
  shipmentId: string;
  branchId: string;
  containers: ShipmentContainer[];
  onReload: () => void;
}

export function ShipmentContainersPanel({
  shipmentId,
  branchId,
  containers,
  onReload,
}: ShipmentContainersPanelProps) {
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('operations');
  const [dialog, setDialog] = useState<{ existing: ShipmentContainer | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!profile) throw new Error('Not ready');
      return deleteShipmentContainer({ containerId: id, updatedBy: profile.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      toast.success('Container removed');
      onReload();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to remove container'));
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Containers</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ existing: null })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Container
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {containers.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No containers recorded for this shipment yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>BL No.</TableHead>
                  <TableHead>Container No.</TableHead>
                  <TableHead>Seal No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Gross Weight</TableHead>
                  <TableHead>DG</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.bl_number || '—'}</TableCell>
                    <TableCell className="font-medium">{c.container_number || '—'}</TableCell>
                    <TableCell>{c.seal_number || '—'}</TableCell>
                    <TableCell>{c.container_type || '—'}</TableCell>
                    <TableCell>{c.gross_weight != null ? `${c.gross_weight} kg` : '—'}</TableCell>
                    <TableCell>
                      {c.is_dangerous_goods ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {c.un_number || 'DG'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>{c.status || '—'}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setDialog({ existing: c })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={deletingId === c.id}
                            onClick={() => handleDelete(c.id)}
                          >
                            {deletingId === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {dialog && (
        <ContainerFormDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          shipmentId={shipmentId}
          branchId={branchId}
          existing={dialog.existing}
          onSaved={onReload}
        />
      )}
    </Card>
  );
}

function ContainerFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: ShipmentContainer | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [blNumber, setBlNumber] = useState('');
  const [containerNumber, setContainerNumber] = useState('');
  const [sealNumber, setSealNumber] = useState('');
  const [containerType, setContainerType] = useState('');
  const [tareWeight, setTareWeight] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [status, setStatus] = useState('');
  const [isDangerousGoods, setIsDangerousGoods] = useState(false);
  const [unNumber, setUnNumber] = useState('');
  const [imdgClass, setImdgClass] = useState('');
  const [packingGroup, setPackingGroup] = useState<DGPackingGroup | ''>('');
  const [expectedEmptyPickupDate, setExpectedEmptyPickupDate] = useState('');
  const [expectedStuffingDate, setExpectedStuffingDate] = useState('');
  const [expectedGateInDate, setExpectedGateInDate] = useState('');
  const [expectedLoadingDate, setExpectedLoadingDate] = useState('');

  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveShipmentContainer>[0]['payload']) => {
      if (!profile) throw new Error('Not ready');
      return saveShipmentContainer({
        shipmentId,
        branchId,
        existingId: existing?.id ?? null,
        payload,
        updatedBy: profile.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      toast.success(existing ? 'Container updated' : 'Container added');
      onOpenChange(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save container'));
    },
  });
  const submitting = saveMutation.isPending;

  useEffect(() => {
    if (!open) return;
    setBlNumber(existing?.bl_number ?? '');
    setContainerNumber(existing?.container_number ?? '');
    setSealNumber(existing?.seal_number ?? '');
    setContainerType(existing?.container_type ?? '');
    setTareWeight(existing?.tare_weight != null ? String(existing.tare_weight) : '');
    setGrossWeight(existing?.gross_weight != null ? String(existing.gross_weight) : '');
    setStatus(existing?.status ?? '');
    setIsDangerousGoods(existing?.is_dangerous_goods ?? false);
    setUnNumber(existing?.un_number ?? '');
    setImdgClass(existing?.imdg_class ?? '');
    setPackingGroup(existing?.packing_group ?? '');
    setExpectedEmptyPickupDate(existing?.expected_empty_pickup_date ?? '');
    setExpectedStuffingDate(existing?.expected_stuffing_date ?? '');
    setExpectedGateInDate(existing?.expected_gate_in_date ?? '');
    setExpectedLoadingDate(existing?.expected_loading_date ?? '');
  }, [open, existing]);

  const handleSubmit = () => {
    saveMutation.mutate({
      bl_number: blNumber.trim() || null,
      container_number: containerNumber.trim() || null,
      seal_number: sealNumber.trim() || null,
      container_type: containerType.trim() || null,
      tare_weight: tareWeight ? Number(tareWeight) : null,
      gross_weight: grossWeight ? Number(grossWeight) : null,
      status: status.trim() || null,
      is_dangerous_goods: isDangerousGoods,
      un_number: isDangerousGoods ? unNumber.trim() || null : null,
      imdg_class: isDangerousGoods ? imdgClass.trim() || null : null,
      packing_group: isDangerousGoods ? (packingGroup || null) : null,
      expected_empty_pickup_date: expectedEmptyPickupDate || null,
      expected_stuffing_date: expectedStuffingDate || null,
      expected_gate_in_date: expectedGateInDate || null,
      expected_loading_date: expectedLoadingDate || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Container' : 'Add Container'}</DialogTitle>
          <DialogDescription>A shipment can carry more than one container.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cn-bl">BL Number</Label>
              <Input id="cn-bl" value={blNumber} onChange={(e) => setBlNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-number">Container Number</Label>
              <Input id="cn-number" value={containerNumber} onChange={(e) => setContainerNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-seal">Seal Number</Label>
              <Input id="cn-seal" value={sealNumber} onChange={(e) => setSealNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="cn-type">Container Type</Label>
              <Input
                id="cn-type"
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                placeholder="20ft, 40ft, 40ft HC…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-status">Status</Label>
              <Input
                id="cn-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Loaded, In transit, Discharged…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-tare">Tare Weight (kg)</Label>
              <Input
                id="cn-tare"
                type="number"
                min="0"
                step="0.01"
                value={tareWeight}
                onChange={(e) => setTareWeight(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-gross">Gross Weight (kg)</Label>
              <Input
                id="cn-gross"
                type="number"
                min="0"
                step="0.01"
                value={grossWeight}
                onChange={(e) => setGrossWeight(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="cn-dg"
                checked={isDangerousGoods}
                onCheckedChange={(c) => setIsDangerousGoods(c === true)}
              />
              <Label htmlFor="cn-dg" className="font-normal">
                Contains dangerous goods
              </Label>
            </div>
            {isDangerousGoods && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cn-un">UN Number</Label>
                  <Input id="cn-un" value={unNumber} onChange={(e) => setUnNumber(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-imdg">IMDG Class</Label>
                  <Input id="cn-imdg" value={imdgClass} onChange={(e) => setImdgClass(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-pg">Packing Group</Label>
                  <Select value={packingGroup} onValueChange={(v) => setPackingGroup(v as DGPackingGroup)}>
                    <SelectTrigger id="cn-pg">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {PACKING_GROUPS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Planning Targets (Expected Dates)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="cn-exp-pickup">Expected Empty Pickup Date</Label>
                <Input
                  id="cn-exp-pickup"
                  type="date"
                  value={expectedEmptyPickupDate}
                  onChange={(e) => setExpectedEmptyPickupDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cn-exp-stuffing">Expected Stuffing Date</Label>
                <Input
                  id="cn-exp-stuffing"
                  type="date"
                  value={expectedStuffingDate}
                  onChange={(e) => setExpectedStuffingDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cn-exp-gate-in">Expected Gate In Date</Label>
                <Input
                  id="cn-exp-gate-in"
                  type="date"
                  value={expectedGateInDate}
                  onChange={(e) => setExpectedGateInDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cn-exp-loading">Expected Loading Date</Label>
                <Input
                  id="cn-exp-loading"
                  type="date"
                  value={expectedLoadingDate}
                  onChange={(e) => setExpectedLoadingDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Add Container'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
