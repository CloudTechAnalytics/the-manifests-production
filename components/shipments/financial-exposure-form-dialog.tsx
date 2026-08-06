'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { EXPOSURE_TYPE_META, EXPOSURE_STATUS_META, RESPONSIBLE_PARTY_META, formatCurrency } from '@/lib/utils/status';
import { computeExposureAccrual } from '@/lib/utils/financial-exposure';
import { CURRENCIES } from '@/lib/quotation-constants';
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
import type { ExposureType, ExposureStatus, ResponsibleParty, FinancialExposure, ShipmentStatus } from '@/types';

const EXPOSURE_TYPE_OPTIONS = (Object.keys(EXPOSURE_TYPE_META) as ExposureType[]).map((value) => ({
  value,
  label: EXPOSURE_TYPE_META[value].label,
}));
const EXPOSURE_STATUS_OPTIONS = (Object.keys(EXPOSURE_STATUS_META) as ExposureStatus[]).map((value) => ({
  value,
  label: EXPOSURE_STATUS_META[value].label,
}));
const RESPONSIBLE_PARTY_OPTIONS = (Object.keys(RESPONSIBLE_PARTY_META) as ResponsibleParty[]).map((value) => ({
  value,
  label: RESPONSIBLE_PARTY_META[value].label,
}));

interface FinancialExposureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  shipmentStatus: ShipmentStatus;
  defaultCurrency: string;
  defaultExposureType: ExposureType;
  existing: FinancialExposure | null;
  onSaved: () => void;
}

export function FinancialExposureFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  shipmentStatus,
  defaultCurrency,
  defaultExposureType,
  existing,
  onSaved,
}: FinancialExposureFormDialogProps) {
  const { profile } = useAuth();

  const [exposureType, setExposureType] = useState<ExposureType>(defaultExposureType);
  const [startDate, setStartDate] = useState('');
  const [freeDays, setFreeDays] = useState('0');
  const [endDate, setEndDate] = useState('');
  const [chargePerDay, setChargePerDay] = useState('0');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [responsibleParty, setResponsibleParty] = useState<ResponsibleParty>('customer');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<ExposureStatus>('pending');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExposureType(existing?.exposure_type ?? defaultExposureType);
    setStartDate(existing?.start_date ?? new Date().toISOString().split('T')[0]);
    setFreeDays(existing ? String(existing.free_days) : '0');
    setEndDate(existing?.end_date ?? '');
    setChargePerDay(existing ? String(existing.charge_per_day) : '0');
    setCurrency(existing?.currency ?? defaultCurrency);
    setResponsibleParty(existing?.responsible_party ?? 'customer');
    setReason(existing?.reason ?? '');
    setStatus(existing?.status ?? 'pending');
  }, [open, existing, defaultExposureType, defaultCurrency]);

  const preview = computeExposureAccrual({
    start_date: startDate || new Date().toISOString().split('T')[0],
    free_days: Number(freeDays) || 0,
    end_date: endDate || null,
    charge_per_day: Number(chargePerDay) || 0,
  });

  const handleSubmit = async () => {
    if (!profile) return;
    if (!startDate) {
      toast.error('Start date is required');
      return;
    }
    if (endDate && endDate < startDate) {
      toast.error('End date can’t be before the start date');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        exposure_type: exposureType,
        start_date: startDate,
        free_days: Math.max(0, Number(freeDays) || 0),
        end_date: endDate || null,
        charge_per_day: Math.max(0, Number(chargePerDay) || 0),
        currency,
        responsible_party: responsibleParty,
        reason: reason.trim() || null,
        status,
        updated_by: profile.id,
      };

      if (existing) {
        const statusChanged = status !== existing.status;
        const updatePayload: Record<string, unknown> = { ...payload };
        if (statusChanged && status === 'approved' && existing.status !== 'approved') {
          updatePayload.approved_by = profile.id;
          updatePayload.approved_at = new Date().toISOString();
        }

        const { error } = await supabase.from('financial_exposures').update(updatePayload).eq('id', existing.id);
        if (error) throw error;

        if (statusChanged) {
          await supabase.from('activities').insert({
            user_id: profile.id,
            branch_id: branchId,
            action: 'financial_exposure.status_changed',
            entity_type: 'financial_exposure',
            entity_id: existing.id,
            description: `Financial exposure (${EXPOSURE_TYPE_META[exposureType]?.label ?? exposureType}) status changed from "${EXPOSURE_STATUS_META[existing.status]?.label ?? existing.status}" to "${EXPOSURE_STATUS_META[status]?.label ?? status}"`,
            metadata: { from: existing.status, to: status, reason: reason.trim() || null },
          });
        }
        toast.success('Financial exposure updated');
      } else {
        const { data: created, error } = await supabase
          .from('financial_exposures')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id })
          .select('id')
          .single();
        if (error) throw error;

        await supabase.from('shipment_timeline').insert({
          shipment_id: shipmentId,
          status: shipmentStatus,
          notes: `Financial exposure recorded: ${EXPOSURE_TYPE_META[exposureType]?.label ?? exposureType} (${formatCurrency(
            Number(chargePerDay) || 0,
            currency
          )}/day, ${freeDays} free days)`,
          created_by: profile.id,
        });

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'financial_exposure.created',
          entity_type: 'financial_exposure',
          entity_id: created?.id,
          description: `Financial exposure recorded: ${EXPOSURE_TYPE_META[exposureType]?.label ?? exposureType}`,
          metadata: {
            exposure_type: exposureType,
            start_date: startDate,
            free_days: payload.free_days,
            charge_per_day: payload.charge_per_day,
            currency,
            responsible_party: responsibleParty,
          },
        });
        toast.success('Financial exposure recorded');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save financial exposure'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Financial Exposure' : 'Record Financial Exposure'}</DialogTitle>
          <DialogDescription>
            Money being lost after this shipment is already underway — never a quotation charge.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fe-type">Type</Label>
            <Select value={exposureType} onValueChange={(v) => setExposureType(v as ExposureType)}>
              <SelectTrigger id="fe-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPOSURE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fe-start">Start Date</Label>
              <Input id="fe-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-free-days">Free Days</Label>
              <Input
                id="fe-free-days"
                type="number"
                min="0"
                value={freeDays}
                onChange={(e) => setFreeDays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-end">End Date</Label>
              <Input
                id="fe-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Leave blank while still accruing"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-charge">Charge Per Day</Label>
              <Input
                id="fe-charge"
                type="number"
                min="0"
                step="0.01"
                value={chargePerDay}
                onChange={(e) => setChargePerDay(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Chargeable Days: <span className="font-semibold text-foreground">{preview.chargeableDays}</span>
            </span>
            <span className="font-semibold">{formatCurrency(preview.accumulatedCost, currency)}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fe-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="fe-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-party">Responsible Party</Label>
              <Select value={responsibleParty} onValueChange={(v) => setResponsibleParty(v as ResponsibleParty)}>
                <SelectTrigger id="fe-party">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSIBLE_PARTY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fe-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ExposureStatus)}>
              <SelectTrigger id="fe-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPOSURE_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fe-reason">Reason</Label>
            <Textarea
              id="fe-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What caused this — e.g. late customs clearance, terminal congestion"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Record Exposure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
