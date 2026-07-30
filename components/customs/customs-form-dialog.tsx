'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { adminForceDelete } from '@/lib/utils/admin-delete';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { CustomsInspectionChannel, CustomsStatus, ShipmentCustoms } from '@/types';

const STATUS_OPTIONS: { value: CustomsStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'awaiting_assessment', label: 'Awaiting Assessment' },
  { value: 'duty_payment', label: 'Duty Payment' },
  { value: 'customs_processing', label: 'Customs Processing' },
  { value: 'released', label: 'Released' },
  { value: 'rejected', label: 'Rejected' },
];

const CHANNEL_OPTIONS: { value: CustomsInspectionChannel; label: string }[] = [
  { value: 'green', label: 'Green — No inspection' },
  { value: 'yellow', label: 'Yellow — Document check' },
  { value: 'red', label: 'Red — Physical examination' },
];

interface CustomsFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: ShipmentCustoms | null;
  onSaved: () => void;
}

export function CustomsFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: CustomsFormDialogProps) {
  const { profile } = useAuth();
  const [declarationNumber, setDeclarationNumber] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [dutyAmount, setDutyAmount] = useState('0');
  const [dutyPaid, setDutyPaid] = useState(false);
  const [dutyPaidDate, setDutyPaidDate] = useState('');
  const [customsOffice, setCustomsOffice] = useState('');
  const [inspectionChannel, setInspectionChannel] = useState<CustomsInspectionChannel | ''>('');
  const [officer, setOfficer] = useState('');
  const [status, setStatus] = useState<CustomsStatus>('draft');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDeclarationNumber(existing?.declaration_number ?? '');
    setHsCode(existing?.hs_code ?? '');
    setDutyAmount(existing ? String(existing.duty_amount) : '0');
    setDutyPaid(existing?.duty_paid ?? false);
    setDutyPaidDate(existing?.duty_paid_date ?? '');
    setCustomsOffice(existing?.customs_office ?? '');
    setInspectionChannel(existing?.inspection_channel ?? '');
    setOfficer(existing?.officer ?? '');
    setStatus(existing?.status ?? 'draft');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const payload = {
        declaration_number: declarationNumber.trim() || null,
        hs_code: hsCode.trim() || null,
        duty_amount: Number(dutyAmount) || 0,
        duty_paid: dutyPaid,
        duty_paid_date: dutyPaid ? dutyPaidDate || null : null,
        customs_office: customsOffice.trim() || null,
        inspection_channel: inspectionChannel || null,
        officer: officer.trim() || null,
        status,
        notes: notes.trim() || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase
          .from('shipment_customs')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'customs.updated',
          entity_type: 'shipment_customs',
          entity_id: existing.id,
          description: `Updated customs record (status: ${status})`,
        });
        toast.success('Customs record updated');
      } else {
        const { data: created, error } = await supabase
          .from('shipment_customs')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id })
          .select('id')
          .single();
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'customs.created',
          entity_type: 'shipment_customs',
          entity_id: created?.id,
          description: `Created customs record (status: ${status})`,
        });
        toast.success('Customs record created');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save customs record'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const result = await adminForceDelete('shipment_customs', existing.id);
      if (!result.success) throw new Error(result.error);
      toast.success('Customs record permanently deleted');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete customs record'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Customs Record' : 'New Customs Record'}</DialogTitle>
          <DialogDescription>
            Declaration, duty, and inspection details for this shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-declaration">Declaration Number</Label>
              <Input
                id="cf-declaration"
                value={declarationNumber}
                onChange={(e) => setDeclarationNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-hs">HS Code</Label>
              <Input id="cf-hs" value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-office">Customs Office</Label>
              <Input
                id="cf-office"
                value={customsOffice}
                onChange={(e) => setCustomsOffice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-officer">Officer</Label>
              <Input id="cf-officer" value={officer} onChange={(e) => setOfficer(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CustomsStatus)}>
                <SelectTrigger id="cf-status">
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
              <Label htmlFor="cf-channel">Inspection Channel</Label>
              <Select
                value={inspectionChannel}
                onValueChange={(v) => setInspectionChannel(v as CustomsInspectionChannel)}
              >
                <SelectTrigger id="cf-channel">
                  <SelectValue placeholder="Not yet assessed" />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((o) => (
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
              <Label htmlFor="cf-duty">Duty Amount</Label>
              <Input
                id="cf-duty"
                type="number"
                min="0"
                step="0.01"
                value={dutyAmount}
                onChange={(e) => setDutyAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-duty-date">Duty Paid Date</Label>
              <Input
                id="cf-duty-date"
                type="date"
                value={dutyPaidDate}
                onChange={(e) => setDutyPaidDate(e.target.value)}
                disabled={!dutyPaid}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="cf-duty-paid"
              checked={dutyPaid}
              onCheckedChange={(c) => setDutyPaid(c === true)}
            />
            <Label htmlFor="cf-duty-paid" className="font-normal">
              Duty has been paid
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cf-notes">Notes</Label>
            <Textarea id="cf-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className={existing && profile?.role === 'admin' ? 'sm:justify-between' : undefined}>
          {existing && profile?.role === 'admin' && (
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
