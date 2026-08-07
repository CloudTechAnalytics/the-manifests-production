'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Warehouse as WarehouseIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { formatDate } from '@/lib/utils/status';
import { computeStorageDays } from '@/lib/utils/planning';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ShipmentWarehouseRecord, Warehouse } from '@/types';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

interface WarehousePlanningCardProps {
  shipmentId: string;
  branchId: string;
  record: ShipmentWarehouseRecord | null;
  onChanged: () => void;
}

export function WarehousePlanningCard({ shipmentId, branchId, record, onChanged }: WarehousePlanningCardProps) {
  const { profile, hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('warehouse') || hasRole('planning');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markingRequired, setMarkingRequired] = useState(false);

  const handleMarkRequired = async () => {
    if (!profile) return;
    setMarkingRequired(true);
    try {
      const { data: created, error } = await supabase
        .from('shipment_warehouse_records')
        .insert({
          shipment_id: shipmentId,
          branch_id: branchId,
          status: 'awaiting_arrival',
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'warehouse_record.created',
        entity_type: 'shipment_warehouse_record',
        entity_id: (created as { id: string } | null)?.id ?? null,
        description: 'Marked warehousing as required for this shipment',
        metadata: { shipment_id: shipmentId },
      });
      toast.success('Warehousing marked as required');
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to mark warehousing as required'));
    } finally {
      setMarkingRequired(false);
    }
  };

  const storageDays = record ? computeStorageDays(record.received_date, record.released_date) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Warehouse Planning</CardTitle>
        {record && canManage && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!record ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <WarehouseIcon className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Not required for this shipment.</p>
            {canManage && (
              <Button size="sm" variant="outline" disabled={markingRequired} onClick={handleMarkRequired}>
                {markingRequired && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Mark as Required
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoRow label="Warehouse" value={record.warehouse?.name ?? '—'} />
            <InfoRow label="Receiving Date" value={formatDate(record.received_date)} />
            <InfoRow label="Expected Dispatch" value={formatDate(record.expected_arrival_date)} />
            <InfoRow label="Storage Days" value={storageDays != null ? `${storageDays} day(s)` : '—'} />
            <InfoRow
              label="Handling Instructions"
              value={record.handling_instructions || '—'}
            />
          </div>
        )}
      </CardContent>

      {record && (
        <WarehousePlanningDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          branchId={branchId}
          existing={record}
          onSaved={onChanged}
        />
      )}
    </Card>
  );
}

function WarehousePlanningDialog({
  open,
  onOpenChange,
  branchId,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  existing: ShipmentWarehouseRecord;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [releasedDate, setReleasedDate] = useState('');
  const [handlingInstructions, setHandlingInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('warehouses')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(({ data }) => setWarehouses((data as Warehouse[]) ?? []));
  }, [open, branchId]);

  useEffect(() => {
    if (!open) return;
    setWarehouseId(existing.warehouse_id ?? '');
    setReceivedDate(existing.received_date ?? '');
    setExpectedArrivalDate(existing.expected_arrival_date ?? '');
    setReleasedDate(existing.released_date ?? '');
    setHandlingInstructions(existing.handling_instructions ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const status = releasedDate ? 'released' : receivedDate ? 'received' : 'awaiting_arrival';
      const { error } = await supabase
        .from('shipment_warehouse_records')
        .update({
          warehouse_id: warehouseId || null,
          received_date: receivedDate || null,
          expected_arrival_date: expectedArrivalDate || null,
          released_date: releasedDate || null,
          handling_instructions: handlingInstructions.trim() || null,
          status,
          updated_by: profile.id,
        })
        .eq('id', existing.id);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'warehouse_record.updated',
        entity_type: 'shipment_warehouse_record',
        entity_id: existing.id,
        description: 'Updated warehouse planning details',
        metadata: { shipment_id: existing.shipment_id },
      });

      toast.success('Warehouse plan updated');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save warehouse plan'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Warehouse Planning</DialogTitle>
          <DialogDescription>Storage location, dates, and handling instructions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wp-warehouse">Warehouse Location</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger id="wp-warehouse">
                <SelectValue placeholder="Select a warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wp-expected">Expected Dispatch Date</Label>
              <Input
                id="wp-expected"
                type="date"
                value={expectedArrivalDate}
                onChange={(e) => setExpectedArrivalDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-received">Receiving Date</Label>
              <Input
                id="wp-received"
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wp-released">Released Date</Label>
            <Input
              id="wp-released"
              type="date"
              value={releasedDate}
              onChange={(e) => setReleasedDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wp-handling">Handling Instructions</Label>
            <Textarea
              id="wp-handling"
              rows={3}
              value={handlingInstructions}
              onChange={(e) => setHandlingInstructions(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
