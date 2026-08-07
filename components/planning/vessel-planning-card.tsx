'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShipmentDocumentationDialog } from '@/components/shipments/shipment-documentation-dialog';
import type { Shipment } from '@/types';

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

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Vessel Planning</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoRow label="Vessel" value={shipment.vessel_name || '—'} />
          <InfoRow label="Voyage Number" value={shipment.voyage_number || '—'} />
          <InfoRow label="Shipping Line" value={shipment.carrier || '—'} />
          <InfoRow label="Est. Departure" value={formatDate(shipment.estimated_departure)} />
          <InfoRow label="Est. Arrival" value={formatDate(shipment.estimated_arrival)} />
          <InfoRow label="Port of Loading" value={shipment.port_of_loading || '—'} />
          <InfoRow label="Port of Discharge" value={shipment.port_of_discharge || '—'} />
          <InfoRow label="Transshipment Port" value={shipment.transshipment_port || '—'} />
          <InfoRow label="Booking Reference" value={shipment.booking_reference || '—'} />
          <InfoRow
            label="Booking Confirmed"
            value={
              <Badge variant="secondary" className={shipment.booking_confirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                {shipment.booking_confirmed ? 'Yes' : 'No'}
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
