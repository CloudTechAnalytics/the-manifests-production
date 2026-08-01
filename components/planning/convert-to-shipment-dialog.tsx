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
import type { ShipmentPlan } from '@/types';

interface ConvertToShipmentDialogProps {
  plan: ShipmentPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted: () => void;
}

export function ConvertToShipmentDialog({
  plan,
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
      const containerNumber =
        plan.container_type && plan.container_quantity
          ? `${plan.container_quantity} x ${plan.container_type}`
          : plan.container_type || null;

      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          customer_id: plan.customer_id,
          quotation_id: plan.quotation_id,
          branch_id: plan.branch_id,
          shipment_type: plan.shipment_type,
          origin: plan.origin,
          destination: plan.destination,
          status: 'booking_received',
          assigned_to: plan.assigned_to,
          booking_date: plan.booking_confirmed_date ?? new Date().toISOString().split('T')[0],
          estimated_departure: plan.planned_etd,
          estimated_arrival: plan.planned_eta,
          carrier: plan.carrier_line,
          container_number: containerNumber,
          weight: plan.total_weight,
          volume: plan.total_volume,
          notes: plan.notes,
          // Trade documentation captured at planning time — previously
          // dropped on conversion, now carried onto the live shipment.
          incoterm: plan.incoterm,
          hs_code: plan.hs_code,
          commodity: plan.commodity,
          vessel_name: plan.vessel_name,
          voyage_number: plan.voyage_number,
          port_of_loading: plan.port_of_loading,
          port_of_discharge: plan.port_of_discharge,
          goods_value: plan.goods_value,
          goods_value_currency: plan.goods_value_currency,
          actual_weight: plan.actual_weight,
          volumetric_weight: plan.volumetric_weight,
          chargeable_weight: plan.chargeable_weight,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, reference_number')
        .single();

      if (shipmentError || !shipment) {
        throw new Error(shipmentError?.message ?? 'Failed to create shipment');
      }

      // A plan's container_type/quantity is a rollup ("2 x 40ft"); give the
      // live shipment real per-container rows to add seals/weights to,
      // rather than leaving that only as a free-text summary.
      if (plan.container_type && plan.container_quantity && plan.container_quantity > 0) {
        const containerRows = Array.from({ length: plan.container_quantity }, () => ({
          shipment_id: shipment.id,
          branch_id: plan.branch_id,
          container_type: plan.container_type,
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
        notes: `Created from plan ${plan.plan_number ?? ''}`,
        created_by: profile.id,
      });

      const { error: planError } = await supabase
        .from('shipment_plans')
        .update({
          converted_shipment_id: shipment.id,
          converted_at: new Date().toISOString(),
          status: 'completed',
          updated_by: profile.id,
        })
        .eq('id', plan.id);

      if (planError) {
        toast.warning('Shipment created, but the plan record failed to update.');
      }

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: plan.branch_id,
        action: 'plan.converted',
        entity_type: 'shipment_plan',
        entity_id: plan.id,
        description: `Converted plan ${plan.plan_number ?? ''} to shipment ${shipment.reference_number ?? ''}`,
        metadata: { shipment_id: shipment.id },
      });

      try {
        await seedShipmentStages(shipment.id, plan.branch_id, profile.id);
      } catch (stageError) {
        console.error('Workflow stage seed error:', stageError);
      }

      toast.success(`Converted to shipment ${shipment.reference_number}`);
      onConverted();
      onOpenChange(false);
      router.push(`/shipments/${shipment.id}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to convert plan');
      toast.error(message);
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
            This creates a real shipment from &quot;{plan.plan_number}&quot; using its route,
            cargo, and vessel details, and marks this plan as Completed. This can&apos;t be
            undone.
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
