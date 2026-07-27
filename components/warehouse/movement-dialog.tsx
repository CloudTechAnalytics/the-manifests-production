'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StockItem, Warehouse, WarehouseStock } from '@/types';

export type MovementMode = 'inbound' | 'outbound' | 'adjustment' | 'transfer';

const MODE_META: Record<MovementMode, { title: string; description: string }> = {
  inbound: { title: 'Receive Stock', description: 'Log stock received into a warehouse.' },
  outbound: { title: 'Issue Stock', description: 'Log stock issued out of a warehouse.' },
  adjustment: { title: 'Adjust Stock', description: 'Correct a stock count after a physical check.' },
  transfer: { title: 'Transfer Stock', description: 'Move stock from one warehouse to another.' },
};

interface MovementDialogProps {
  mode: MovementMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StockItem[];
  warehouses: Warehouse[];
  stockRows: WarehouseStock[];
  presetItemId?: string;
  onSuccess: () => void;
}

export function MovementDialog({
  mode,
  open,
  onOpenChange,
  items,
  warehouses,
  stockRows,
  presetItemId,
  onSuccess,
}: MovementDialogProps) {
  const { profile } = useAuth();
  const [itemId, setItemId] = useState(presetItemId ?? '');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItemId(presetItemId ?? '');
    setWarehouseId('');
    setToWarehouseId('');
    setDirection('increase');
    setQuantity('');
    setMovementDate(new Date().toISOString().split('T')[0]);
    setReference('');
    setNotes('');
  }, [open, presetItemId]);

  const currentStock = useMemo(() => {
    if (!itemId || !warehouseId) return null;
    const row = stockRows.find((r) => r.item_id === itemId && r.warehouse_id === warehouseId);
    return row ? Number(row.quantity) : 0;
  }, [itemId, warehouseId, stockRows]);

  const requiresStockCheck =
    mode === 'outbound' || mode === 'transfer' || (mode === 'adjustment' && direction === 'decrease');

  const qtyNum = Number(quantity) || 0;
  const exceedsStock = requiresStockCheck && currentStock !== null && qtyNum > currentStock;

  const canSubmit =
    itemId &&
    warehouseId &&
    qtyNum > 0 &&
    !exceedsStock &&
    (mode !== 'transfer' || (toWarehouseId && toWarehouseId !== warehouseId));

  const handleSubmit = async () => {
    if (!profile?.id || !canSubmit) return;
    const item = items.find((i) => i.id === itemId);
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    if (!item || !warehouse) return;

    const movementType =
      mode === 'inbound'
        ? 'inbound'
        : mode === 'outbound'
          ? 'outbound'
          : mode === 'transfer'
            ? 'transfer'
            : direction === 'increase'
              ? 'adjustment_increase'
              : 'adjustment_decrease';

    setSubmitting(true);
    try {
      const { error } = await supabase.from('stock_movements').insert({
        item_id: itemId,
        warehouse_id: warehouseId,
        to_warehouse_id: mode === 'transfer' ? toWarehouseId : null,
        branch_id: item.branch_id,
        movement_type: movementType,
        quantity: qtyNum,
        movement_date: movementDate,
        reference: reference || null,
        notes: notes || null,
        created_by: profile.id,
      });
      if (error) throw error;

      toast.success(`${MODE_META[mode].title} recorded successfully`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to record movement');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const meta = MODE_META[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Item <span className="text-destructive">*</span>
            </Label>
            <Select value={itemId} onValueChange={setItemId} disabled={!!presetItemId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} ({i.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{mode === 'transfer' ? 'From Warehouse' : 'Warehouse'} <span className="text-destructive">*</span></Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
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

            {mode === 'transfer' && (
              <div className="space-y-1.5">
                <Label>
                  To Warehouse <span className="text-destructive">*</span>
                </Label>
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.id !== warehouseId)
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === 'adjustment' && (
              <div className="space-y-1.5">
                <Label>
                  Direction <span className="text-destructive">*</span>
                </Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as 'increase' | 'decrease')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">Increase (+)</SelectItem>
                    <SelectItem value="decrease">Decrease (-)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {requiresStockCheck && itemId && warehouseId && (
            <p className="text-xs text-muted-foreground">
              Current stock at this warehouse: <span className="font-medium">{currentStock}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              {exceedsStock && (
                <p className="text-xs text-destructive">Exceeds current stock ({currentStock}).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reference (optional)</Label>
            <Input
              placeholder="PO number, reason…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {meta.title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
