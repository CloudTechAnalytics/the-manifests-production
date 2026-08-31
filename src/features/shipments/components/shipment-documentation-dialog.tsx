'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import {
  fetchDocumentName,
  updateShipmentDocumentation,
} from '@/features/shipments/services/shipments.service';
import { getErrorMessage } from '@/shared/lib/utils';
import { uploadDocumentFile } from '@/shared/lib/utils/document-upload';
import { useAuth } from '@/shared/contexts/auth-context';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Checkbox } from '@/shared/components/ui/checkbox';
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
import { BOOKING_STATUS_META } from '@/shared/lib/utils/status';
import type { BookingStatus, Shipment, ShipmentType } from '@/shared/types';

const MAX_BOOKING_DOC_SIZE_BYTES = 50 * 1024 * 1024;

const BOOKING_STATUS_OPTIONS = (Object.keys(BOOKING_STATUS_META) as BookingStatus[]).map((value) => ({
  value,
  label: BOOKING_STATUS_META[value].label,
}));

/**
 * Mode-conditional labels for the same underlying vessel/routing/AWB
 * columns — this app has no precedent for hiding fields per mode, but
 * relabeling generic columns is the lowest-risk way to cover Sea/Air/
 * Rail without inventing 6 near-duplicate columns. Road hides this
 * whole section (its primary movement IS the Transport Planning leg).
 */
export const VESSEL_LABELS: Partial<Record<ShipmentType, { vessel: string; voyage: string; carrier: string; pol: string; pod: string }>> = {
  sea: { vessel: 'Vessel Name', voyage: 'Voyage Number', carrier: 'Shipping Line', pol: 'Port of Loading', pod: 'Port of Discharge' },
  air: { vessel: 'Airline', voyage: 'Flight Number', carrier: 'Airline', pol: 'Departure Airport', pod: 'Arrival Airport' },
  rail: { vessel: 'Train Number', voyage: 'Train Number', carrier: 'Rail Operator', pol: 'Origin Station', pod: 'Destination Station' },
  multimodal: { vessel: 'Vessel Name', voyage: 'Voyage Number', carrier: 'Carrier', pol: 'Port of Loading', pod: 'Port of Discharge' },
};

interface ShipmentDocumentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: Shipment;
  onSaved: () => void;
}

export function ShipmentDocumentationDialog({
  open,
  onOpenChange,
  shipment,
  onSaved,
}: ShipmentDocumentationDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [incoterm, setIncoterm] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [commodity, setCommodity] = useState('');
  const [mblNumber, setMblNumber] = useState('');
  const [hblNumber, setHblNumber] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [voyageNumber, setVoyageNumber] = useState('');
  const [portOfLoading, setPortOfLoading] = useState('');
  const [portOfDischarge, setPortOfDischarge] = useState('');
  const [goodsValue, setGoodsValue] = useState('');
  const [goodsValueCurrency, setGoodsValueCurrency] = useState('NGN');
  const [actualWeight, setActualWeight] = useState('');
  const [volumetricWeight, setVolumetricWeight] = useState('');
  const [carrier, setCarrier] = useState('');
  const [estimatedDeparture, setEstimatedDeparture] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [transshipmentPort, setTransshipmentPort] = useState('');
  const [bookingReference, setBookingReference] = useState('');
  const [bookingRequested, setBookingRequested] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('pending');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingDocId, setBookingDocId] = useState<string | null>(null);
  const [bookingDocName, setBookingDocName] = useState<string | null>(null);
  const [uploadingBookingDoc, setUploadingBookingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setIncoterm(shipment.incoterm ?? '');
    setHsCode(shipment.hs_code ?? '');
    setCommodity(shipment.commodity ?? '');
    setMblNumber(shipment.mbl_number ?? '');
    setHblNumber(shipment.hbl_number ?? '');
    setAwbNumber(shipment.awb_number ?? '');
    setVesselName(shipment.vessel_name ?? '');
    setVoyageNumber(shipment.voyage_number ?? '');
    setPortOfLoading(shipment.port_of_loading ?? '');
    setPortOfDischarge(shipment.port_of_discharge ?? '');
    setGoodsValue(shipment.goods_value != null ? String(shipment.goods_value) : '');
    setGoodsValueCurrency(shipment.goods_value_currency || 'NGN');
    setActualWeight(shipment.actual_weight != null ? String(shipment.actual_weight) : '');
    setVolumetricWeight(shipment.volumetric_weight != null ? String(shipment.volumetric_weight) : '');
    setCarrier(shipment.carrier ?? '');
    setEstimatedDeparture(shipment.estimated_departure ?? '');
    setEstimatedArrival(shipment.estimated_arrival ?? '');
    setTransshipmentPort(shipment.transshipment_port ?? '');
    setBookingReference(shipment.booking_reference ?? '');
    setBookingRequested(shipment.booking_requested ?? false);
    setBookingStatus(shipment.booking_status ?? 'pending');
    setBookingDate(shipment.booking_date ?? '');
    setBookingDocId(shipment.booking_confirmation_document_id ?? null);
    setBookingDocName(null);
  }, [open, shipment]);

  const { data: fetchedBookingDocName } = useQuery({
    queryKey: ['shipment-document-name', bookingDocId],
    queryFn: () => fetchDocumentName(bookingDocId as string),
    enabled: open && !!bookingDocId,
  });

  useEffect(() => {
    if (fetchedBookingDocName !== undefined) setBookingDocName(fetchedBookingDocName);
  }, [fetchedBookingDocName]);

  // Chargeable weight is the greater of actual and volumetric — the
  // industry-standard rule for both air (volumetric = L*W*H/6000) and
  // ocean W/M freight, computed here rather than typed in separately.
  const chargeableWeight = useMemo(() => {
    const actual = Number(actualWeight) || 0;
    const volumetric = Number(volumetricWeight) || 0;
    if (!actual && !volumetric) return null;
    return Math.max(actual, volumetric);
  }, [actualWeight, volumetricWeight]);

  const isRoad = shipment.shipment_type === 'road';
  const vesselLabels = (shipment.shipment_type && VESSEL_LABELS[shipment.shipment_type]) || VESSEL_LABELS.sea!;

  const handleBookingDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    if (file.size > MAX_BOOKING_DOC_SIZE_BYTES) {
      toast.error('File is too large (max 50MB)');
      return;
    }
    setUploadingBookingDoc(true);
    try {
      const result = await uploadDocumentFile({
        file,
        branchId: shipment.branch_id,
        shipmentId: shipment.id,
        category: 'other',
        templateId: null,
        stageId: null,
        replacesDocumentId: null,
        createdBy: profile.id,
      });
      if (!result.success || !result.documentId) {
        throw new Error(result.error ?? 'Failed to upload booking confirmation');
      }
      setBookingDocId(result.documentId);
      setBookingDocName(file.name);
      toast.success('Booking confirmation uploaded');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload booking confirmation'));
    } finally {
      setUploadingBookingDoc(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!profile) throw new Error('Not ready');
      return updateShipmentDocumentation({
        shipmentId: shipment.id,
        branchId: shipment.branch_id,
        referenceNumber: shipment.reference_number,
        payload: {
          incoterm: incoterm.trim() || null,
          hs_code: hsCode.trim() || null,
          commodity: commodity.trim() || null,
          mbl_number: mblNumber.trim() || null,
          hbl_number: hblNumber.trim() || null,
          awb_number: awbNumber.trim() || null,
          vessel_name: vesselName.trim() || null,
          voyage_number: voyageNumber.trim() || null,
          port_of_loading: portOfLoading.trim() || null,
          port_of_discharge: portOfDischarge.trim() || null,
          goods_value: goodsValue ? Number(goodsValue) : null,
          goods_value_currency: goodsValueCurrency.trim() || 'NGN',
          actual_weight: actualWeight ? Number(actualWeight) : null,
          volumetric_weight: volumetricWeight ? Number(volumetricWeight) : null,
          chargeable_weight: chargeableWeight,
          carrier: carrier.trim() || null,
          estimated_departure: estimatedDeparture || null,
          estimated_arrival: estimatedArrival || null,
          transshipment_port: transshipmentPort.trim() || null,
          booking_reference: bookingReference.trim() || null,
          booking_requested: bookingRequested,
          booking_status: bookingStatus,
          booking_date: bookingDate || null,
          // booking_confirmed stays a denormalized "= booking_status ===
          // 'confirmed'" flag, kept in sync here — same precedent as
          // shipment_customs.duty_paid vs duty_status.
          booking_confirmed: bookingStatus === 'confirmed',
          booking_confirmation_document_id: bookingDocId,
        },
        updatedBy: profile.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment.id] });
      toast.success('Trade documentation updated');
      onOpenChange(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save trade documentation'));
    },
  });
  const submitting = saveMutation.isPending;

  const handleSubmit = () => {
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trade Documentation</DialogTitle>
          <DialogDescription>
            Bill of lading numbers, routing, and cargo detail for this shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sd-mbl">MBL Number</Label>
              <Input id="sd-mbl" value={mblNumber} onChange={(e) => setMblNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd-hbl">HBL Number</Label>
              <Input id="sd-hbl" value={hblNumber} onChange={(e) => setHblNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd-awb">AWB Number</Label>
              <Input id="sd-awb" value={awbNumber} onChange={(e) => setAwbNumber(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sd-incoterm">Incoterm</Label>
              <Input
                id="sd-incoterm"
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value)}
                placeholder="FOB, CIF, EXW…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd-hs">HS Code</Label>
              <Input id="sd-hs" value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd-commodity">Commodity</Label>
              <Input id="sd-commodity" value={commodity} onChange={(e) => setCommodity(e.target.value)} />
            </div>
          </div>

          {isRoad ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Road shipments move by truck — plan the movement in the Transport Planning card instead of
              vessel/flight details.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sd-vessel">{vesselLabels.vessel}</Label>
                  <Input id="sd-vessel" value={vesselName} onChange={(e) => setVesselName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sd-voyage">{vesselLabels.voyage}</Label>
                  <Input id="sd-voyage" value={voyageNumber} onChange={(e) => setVoyageNumber(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sd-carrier">{vesselLabels.carrier}</Label>
                  <Input id="sd-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sd-pol">{vesselLabels.pol}</Label>
                  <Input id="sd-pol" value={portOfLoading} onChange={(e) => setPortOfLoading(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sd-pod">{vesselLabels.pod}</Label>
                  <Input
                    id="sd-pod"
                    value={portOfDischarge}
                    onChange={(e) => setPortOfDischarge(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sd-transshipment">Transshipment Port (optional)</Label>
                  <Input
                    id="sd-transshipment"
                    value={transshipmentPort}
                    onChange={(e) => setTransshipmentPort(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sd-etd">Estimated Departure</Label>
              <Input
                id="sd-etd"
                type="date"
                value={estimatedDeparture}
                onChange={(e) => setEstimatedDeparture(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd-eta">Estimated Arrival</Label>
              <Input
                id="sd-eta"
                type="date"
                value={estimatedArrival}
                onChange={(e) => setEstimatedArrival(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Booking
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="sd-booking-ref">Booking Reference</Label>
              <Input
                id="sd-booking-ref"
                value={bookingReference}
                onChange={(e) => setBookingReference(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={bookingRequested}
                onCheckedChange={(c) => setBookingRequested(c === true)}
              />
              Booking requested
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sd-booking-status">Booking Status</Label>
                <Select value={bookingStatus} onValueChange={(v) => setBookingStatus(v as BookingStatus)}>
                  <SelectTrigger id="sd-booking-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sd-booking-date">Booking Date</Label>
                <Input
                  id="sd-booking-date"
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Booking Confirmation Document</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleBookingDocSelect}
                accept=".pdf,.jpg,.jpeg,.png"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={uploadingBookingDoc}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingBookingDoc ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {bookingDocId ? 'Replace Document' : 'Upload Document'}
              </Button>
              {bookingDocId && (
                <p className="truncate text-xs text-muted-foreground">{bookingDocName ?? 'Document on file'}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sd-goods-value">Goods Value</Label>
              <Input
                id="sd-goods-value"
                type="number"
                min="0"
                step="0.01"
                value={goodsValue}
                onChange={(e) => setGoodsValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd-currency">Currency</Label>
              <Input
                id="sd-currency"
                value={goodsValueCurrency}
                onChange={(e) => setGoodsValueCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chargeable Weight
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sd-actual-weight">Actual Weight (kg)</Label>
                <Input
                  id="sd-actual-weight"
                  type="number"
                  min="0"
                  step="0.001"
                  value={actualWeight}
                  onChange={(e) => setActualWeight(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sd-volumetric-weight">Volumetric Weight (kg)</Label>
                <Input
                  id="sd-volumetric-weight"
                  type="number"
                  min="0"
                  step="0.001"
                  value={volumetricWeight}
                  onChange={(e) => setVolumetricWeight(e.target.value)}
                  placeholder="L × W × H (cm) ÷ 6000 for air"
                />
              </div>
            </div>
            <p className="text-sm">
              Chargeable weight (greater of the two):{' '}
              <span className="font-semibold">
                {chargeableWeight != null ? `${chargeableWeight} kg` : '—'}
              </span>
            </p>
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
