'use client';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { getConversionBlockers } from '@/shared/lib/utils/shipment-conversion';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/components/ui/dialog';
import type { Quotation, QuotationItem } from '@/shared/types';

interface ConvertToShipmentDialogProps {
  quotation: Quotation & { items?: QuotationItem[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted: () => void;
}

/**
 * Section 13 — direct Quotation -> Shipment conversion. A thin wrapper
 * around the convert_quotation_to_shipment() RPC (migration 053) — that
 * function is what actually creates the shipment, seeds Planning/
 * Documentation/Customs/Terminal/Examination/Warehouse/Delivery records
 * per the quotation's selected services, and locks the quotation, all in
 * one atomic transaction. This component's only jobs are: show blockers
 * before the call, make the call, and translate its outcome (already
 * converted / validation failed / permission denied / success) into UI.
 */
export function ConvertToShipmentDialog({
  quotation,
  open,
  onOpenChange,
  onConverted,
}: ConvertToShipmentDialogProps) {
  const navigate = useNavigate();
  const [converting, setConverting] = useState(false);

  const blockers = getConversionBlockers(quotation);

  const handleConvert = async () => {
    setConverting(true);
    try {
      const { data, error } = await supabase.rpc('convert_quotation_to_shipment', {
        p_quotation_id: quotation.id,
      });

      if (error) {
        const message = error.message ?? '';

        if (message.startsWith('ALREADY_CONVERTED:')) {
          const shipmentId = message.slice('ALREADY_CONVERTED:'.length).trim();
          toast.info('This quotation has already been converted to a shipment.');
          onOpenChange(false);
          navigate(`/shipments/${shipmentId}`);
          return;
        }
        if (message.startsWith('VALIDATION_FAILED:')) {
          toast.error(message.slice('VALIDATION_FAILED:'.length).trim());
          return;
        }
        if (message.startsWith('PERMISSION_DENIED')) {
          toast.error("You don't have permission to start a shipment — this is an Operations action.");
          return;
        }
        throw error;
      }

      const result = data as { shipment_id: string; reference_number: string };
      toast.success(
        `Shipment ${result.reference_number} created successfully and handed over to Operations.`
      );
      onConverted();
      onOpenChange(false);
      navigate(`/shipments/${result.shipment_id}`);
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
            incoterm, cargo, containers, services, and required documents all carry over, and
            Planning/Documentation/Customs/Terminal/Examination/Warehouse/Delivery records are
            created automatically for whichever services this quotation includes. This can&apos;t
            be undone.
          </DialogDescription>
        </DialogHeader>

        {blockers.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Fix these before converting:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleConvert} disabled={converting || blockers.length > 0}>
            {converting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Convert to Shipment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
