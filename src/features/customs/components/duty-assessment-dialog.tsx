'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { uploadDocumentFile } from '@/shared/lib/utils/document-upload';
import { DUTY_STATUS_META } from '@/shared/lib/utils/status';
import { useAuth } from '@/shared/contexts/auth-context';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
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
import { fetchCustomsDocument, logCustomsActivity, updateDutyAssessment } from '@/features/customs/services/customs.service';
import type { DutyStatus, ShipmentCustoms } from '@/shared/types';

const DUTY_STATUS_OPTIONS = (Object.keys(DUTY_STATUS_META) as DutyStatus[]).map((value) => ({
  value,
  label: DUTY_STATUS_META[value].label,
}));

const MAX_RECEIPT_SIZE_BYTES = 50 * 1024 * 1024;

interface DutyAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: ShipmentCustoms;
  onSaved: () => void;
}

export function DutyAssessmentDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: DutyAssessmentDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dutyAmount, setDutyAmount] = useState('0');
  const [vat, setVat] = useState('0');
  const [levy, setLevy] = useState('0');
  const [ciss, setCiss] = useState('0');
  const [etls, setEtls] = useState('0');
  const [paidBy, setPaidBy] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [dutyStatus, setDutyStatus] = useState<DutyStatus>('not_assessed');
  const [receiptDocumentId, setReceiptDocumentId] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  useEffect(() => {
    if (!open) return;
    // ?? 0 / ?? 'not_assessed' guards against the duty_* columns not
    // existing yet on a database the 057 migration hasn't reached —
    // same "DB drift ahead of the frontend" scenario as every other
    // defensive META fallback in this app.
    setDutyAmount(String(existing.duty_amount ?? 0));
    setVat(String(existing.duty_vat ?? 0));
    setLevy(String(existing.duty_levy ?? 0));
    setCiss(String(existing.duty_ciss ?? 0));
    setEtls(String(existing.duty_etls ?? 0));
    setPaidBy(existing.duty_paid_by ?? '');
    setPaymentDate(existing.duty_paid_date ?? '');
    setDutyStatus(existing.duty_status ?? 'not_assessed');
    setReceiptDocumentId(existing.duty_receipt_document_id ?? null);
    setReceiptFileName(null);
  }, [open, existing]);

  // The receipt link only shows a filename once we know it — resolve it
  // lazily rather than joining `documents` into every shipment_customs
  // fetch elsewhere in the app. A freshly-uploaded receipt already has
  // its filename set locally (handleReceiptSelect via receiptFileName);
  // this query fills it in for a receipt that was already on file when
  // the dialog opened.
  const { data: receiptDoc } = useQuery({
    queryKey: ['customs-document', receiptDocumentId],
    queryFn: () => fetchCustomsDocument(receiptDocumentId!),
    enabled: open && !!receiptDocumentId,
  });
  const displayedReceiptName = receiptFileName ?? receiptDoc?.name ?? null;

  const totalDuty =
    (Number(dutyAmount) || 0) + (Number(vat) || 0) + (Number(levy) || 0) + (Number(ciss) || 0) + (Number(etls) || 0);

  const handleReceiptSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      toast.error('File is too large (max 50MB)');
      return;
    }
    setUploadingReceipt(true);
    try {
      const result = await uploadDocumentFile({
        file,
        branchId,
        shipmentId,
        category: 'customs',
        templateId: null,
        stageId: null,
        replacesDocumentId: null,
        createdBy: profile.id,
      });
      if (!result.success || !result.documentId) {
        throw new Error(result.error ?? 'Failed to upload receipt');
      }
      setReceiptDocumentId(result.documentId);
      setReceiptFileName(file.name);
      toast.success('Receipt uploaded');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload receipt'));
    } finally {
      setUploadingReceipt(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        duty_amount: Number(dutyAmount) || 0,
        duty_vat: Number(vat) || 0,
        duty_levy: Number(levy) || 0,
        duty_ciss: Number(ciss) || 0,
        duty_etls: Number(etls) || 0,
        duty_paid_by: paidBy.trim() || null,
        duty_paid_date: paymentDate || null,
        duty_status: dutyStatus,
        duty_paid: dutyStatus === 'paid' || dutyStatus === 'verified',
        duty_receipt_document_id: receiptDocumentId,
        updated_by: profile!.id,
      };

      await updateDutyAssessment(existing.id, payload);

      await logCustomsActivity({
        user_id: profile!.id,
        branch_id: branchId,
        action: 'customs.duty_assessment_updated',
        entity_type: 'shipment_customs',
        entity_id: existing.id,
        description: `Duty assessment updated (status: ${DUTY_STATUS_META[dutyStatus]?.label ?? dutyStatus}, total: ${totalDuty})`,
        metadata: { duty_status: dutyStatus, duty_total: totalDuty },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customs-queue'] });
      queryClient.invalidateQueries({ queryKey: ['customs-document', receiptDocumentId] });
      toast.success('Duty assessment saved');
      onOpenChange(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save duty assessment'));
    },
  });

  const handleSubmit = () => {
    if (!profile) return;
    saveMutation.mutate();
  };
  const submitting = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Duty Assessment</DialogTitle>
          <DialogDescription>
            Operational only — Customs Duty is paid by the importer directly to Nigeria Customs, never
            quotation revenue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="da-duty">Duty Amount</Label>
              <Input
                id="da-duty"
                type="number"
                min="0"
                step="0.01"
                value={dutyAmount}
                onChange={(e) => setDutyAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="da-vat">VAT</Label>
              <Input id="da-vat" type="number" min="0" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="da-levy">Levy</Label>
              <Input
                id="da-levy"
                type="number"
                min="0"
                step="0.01"
                value={levy}
                onChange={(e) => setLevy(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="da-ciss">CISS</Label>
              <Input
                id="da-ciss"
                type="number"
                min="0"
                step="0.01"
                value={ciss}
                onChange={(e) => setCiss(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="da-etls">ETLS</Label>
              <Input
                id="da-etls"
                type="number"
                min="0"
                step="0.01"
                value={etls}
                onChange={(e) => setEtls(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">Total Duty</span>
            <span className="text-lg font-bold">
              {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalDuty)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="da-paid-by">Paid By</Label>
              <Input
                id="da-paid-by"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="e.g. importer, forwarder"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="da-payment-date">Payment Date</Label>
              <Input
                id="da-payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="da-status">Status</Label>
            <Select value={dutyStatus} onValueChange={(v) => setDutyStatus(v as DutyStatus)}>
              <SelectTrigger id="da-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DUTY_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Receipt</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleReceiptSelect}
              accept=".pdf,.jpg,.jpeg,.png"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={uploadingReceipt}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingReceipt ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {receiptDocumentId ? 'Replace Receipt' : 'Upload Receipt'}
            </Button>
            {receiptDocumentId && (
              <p className="truncate text-xs text-muted-foreground">
                {displayedReceiptName ?? 'Receipt on file'}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting || uploadingReceipt}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Duty Assessment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
