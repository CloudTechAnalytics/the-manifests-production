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
import type { ExaminationResult, ShipmentExamination } from '@/shared/types';

const RESULT_OPTIONS: { value: ExaminationResult; label: string }[] = [
  { value: 'passed', label: 'Passed' },
  { value: 'held', label: 'Held' },
  { value: 'additional_duty', label: 'Additional Duty Assessed' },
  { value: 'further_inspection', label: 'Further Inspection Required' },
];

interface ExaminationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: ShipmentExamination | null;
  onSaved: () => void;
}

export function ExaminationFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: ExaminationFormDialogProps) {
  const { profile, hasRole } = useAuth();
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionOfficer, setInspectionOfficer] = useState('');
  const [terminalOfficer, setTerminalOfficer] = useState('');
  const [shippingLineRep, setShippingLineRep] = useState('');
  const [forwarderRep, setForwarderRep] = useState('');
  const [result, setResult] = useState<ExaminationResult | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInspectionDate(existing?.inspection_date ?? '');
    setInspectionOfficer(existing?.inspection_officer ?? '');
    setTerminalOfficer(existing?.terminal_officer ?? '');
    setShippingLineRep(existing?.shipping_line_representative ?? '');
    setForwarderRep(existing?.freight_forwarder_representative ?? '');
    setResult(existing?.result ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const payload = {
        inspection_date: inspectionDate || null,
        inspection_officer: inspectionOfficer.trim() || null,
        terminal_officer: terminalOfficer.trim() || null,
        shipping_line_representative: shippingLineRep.trim() || null,
        freight_forwarder_representative: forwarderRep.trim() || null,
        result: result || null,
        notes: notes.trim() || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase
          .from('shipment_examinations')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'examination.updated',
          entity_type: 'shipment_examinations',
          entity_id: existing.id,
          description: `Updated examination record${result ? ` (result: ${result})` : ''}`,
        });
        toast.success('Examination record updated');
      } else {
        const { data: created, error } = await supabase
          .from('shipment_examinations')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id })
          .select('id')
          .single();
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'examination.created',
          entity_type: 'shipment_examinations',
          entity_id: created?.id,
          description: `Logged a physical examination${result ? ` (result: ${result})` : ''}`,
        });
        toast.success('Examination logged');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save examination record'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const result = await adminForceDelete('shipment_examinations', existing.id);
      if (!result.success) throw new Error(result.error);
      toast.success('Examination record permanently deleted');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete examination record'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Examination' : 'Log Physical Examination'}</DialogTitle>
          <DialogDescription>
            Only relevant when Customs selected the Red inspection channel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ef-date">Inspection Date</Label>
              <Input
                id="ef-date"
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ef-result">Result</Label>
              <Select value={result} onValueChange={(v) => setResult(v as ExaminationResult)}>
                <SelectTrigger id="ef-result">
                  <SelectValue placeholder="Pending" />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ef-inspection-officer">Inspection Officer</Label>
              <Input
                id="ef-inspection-officer"
                value={inspectionOfficer}
                onChange={(e) => setInspectionOfficer(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ef-terminal-officer">Terminal Officer</Label>
              <Input
                id="ef-terminal-officer"
                value={terminalOfficer}
                onChange={(e) => setTerminalOfficer(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ef-shipping-rep">Shipping Line Representative</Label>
              <Input
                id="ef-shipping-rep"
                value={shippingLineRep}
                onChange={(e) => setShippingLineRep(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ef-forwarder-rep">Freight Forwarder</Label>
              <Input
                id="ef-forwarder-rep"
                value={forwarderRep}
                onChange={(e) => setForwarderRep(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ef-notes">Notes</Label>
            <Textarea id="ef-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Inspection photos/report can be attached from this shipment's Documents tab.
            </p>
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
              {existing ? 'Save Changes' : 'Log Examination'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
