'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { adminForceDelete } from '@/shared/lib/utils/admin-delete';
import { useAuth } from '@/shared/contexts/auth-context';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
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
import type { TerminalOperation, TerminalStatus } from '@/shared/types';

const STATUS_OPTIONS: { value: TerminalStatus; label: string }[] = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'positioned', label: 'Positioned' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'examined', label: 'Examined' },
  { value: 'released', label: 'Released' },
];

interface TerminalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: TerminalOperation | null;
  onSaved: () => void;
}

export function TerminalFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: TerminalFormDialogProps) {
  const { profile, hasRole } = useAuth();
  const [terminalName, setTerminalName] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [containerPosition, setContainerPosition] = useState('');
  const [holdingBay, setHoldingBay] = useState('');
  const [stackNumber, setStackNumber] = useState('');
  const [examScheduledDate, setExamScheduledDate] = useState('');
  const [gatePassNumber, setGatePassNumber] = useState('');
  const [exitNoteNumber, setExitNoteNumber] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [freeTimeDays, setFreeTimeDays] = useState('');
  const [freeTimeExpiry, setFreeTimeExpiry] = useState('');
  const [status, setStatus] = useState<TerminalStatus>('waiting');
  const [notes, setNotes] = useState('');
  const [terminalContact, setTerminalContact] = useState('');
  const [bookingSlot, setBookingSlot] = useState('');
  const [terminalReference, setTerminalReference] = useState('');
  const [expectedGateIn, setExpectedGateIn] = useState('');
  const [expectedGateOut, setExpectedGateOut] = useState('');
  const [expectedDoCollection, setExpectedDoCollection] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [terminalBookingRequired, setTerminalBookingRequired] = useState(true);
  const [releaseOrderNeeded, setReleaseOrderNeeded] = useState(false);
  const [expectedPickupDate, setExpectedPickupDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTerminalName(existing?.terminal_name ?? '');
    setArrivalDate(existing?.arrival_date ?? '');
    setContainerPosition(existing?.container_position ?? '');
    setHoldingBay(existing?.holding_bay ?? '');
    setStackNumber(existing?.stack_number ?? '');
    setExamScheduledDate(existing?.examination_scheduled_date ?? '');
    setGatePassNumber(existing?.gate_pass_number ?? '');
    setExitNoteNumber(existing?.exit_note_number ?? '');
    setReleaseDate(existing?.release_date ?? '');
    setFreeTimeDays(existing?.free_time_days != null ? String(existing.free_time_days) : '');
    setFreeTimeExpiry(existing?.free_time_expiry ?? '');
    setStatus(existing?.status ?? 'waiting');
    setNotes(existing?.notes ?? '');
    setTerminalContact(existing?.terminal_contact ?? '');
    setBookingSlot(existing?.booking_slot ?? '');
    setTerminalReference(existing?.terminal_reference ?? '');
    setExpectedGateIn(existing?.expected_gate_in ?? '');
    setExpectedGateOut(existing?.expected_gate_out ?? '');
    setExpectedDoCollection(existing?.expected_delivery_order_collection ?? '');
    setExpectedArrivalDate(existing?.expected_arrival_date ?? '');
    setTerminalBookingRequired(existing?.terminal_booking_required ?? true);
    setReleaseOrderNeeded(existing?.release_order_needed ?? false);
    setExpectedPickupDate(existing?.expected_pickup_date ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const payload = {
        terminal_name: terminalName.trim() || null,
        arrival_date: arrivalDate || null,
        container_position: containerPosition.trim() || null,
        holding_bay: holdingBay.trim() || null,
        stack_number: stackNumber.trim() || null,
        examination_scheduled_date: examScheduledDate || null,
        gate_pass_number: gatePassNumber.trim() || null,
        exit_note_number: exitNoteNumber.trim() || null,
        release_date: releaseDate || null,
        free_time_days: freeTimeDays ? Number(freeTimeDays) : null,
        free_time_expiry: freeTimeExpiry || null,
        status,
        notes: notes.trim() || null,
        terminal_contact: terminalContact.trim() || null,
        booking_slot: bookingSlot.trim() || null,
        terminal_reference: terminalReference.trim() || null,
        expected_gate_in: expectedGateIn || null,
        expected_gate_out: expectedGateOut || null,
        expected_delivery_order_collection: expectedDoCollection || null,
        expected_arrival_date: expectedArrivalDate || null,
        terminal_booking_required: terminalBookingRequired,
        release_order_needed: releaseOrderNeeded,
        expected_pickup_date: expectedPickupDate || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase
          .from('terminal_operations')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'terminal.updated',
          entity_type: 'terminal_operations',
          entity_id: existing.id,
          description: `Updated terminal record (status: ${status})`,
          metadata: { shipment_id: shipmentId },
        });
        toast.success('Terminal record updated');
      } else {
        const { data: created, error } = await supabase
          .from('terminal_operations')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id })
          .select('id')
          .single();
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'terminal.created',
          entity_type: 'terminal_operations',
          entity_id: created?.id,
          description: `Created terminal record (status: ${status})`,
          metadata: { shipment_id: shipmentId },
        });
        toast.success('Terminal record created');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save terminal record'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const result = await adminForceDelete('terminal_operations', existing.id);
      if (!result.success) throw new Error(result.error);
      toast.success('Terminal record permanently deleted');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete terminal record'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Terminal Record' : 'New Terminal Record'}</DialogTitle>
          <DialogDescription>
            Container position, examination schedule, and release documents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tf-terminal">Terminal</Label>
              <Input
                id="tf-terminal"
                list="tf-terminal-suggestions"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="PTML, APM, TICT, ENL…"
              />
              <datalist id="tf-terminal-suggestions">
                <option value="PTML" />
                <option value="APM Terminals" />
                <option value="TICT" />
                <option value="ENL Consortium" />
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-arrival">Arrival Date</Label>
              <Input
                id="tf-arrival"
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tf-position">Container Position</Label>
              <Input
                id="tf-position"
                value={containerPosition}
                onChange={(e) => setContainerPosition(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-bay">Holding Bay</Label>
              <Input id="tf-bay" value={holdingBay} onChange={(e) => setHoldingBay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-stack">Stack Number</Label>
              <Input id="tf-stack" value={stackNumber} onChange={(e) => setStackNumber(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tf-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TerminalStatus)}>
                <SelectTrigger id="tf-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-exam-date">Examination Schedule</Label>
              <Input
                id="tf-exam-date"
                type="date"
                value={examScheduledDate}
                onChange={(e) => setExamScheduledDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tf-gate-pass">Gate Pass Number</Label>
              <Input
                id="tf-gate-pass"
                value={gatePassNumber}
                onChange={(e) => setGatePassNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-exit-note">Exit Note Number</Label>
              <Input
                id="tf-exit-note"
                value={exitNoteNumber}
                onChange={(e) => setExitNoteNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tf-release-date">Release Date</Label>
            <Input
              id="tf-release-date"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Demurrage Free Time
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tf-free-days">Carrier Free Days</Label>
                <Input
                  id="tf-free-days"
                  type="number"
                  min="0"
                  value={freeTimeDays}
                  onChange={(e) => setFreeTimeDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-free-expiry">Free Time Expires</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="tf-free-expiry"
                    type="date"
                    value={freeTimeExpiry}
                    onChange={(e) => setFreeTimeExpiry(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 px-2.5"
                    disabled={!arrivalDate || !freeTimeDays}
                    onClick={() => {
                      const base = new Date(arrivalDate);
                      base.setDate(base.getDate() + Number(freeTimeDays));
                      setFreeTimeExpiry(base.toISOString().split('T')[0]);
                    }}
                  >
                    From arrival
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Terminal Booking (Planning)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tf-contact">Terminal Contact</Label>
                <Input
                  id="tf-contact"
                  value={terminalContact}
                  onChange={(e) => setTerminalContact(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-slot">Booking Slot</Label>
                <Input id="tf-slot" value={bookingSlot} onChange={(e) => setBookingSlot(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-reference">Terminal Reference</Label>
                <Input
                  id="tf-reference"
                  value={terminalReference}
                  onChange={(e) => setTerminalReference(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tf-exp-gate-in">Expected Gate In</Label>
                <Input
                  id="tf-exp-gate-in"
                  type="date"
                  value={expectedGateIn}
                  onChange={(e) => setExpectedGateIn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-exp-gate-out">Expected Gate Out</Label>
                <Input
                  id="tf-exp-gate-out"
                  type="date"
                  value={expectedGateOut}
                  onChange={(e) => setExpectedGateOut(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-exp-do">Expected DO Collection</Label>
                <Input
                  id="tf-exp-do"
                  type="date"
                  value={expectedDoCollection}
                  onChange={(e) => setExpectedDoCollection(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-exp-arrival">Expected Arrival</Label>
                <Input
                  id="tf-exp-arrival"
                  type="date"
                  value={expectedArrivalDate}
                  onChange={(e) => setExpectedArrivalDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-exp-pickup">Expected Container Pickup</Label>
                <Input
                  id="tf-exp-pickup"
                  type="date"
                  value={expectedPickupDate}
                  onChange={(e) => setExpectedPickupDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={terminalBookingRequired}
                  onCheckedChange={(c) => setTerminalBookingRequired(c === true)}
                />
                Terminal booking required?
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={releaseOrderNeeded} onCheckedChange={(c) => setReleaseOrderNeeded(c === true)} />
                Release order needed?
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tf-notes">Notes</Label>
            <Textarea id="tf-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className={existing && hasRole('admin') ? 'sm:justify-between' : undefined}>
          {existing && hasRole('admin') && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting || submitting}
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete Permanently
            </Button>
          )}
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {existing ? 'Save Changes' : 'Create Record'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
