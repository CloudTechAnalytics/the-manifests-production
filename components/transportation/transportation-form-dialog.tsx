'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { adminForceDelete } from '@/lib/utils/admin-delete';
import { useAuth } from '@/contexts/auth-context';
import { checkReleaseReadiness } from '@/lib/utils/release-readiness';
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
import type { ShipmentTransportation, TransportationStatus } from '@/types';

const STATUS_OPTIONS: { value: TransportationStatus; label: string }[] = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'loaded', label: 'Loaded' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed_delivery', label: 'Failed Delivery' },
];

interface TransportationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: ShipmentTransportation | null;
  onSaved: () => void;
}

export function TransportationFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: TransportationFormDialogProps) {
  const { profile, hasRole } = useAuth();
  const [truckNumber, setTruckNumber] = useState('');
  const [trailerNumber, setTrailerNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState<TransportationStatus>('assigned');
  const [notes, setNotes] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [transportCompany, setTransportCompany] = useState('');
  const [escortRequired, setEscortRequired] = useState(false);
  const [expectedPickupDate, setExpectedPickupDate] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [truckType, setTruckType] = useState('');
  const [route, setRoute] = useState('');
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState('');
  const [fuelEstimate, setFuelEstimate] = useState('');
  const [estimatedTransportCost, setEstimatedTransportCost] = useState('');
  const [deliveryContactName, setDeliveryContactName] = useState('');
  const [deliveryContactPhone, setDeliveryContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTruckNumber(existing?.truck_number ?? '');
    setTrailerNumber(existing?.trailer_number ?? '');
    setDriverName(existing?.driver_name ?? '');
    setDriverPhone(existing?.driver_phone ?? '');
    setPickupDate(existing?.pickup_date ?? '');
    setDepartureDate(existing?.departure_date ?? '');
    setArrivalDate(existing?.arrival_date ?? '');
    setDeliveryDate(existing?.delivery_date ?? '');
    setStatus(existing?.status ?? 'assigned');
    setNotes(existing?.notes ?? '');
    setPickupAddress(existing?.pickup_address ?? '');
    setDeliveryAddress(existing?.delivery_address ?? '');
    setTransportCompany(existing?.transport_company ?? '');
    setEscortRequired(existing?.escort_required ?? false);
    setExpectedPickupDate(existing?.expected_pickup_date ?? '');
    setExpectedDeliveryDate(existing?.expected_delivery_date ?? '');
    setTruckType(existing?.truck_type ?? '');
    setRoute(existing?.route ?? '');
    setEstimatedDistanceKm(existing?.estimated_distance_km != null ? String(existing.estimated_distance_km) : '');
    setFuelEstimate(existing?.fuel_estimate != null ? String(existing.fuel_estimate) : '');
    setEstimatedTransportCost(
      existing?.estimated_transport_cost != null ? String(existing.estimated_transport_cost) : ''
    );
    setDeliveryContactName(existing?.delivery_contact_name ?? '');
    setDeliveryContactPhone(existing?.delivery_contact_phone ?? '');
    setBlockers([]);
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    setBlockers([]);
    try {
      // Before a shipment moves past "assigned" — i.e. actually starts
      // moving — Customs release, duty payment, gate pass/exit note, and
      // a Bill of Lading must all be in place.
      if (status !== 'assigned') {
        const readiness = await checkReleaseReadiness(shipmentId);
        if (!readiness.ready) {
          setBlockers(readiness.blockers);
          setSubmitting(false);
          return;
        }
      }

      const payload = {
        truck_number: truckNumber.trim() || null,
        trailer_number: trailerNumber.trim() || null,
        driver_name: driverName.trim() || null,
        driver_phone: driverPhone.trim() || null,
        pickup_date: pickupDate || null,
        departure_date: departureDate || null,
        arrival_date: arrivalDate || null,
        delivery_date: deliveryDate || null,
        status,
        notes: notes.trim() || null,
        pickup_address: pickupAddress.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        transport_company: transportCompany.trim() || null,
        escort_required: escortRequired,
        expected_pickup_date: expectedPickupDate || null,
        expected_delivery_date: expectedDeliveryDate || null,
        truck_type: truckType.trim() || null,
        route: route.trim() || null,
        estimated_distance_km: estimatedDistanceKm ? Number(estimatedDistanceKm) : null,
        fuel_estimate: fuelEstimate ? Number(fuelEstimate) : null,
        estimated_transport_cost: estimatedTransportCost ? Number(estimatedTransportCost) : null,
        delivery_contact_name: deliveryContactName.trim() || null,
        delivery_contact_phone: deliveryContactPhone.trim() || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase
          .from('shipment_transportation')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'transportation.updated',
          entity_type: 'shipment_transportation',
          entity_id: existing.id,
          description: `Updated transportation leg (status: ${status})`,
          metadata: { shipment_id: shipmentId },
        });
        toast.success('Transportation leg updated');
      } else {
        const { data: created, error } = await supabase
          .from('shipment_transportation')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id })
          .select('id')
          .single();
        if (error) throw error;

        await supabase.from('activities').insert({
          user_id: profile.id,
          branch_id: branchId,
          action: 'transportation.created',
          entity_type: 'shipment_transportation',
          entity_id: created?.id,
          description: `Created transportation leg (status: ${status})`,
          metadata: { shipment_id: shipmentId },
        });
        toast.success('Transportation leg created');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save transportation leg'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const result = await adminForceDelete('shipment_transportation', existing.id);
      if (!result.success) throw new Error(result.error);
      toast.success('Transportation leg permanently deleted');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete transportation leg'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Transportation Leg' : 'New Transportation Leg'}</DialogTitle>
          <DialogDescription>Truck, driver, and delivery details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {blockers.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                <AlertTriangle className="h-4 w-4" />
                This shipment isn't ready to release yet
              </p>
              <ul className="ml-5 list-disc text-xs text-red-700">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-company">Transport Company</Label>
              <Input
                id="trf-company"
                value={transportCompany}
                onChange={(e) => setTransportCompany(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={escortRequired} onCheckedChange={(c) => setEscortRequired(c === true)} />
                Escort required?
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-pickup-address">Pickup Address</Label>
              <Textarea
                id="trf-pickup-address"
                rows={2}
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-delivery-address">Delivery Address</Label>
              <Textarea
                id="trf-delivery-address"
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-exp-pickup">Expected Pickup Date</Label>
              <Input
                id="trf-exp-pickup"
                type="date"
                value={expectedPickupDate}
                onChange={(e) => setExpectedPickupDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-exp-delivery">Expected Delivery Date</Label>
              <Input
                id="trf-exp-delivery"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="trf-truck">Truck</Label>
              <Input id="trf-truck" value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-trailer">Trailer</Label>
              <Input id="trf-trailer" value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-truck-type">Truck Type</Label>
              <Input
                id="trf-truck-type"
                value={truckType}
                onChange={(e) => setTruckType(e.target.value)}
                placeholder="Flatbed, Container, Tanker…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trf-route">Route</Label>
            <Input id="trf-route" value={route} onChange={(e) => setRoute(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="trf-distance">Estimated Distance (km)</Label>
              <Input
                id="trf-distance"
                type="number"
                min="0"
                step="0.1"
                value={estimatedDistanceKm}
                onChange={(e) => setEstimatedDistanceKm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-fuel">Fuel Estimate</Label>
              <Input
                id="trf-fuel"
                type="number"
                min="0"
                step="0.01"
                value={fuelEstimate}
                onChange={(e) => setFuelEstimate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-cost">Estimated Transport Cost</Label>
              <Input
                id="trf-cost"
                type="number"
                min="0"
                step="0.01"
                value={estimatedTransportCost}
                onChange={(e) => setEstimatedTransportCost(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-delivery-contact">Delivery Contact Name</Label>
              <Input
                id="trf-delivery-contact"
                value={deliveryContactName}
                onChange={(e) => setDeliveryContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-delivery-contact-phone">Delivery Contact Phone</Label>
              <Input
                id="trf-delivery-contact-phone"
                value={deliveryContactPhone}
                onChange={(e) => setDeliveryContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-driver">Driver</Label>
              <Input id="trf-driver" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-driver-phone">Driver Phone</Label>
              <Input
                id="trf-driver-phone"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trf-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TransportationStatus)}>
              <SelectTrigger id="trf-status">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-pickup">Pickup Date</Label>
              <Input id="trf-pickup" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-departure">Departure</Label>
              <Input
                id="trf-departure"
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trf-arrival">Arrival</Label>
              <Input id="trf-arrival" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trf-delivery">Delivery Date</Label>
              <Input
                id="trf-delivery"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trf-notes">Notes</Label>
            <Textarea id="trf-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Proof of delivery can be uploaded from this shipment's Documents tab.
            </p>
          </div>
        </div>
        <DialogFooter className={existing && hasRole('admin') ? 'sm:justify-between' : undefined}>
          {existing && hasRole('admin') && (
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
              {existing ? 'Save Changes' : 'Create Leg'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
