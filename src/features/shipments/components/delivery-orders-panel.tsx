'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, FileClock, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  createDeliveryOrder,
  markDeliveryOrderExited,
} from '@/features/shipments/services/shipments.service';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { formatCurrency } from '@/shared/lib/utils/status';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/components/ui/dialog';
import type { DeliveryOrder } from '@/shared/types';

interface DeliveryOrdersPanelProps {
  shipmentId: string;
  branchId: string;
  orders: DeliveryOrder[];
  onReload: () => void;
}

type DoStatus = 'exited' | 'expired' | 'expiring_soon' | 'active' | 'superseded';

/** Derived, never stored — same lazy-computation convention org_subscriptions
 *  trial status already uses. A DO that's already been replaced by a newer
 *  one (superseded_by set) always reads as "superseded" regardless of its
 *  own expiry, so the chain reads clearly top to bottom. */
function doStatus(order: DeliveryOrder): DoStatus {
  if (order.superseded_by) return 'superseded';
  if (order.exited_at) return 'exited';
  const msLeft = new Date(order.expires_at).getTime() - Date.now();
  if (msLeft <= 0) return 'expired';
  if (msLeft <= 4 * 60 * 60 * 1000) return 'expiring_soon';
  return 'active';
}

const STATUS_META: Record<DoStatus, { label: string; color: string }> = {
  exited: { label: 'Cargo Exited', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-700' },
  expiring_soon: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700' },
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700' },
  superseded: { label: 'Superseded', color: 'bg-muted text-muted-foreground' },
};

function hoursLeftLabel(order: DeliveryOrder): string {
  const msLeft = new Date(order.expires_at).getTime() - Date.now();
  const hrs = Math.abs(Math.round(msLeft / (60 * 60 * 1000)));
  if (msLeft <= 0) return `Expired ${hrs}h ago`;
  return `${hrs}h remaining`;
}

export function DeliveryOrdersPanel({ shipmentId, branchId, orders, onReload }: DeliveryOrdersPanelProps) {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('operations') || hasRole('terminal');
  const [issueOpen, setIssueOpen] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<DeliveryOrder | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);

  const sorted = [...orders].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
  const activeOrder = orders.find((o) => !o.superseded_by && !o.exited_at);

  const markExitedMutation = useMutation({
    mutationFn: (orderId: string) => markDeliveryOrderExited(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      toast.success('Cargo exit recorded');
      onReload();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to record exit'));
    },
    onSettled: () => {
      setExitingId(null);
    },
  });

  const markExited = (order: DeliveryOrder) => {
    setExitingId(order.id);
    markExitedMutation.mutate(order.id);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <FileClock className="h-4 w-4 text-primary" />
          Delivery Orders
        </CardTitle>
        {canManage && !activeOrder && (
          <Button size="sm" onClick={() => setIssueOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Issue Delivery Order
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No delivery order issued for this shipment yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((order) => {
              const status = doStatus(order);
              return (
                <div key={order.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-medium">
                        {order.do_number || 'Delivery Order'}
                        <Badge className={cn('ml-2 align-middle', STATUS_META[status].color)}>
                          {STATUS_META[status].label}
                        </Badge>
                      </p>
                      <p className="text-muted-foreground">
                        Issued {new Date(order.issued_at).toLocaleString()} · Valid {order.validity_hours}h
                      </p>
                      {(status === 'active' || status === 'expiring_soon' || status === 'expired') && (
                        <p
                          className={cn(
                            'flex items-center gap-1 text-xs font-medium',
                            status === 'expired' ? 'text-destructive' : status === 'expiring_soon' ? 'text-amber-600' : 'text-muted-foreground'
                          )}
                        >
                          {status !== 'active' && <AlertTriangle className="h-3 w-3" />}
                          {hoursLeftLabel(order)}
                        </p>
                      )}
                      {order.regeneration_fee != null && (
                        <p className="text-xs text-muted-foreground">
                          Regeneration fee: {formatCurrency(order.regeneration_fee, order.regeneration_fee_currency)}
                          {order.expense_id ? ' · logged as expense' : ''}
                        </p>
                      )}
                    </div>
                    {canManage && (status === 'active' || status === 'expiring_soon') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={exitingId === order.id}
                        onClick={() => markExited(order)}
                      >
                        {exitingId === order.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Cargo Exited
                      </Button>
                    )}
                    {canManage && status === 'expired' && (
                      <Button size="sm" variant="outline" onClick={() => setRegenerateTarget(order)}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Regenerate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {issueOpen && (
        <DeliveryOrderFormDialog
          open={issueOpen}
          onOpenChange={setIssueOpen}
          shipmentId={shipmentId}
          branchId={branchId}
          predecessor={null}
          onSaved={onReload}
        />
      )}
      {regenerateTarget && (
        <DeliveryOrderFormDialog
          open={!!regenerateTarget}
          onOpenChange={(open) => !open && setRegenerateTarget(null)}
          shipmentId={shipmentId}
          branchId={branchId}
          predecessor={regenerateTarget}
          onSaved={onReload}
        />
      )}
    </Card>
  );
}

function DeliveryOrderFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  predecessor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  /** The expired DO being replaced, or null when issuing the first one. */
  predecessor: DeliveryOrder | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [doNumber, setDoNumber] = useState('');
  const [validityHours, setValidityHours] = useState('24');
  const [regenerationFee, setRegenerationFee] = useState('');
  const [logAsExpense, setLogAsExpense] = useState(true);
  const [notes, setNotes] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!profile) throw new Error('Not ready');
      return createDeliveryOrder({
        shipmentId,
        branchId,
        doNumber,
        validityHours,
        regenerationFee,
        logAsExpense,
        notes,
        predecessorId: predecessor?.id ?? null,
        createdBy: profile.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      toast.success(predecessor ? 'New delivery order issued' : 'Delivery order issued');
      onOpenChange(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save delivery order'));
    },
  });
  const submitting = saveMutation.isPending;

  const handleSubmit = () => {
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{predecessor ? 'Regenerate Delivery Order' : 'Issue Delivery Order'}</DialogTitle>
          <DialogDescription>
            {predecessor
              ? `${predecessor.do_number || 'The previous DO'} expired before the cargo exited — this issues a replacement, starting a fresh validity window.`
              : 'Cargo must exit the terminal before this expires, or a new delivery order will need to be issued at an extra cost.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="do-number">DO / TDO Number</Label>
              <Input id="do-number" value={doNumber} onChange={(e) => setDoNumber(e.target.value)} placeholder="TDO-000123" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="do-validity">Valid for (hours)</Label>
              <Input
                id="do-validity"
                type="number"
                min="1"
                value={validityHours}
                onChange={(e) => setValidityHours(e.target.value)}
              />
            </div>
          </div>

          {predecessor && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="do-fee">Regeneration Fee</Label>
                <Input
                  id="do-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={regenerationFee}
                  onChange={(e) => setRegenerationFee(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={logAsExpense}
                  onChange={(e) => setLogAsExpense(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Log this fee as an expense against this shipment
              </label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="do-notes">Notes</Label>
            <Textarea id="do-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {predecessor ? 'Issue Replacement' : 'Issue Delivery Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
