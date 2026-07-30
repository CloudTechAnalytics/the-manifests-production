'use client';

import { useEffect, useState } from 'react';
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
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TerminalOperation, TerminalStatus } from '@/types';

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
  const { profile } = useAuth();
  const [terminalName, setTerminalName] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [containerPosition, setContainerPosition] = useState('');
  const [holdingBay, setHoldingBay] = useState('');
  const [stackNumber, setStackNumber] = useState('');
  const [examScheduledDate, setExamScheduledDate] = useState('');
  const [gatePassNumber, setGatePassNumber] = useState('');
  const [exitNoteNumber, setExitNoteNumber] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [status, setStatus] = useState<TerminalStatus>('waiting');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    setStatus(existing?.status ?? 'waiting');
    setNotes(existing?.notes ?? '');
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
        status,
        notes: notes.trim() || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Terminal Record' : 'New Terminal Record'}</DialogTitle>
          <DialogDescription>
            Container position, examination schedule, and release documents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tf-terminal">Terminal Name</Label>
              <Input id="tf-terminal" value={terminalName} onChange={(e) => setTerminalName(e.target.value)} />
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

          <div className="space-y-1.5">
            <Label htmlFor="tf-notes">Notes</Label>
            <Textarea id="tf-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Create Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
