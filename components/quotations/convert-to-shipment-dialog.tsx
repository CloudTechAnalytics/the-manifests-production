'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { seedShipmentStages } from '@/lib/utils/seed-shipment-stages';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type { Quotation, QuotationItem } from '@/types';

interface ConvertToShipmentDialogProps {
  quotation: Quotation & { items?: QuotationItem[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted: () => void;
}

/**
 * Section 13 — direct Quotation -> Shipment conversion. Deliberately
 * bypasses Shipment Planning: everything Operations needs (route,
 * incoterm, cargo, containers, weight, services, required documents) was
 * already captured at quote time, so there's nothing left to plan before
 * booking. Planning stays available separately for shipments that do
 * need that intermediate step — this doesn't replace it, just adds a
 * shorter path for the common case.
 */
export function ConvertToShipmentDialog({
  quotation,
  open,
  onOpenChange,
  onConverted,
}: ConvertToShipmentDialogProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [converting, setConverting] = useState(false);

  const handleConvert = async () => {
    if (!profile?.id) return;
    setConverting(true);
    try {
      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          customer_id: quotation.customer_id,
          quotation_id: quotation.id,
          branch_id: quotation.branch_id,
          shipment_type: quotation.shipment_type,
          origin: quotation.origin_port ?? quotation.origin,
          destination: quotation.destination_port ?? quotation.destination,
          status: 'booking_received',
          booking_date: new Date().toISOString().split('T')[0],
          estimated_departure: quotation.expected_shipping_date,
          estimated_arrival: quotation.expected_arrival_date,
          weight: quotation.weight,
          volume: quotation.cbm,
          notes: quotation.notes,
          incoterm: quotation.incoterm,
          hs_code: quotation.hs_code,
          commodity: quotation.commodity_description,
          port_of_loading: quotation.origin_port,
          port_of_discharge: quotation.destination_port,
          goods_value: quotation.cargo_value,
          goods_value_currency: quotation.currency,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, reference_number')
        .single();

      if (shipmentError || !shipment) {
        throw new Error(shipmentError?.message ?? 'Failed to create shipment');
      }

      if (quotation.container_count && quotation.container_count > 0) {
        const containerRows = Array.from({ length: quotation.container_count }, () => ({
          shipment_id: shipment.id,
          branch_id: quotation.branch_id,
          container_type: quotation.container_size,
          created_by: profile.id,
        }));
        const { error: containerError } = await supabase
          .from('shipment_containers')
          .insert(containerRows);
        if (containerError) {
          console.error('Container row seed error:', containerError);
        }
      }

      await supabase.from('shipment_timeline').insert({
        shipment_id: shipment.id,
        status: 'booking_received',
        notes: `Created from quotation ${quotation.quotation_number ?? ''}`,
        created_by: profile.id,
      });

      const { error: quotationError } = await supabase
        .from('quotations')
        .update({
          converted_shipment_id: shipment.id,
          converted_at: new Date().toISOString(),
          updated_by: profile.id,
        })
        .eq('id', quotation.id);

      if (quotationError) {
        toast.warning('Shipment created, but the quotation record failed to update.');
      }

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotation.branch_id,
        action: 'quotation.converted',
        entity_type: 'quotation',
        entity_id: quotation.id,
        description: `Converted quotation ${quotation.quotation_number ?? ''} to shipment ${shipment.reference_number ?? ''}`,
        metadata: { shipment_id: shipment.id },
      });

      try {
        await seedShipmentStages(shipment.id, quotation.branch_id, profile.id);
      } catch (stageError) {
        console.error('Workflow stage seed error:', stageError);
      }

      toast.success(`Converted to shipment ${shipment.reference_number}`);
      onConverted();
      onOpenChange(false);
      router.push(`/shipments/${shipment.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to convert quotation'));
    } finally {
      setConverting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Convert to Shipment?
          </DialogTitle>
          <DialogDescription>
            This creates a real shipment from &quot;{quotation.quotation_number}&quot; — route,
            incoterm, cargo, containers, and required documents all carry over, so Operations
            won&apos;t need to ask the customer for anything already captured here. This can&apos;t
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleConvert} disabled={converting}>
            {converting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Convert to Shipment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
