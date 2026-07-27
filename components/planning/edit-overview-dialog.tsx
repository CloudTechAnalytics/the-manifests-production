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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRIORITY_META } from '@/lib/utils/status';
import type { ShipmentPlan, ShipmentType, PriorityLevel, Profile } from '@/types';

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

interface EditOverviewDialogProps {
  plan: ShipmentPlan;
  staff: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditOverviewDialog({ plan, staff, open, onOpenChange, onSaved }: EditOverviewDialogProps) {
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [shipmentType, setShipmentType] = useState<ShipmentType | ''>('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [incoterm, setIncoterm] = useState('');
  const [commodity, setCommodity] = useState('');
  const [goodsValue, setGoodsValue] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [totalPackages, setTotalPackages] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [totalVolume, setTotalVolume] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  useEffect(() => {
    if (!open) return;
    setPriority(plan.priority);
    setShipmentType(plan.shipment_type ?? '');
    setOrigin(plan.origin ?? '');
    setDestination(plan.destination ?? '');
    setIncoterm(plan.incoterm ?? '');
    setCommodity(plan.commodity ?? '');
    setGoodsValue(plan.goods_value === null ? '' : String(plan.goods_value));
    setCurrency(plan.goods_value_currency);
    setInsuranceRequired(plan.insurance_required);
    setTotalPackages(plan.total_packages === null ? '' : String(plan.total_packages));
    setTotalWeight(plan.total_weight === null ? '' : String(plan.total_weight));
    setTotalVolume(plan.total_volume === null ? '' : String(plan.total_volume));
    setHsCode(plan.hs_code ?? '');
    setCargoDescription(plan.cargo_description ?? '');
    setSpecialInstructions(plan.special_instructions ?? '');
    setAssignedTo(plan.assigned_to ?? '');
  }, [open, plan]);

  const handleSave = async () => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({
          priority,
          shipment_type: shipmentType || null,
          origin: origin || null,
          destination: destination || null,
          incoterm: incoterm || null,
          commodity: commodity || null,
          goods_value: goodsValue === '' ? null : Number(goodsValue),
          goods_value_currency: currency,
          insurance_required: insuranceRequired,
          total_packages: totalPackages === '' ? null : Number(totalPackages),
          total_weight: totalWeight === '' ? null : Number(totalWeight),
          total_volume: totalVolume === '' ? null : Number(totalVolume),
          hs_code: hsCode || null,
          cargo_description: cargoDescription || null,
          special_instructions: specialInstructions || null,
          assigned_to: assignedTo || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.id);
      if (error) throw error;

      toast.success('Overview updated');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update overview');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Overview</DialogTitle>
          <DialogDescription>Route, cargo, and value details for this plan.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as PriorityLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_META) as PriorityLevel[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={shipmentType} onValueChange={(v) => setShipmentType(v as ShipmentType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="air">Air Freight</SelectItem>
                <SelectItem value="sea">Sea Freight</SelectItem>
                <SelectItem value="road">Road Freight</SelectItem>
                <SelectItem value="rail">Rail Freight</SelectItem>
                <SelectItem value="multimodal">Multimodal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Origin</Label>
            <Input value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Incoterm</Label>
            <Input value={incoterm} onChange={(e) => setIncoterm(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Commodity</Label>
            <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Goods Value</Label>
            <div className="flex gap-2">
              <Input type="number" step="0.01" min="0" value={goodsValue} onChange={(e) => setGoodsValue(e.target.value)} />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-24 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-end space-x-2 pb-2">
            <Checkbox
              checked={insuranceRequired}
              onCheckedChange={(c) => setInsuranceRequired(c === true)}
              id="insurance-edit"
            />
            <Label htmlFor="insurance-edit" className="font-normal">Insurance required</Label>
          </div>

          <div className="space-y-1.5">
            <Label>Total Packages</Label>
            <Input type="number" min="0" value={totalPackages} onChange={(e) => setTotalPackages(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Total Weight (kg)</Label>
            <Input type="number" step="0.01" min="0" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Total Volume (CBM)</Label>
            <Input type="number" step="0.01" min="0" value={totalVolume} onChange={(e) => setTotalVolume(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>HS Code</Label>
            <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cargo Description</Label>
            <Textarea rows={2} value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Special Instructions</Label>
            <Textarea rows={2} value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
