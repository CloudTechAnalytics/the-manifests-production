'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { BOOKING_STATUS_META, formatDate } from '@/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShipmentDocumentationDialog, VESSEL_LABELS } from '@/components/shipments/shipment-documentation-dialog';
import type { Shipment, ShipmentType } from '@/types';

const CARD_TITLES: Partial<Record<ShipmentType, string>> = {
  sea: 'Vessel Planning',
  air: 'Flight Planning',
  rail: 'Rail Planning',
  road: 'Booking',
  multimodal: 'Vessel Planning',
};

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

interface VesselPlanningCardProps {
  shipment: Shipment;
  onChanged: () => void;
}

export function VesselPlanningCard({ shipment, onChanged }: VesselPlanningCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [docName, setDocName] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!shipment.booking_confirmation_document_id) {
      setDocName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('documents')
      .select('name')
      .eq('id', shipment.booking_confirmation_document_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDocName(data?.name ?? 'Document on file');
      });
    return () => {
      cancelled = true;
    };
  }, [shipment.booking_confirmation_document_id]);

  const handleDownload = async () => {
    if (!shipment.booking_confirmation_document_id) return;
    setDownloading(true);
    try {
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', shipment.booking_confirmation_document_id)
        .maybeSingle();
      if (fetchError || !doc?.file_path) throw new Error('Document not found');

      const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to generate download link');
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download document');
    } finally {
      setDownloading(false);
    }
  };

  const isRoad = shipment.shipment_type === 'road';
  const labels = (shipment.shipment_type && VESSEL_LABELS[shipment.shipment_type]) || VESSEL_LABELS.sea!;
  const bookingStatus = shipment.booking_status ?? 'pending';
  const bookingMeta = BOOKING_STATUS_META[bookingStatus] ?? { label: bookingStatus, color: 'bg-muted text-muted-foreground' };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">
          {(shipment.shipment_type && CARD_TITLES[shipment.shipment_type]) || 'Vessel Planning'}
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {bookingStatus !== 'confirmed' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Booking has not yet been confirmed ({bookingMeta.label}). Planning cannot be completed until
              booking is confirmed.
            </span>
          </div>
        )}
        {!isRoad && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoRow label={labels.vessel} value={shipment.vessel_name || '—'} />
            <InfoRow label={labels.voyage} value={shipment.voyage_number || '—'} />
            <InfoRow label={labels.carrier} value={shipment.carrier || '—'} />
            <InfoRow label="Est. Departure" value={formatDate(shipment.estimated_departure)} />
            <InfoRow label="Est. Arrival" value={formatDate(shipment.estimated_arrival)} />
            <InfoRow label={labels.pol} value={shipment.port_of_loading || '—'} />
            <InfoRow label={labels.pod} value={shipment.port_of_discharge || '—'} />
            <InfoRow label="Transshipment Port" value={shipment.transshipment_port || '—'} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoRow label="Booking Reference" value={shipment.booking_reference || '—'} />
          <InfoRow label="Booking Date" value={formatDate(shipment.booking_date)} />
          <InfoRow
            label="Booking Status"
            value={
              <Badge variant="secondary" className={bookingMeta.color}>
                {bookingMeta.label}
              </Badge>
            }
          />
        </div>
        {shipment.booking_confirmation_document_id && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={downloading}
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            {docName ?? 'Download Booking Confirmation'}
          </Button>
        )}
      </CardContent>

      <ShipmentDocumentationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        shipment={shipment}
        onSaved={onChanged}
      />
    </Card>
  );
}
