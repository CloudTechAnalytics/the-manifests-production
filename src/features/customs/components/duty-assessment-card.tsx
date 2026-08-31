'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Pencil } from 'lucide-react';
import { DUTY_STATUS_META, formatCurrency, formatDate } from '@/shared/lib/utils/status';
import { Button } from '@/shared/components/ui/button';
import { fetchCustomsDocument, getCustomsDocumentDownloadUrl } from '@/features/customs/services/customs.service';
import type { ShipmentCustoms } from '@/shared/types';

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

interface DutyAssessmentCardProps {
  customsRecord: ShipmentCustoms;
  onEdit: () => void;
}

export function DutyAssessmentCard({ customsRecord, onEdit }: DutyAssessmentCardProps) {
  const [downloading, setDownloading] = useState(false);

  const documentId = customsRecord.duty_receipt_document_id;
  const { data: receiptDoc } = useQuery({
    queryKey: ['customs-document', documentId],
    queryFn: () => fetchCustomsDocument(documentId!),
    enabled: !!documentId,
  });
  const receiptName = documentId ? receiptDoc?.name ?? 'Receipt on file' : null;

  const handleDownloadReceipt = async () => {
    if (!customsRecord.duty_receipt_document_id) return;
    setDownloading(true);
    try {
      const signedUrl = await getCustomsDocumentDownloadUrl(customsRecord.duty_receipt_document_id);
      window.open(signedUrl, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download receipt');
    } finally {
      setDownloading(false);
    }
  };

  const statusMeta = DUTY_STATUS_META[customsRecord.duty_status] ?? {
    label: customsRecord.duty_status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Duty Assessment
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoRow label="Duty Amount" value={formatCurrency(customsRecord.duty_amount)} />
        <InfoRow label="VAT" value={formatCurrency(customsRecord.duty_vat)} />
        <InfoRow label="Levy" value={formatCurrency(customsRecord.duty_levy)} />
        <InfoRow label="CISS" value={formatCurrency(customsRecord.duty_ciss)} />
        <InfoRow label="ETLS" value={formatCurrency(customsRecord.duty_etls)} />
        <InfoRow
          label="Total Duty"
          value={<span className="font-bold">{formatCurrency(customsRecord.duty_total)}</span>}
        />
        <InfoRow label="Paid By" value={customsRecord.duty_paid_by || '—'} />
        <InfoRow label="Payment Date" value={formatDate(customsRecord.duty_paid_date)} />
        <InfoRow
          label="Status"
          value={
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
          }
        />
      </div>

      {customsRecord.duty_receipt_document_id && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={downloading}
          onClick={handleDownloadReceipt}
        >
          <Download className="h-3.5 w-3.5" />
          {receiptName ?? 'Download Receipt'}
        </Button>
      )}
    </div>
  );
}
