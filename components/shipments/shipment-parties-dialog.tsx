'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
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
import type { Shipment } from '@/types';

interface ShipmentPartiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: Shipment;
  onSaved: () => void;
}

export function ShipmentPartiesDialog({
  open,
  onOpenChange,
  shipment,
  onSaved,
}: ShipmentPartiesDialogProps) {
  const { profile } = useAuth();
  const [shipperName, setShipperName] = useState('');
  const [shipperAddress, setShipperAddress] = useState('');
  const [consigneeName, setConsigneeName] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [notifyPartyName, setNotifyPartyName] = useState('');
  const [notifyPartyAddress, setNotifyPartyAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShipperName(shipment.shipper_name ?? '');
    setShipperAddress(shipment.shipper_address ?? '');
    setConsigneeName(shipment.consignee_name ?? '');
    setConsigneeAddress(shipment.consignee_address ?? '');
    setNotifyPartyName(shipment.notify_party_name ?? '');
    setNotifyPartyAddress(shipment.notify_party_address ?? '');
  }, [open, shipment]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const payload = {
        shipper_name: shipperName.trim() || null,
        shipper_address: shipperAddress.trim() || null,
        consignee_name: consigneeName.trim() || null,
        consignee_address: consigneeAddress.trim() || null,
        notify_party_name: notifyPartyName.trim() || null,
        notify_party_address: notifyPartyAddress.trim() || null,
        updated_by: profile.id,
      };

      const { error } = await supabase.from('shipments').update(payload).eq('id', shipment.id);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: shipment.branch_id,
        action: 'shipment.parties_updated',
        entity_type: 'shipment',
        entity_id: shipment.id,
        description: `Updated cargo parties for shipment ${shipment.reference_number ?? ''}`,
      });

      toast.success('Cargo parties updated');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save cargo parties'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cargo Parties</DialogTitle>
          <DialogDescription>
            The shipper, consignee, and notify party as they should appear on the bill of lading —
            not necessarily the same as the billed customer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="sp-shipper-name">Shipper</Label>
            <Input id="sp-shipper-name" value={shipperName} onChange={(e) => setShipperName(e.target.value)} />
            <Textarea
              rows={2}
              placeholder="Address"
              value={shipperAddress}
              onChange={(e) => setShipperAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-consignee-name">Consignee</Label>
            <Input
              id="sp-consignee-name"
              value={consigneeName}
              onChange={(e) => setConsigneeName(e.target.value)}
            />
            <Textarea
              rows={2}
              placeholder="Address"
              value={consigneeAddress}
              onChange={(e) => setConsigneeAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-notify-name">Notify Party</Label>
            <Input
              id="sp-notify-name"
              value={notifyPartyName}
              onChange={(e) => setNotifyPartyName(e.target.value)}
            />
            <Textarea
              rows={2}
              placeholder="Address"
              value={notifyPartyAddress}
              onChange={(e) => setNotifyPartyAddress(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
