'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { PRIORITY_META } from '@/shared/lib/utils/status';
import type { ShipmentPlan, PriorityLevel } from '@/shared/types';

interface EditFinancialsDialogProps {
  plan: ShipmentPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditFinancialsDialog({ plan, open, onOpenChange, onSaved }: EditFinancialsDialogProps) {
  const { profile } = useAuth();
  const [cost, setCost] = useState('');
  const [revenue, setRevenue] = useState('');
  const [riskLevel, setRiskLevel] = useState<PriorityLevel | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCost(plan.estimated_cost === null ? '' : String(plan.estimated_cost));
    setRevenue(plan.estimated_revenue === null ? '' : String(plan.estimated_revenue));
    setRiskLevel(plan.risk_level ?? '');
  }, [open, plan]);

  const handleSave = async () => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({
          estimated_cost: cost === '' ? null : Number(cost),
          estimated_revenue: revenue === '' ? null : Number(revenue),
          risk_level: riskLevel || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.id);
      if (error) throw error;

      toast.success('Financials updated');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update financials');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Financials</DialogTitle>
          <DialogDescription>Cost estimate and risk assessment for this plan.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Estimated Cost</Label>
            <Input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Estimated Revenue</Label>
            <Input type="number" step="0.01" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Risk Level</Label>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as PriorityLevel)}>
              <SelectTrigger>
                <SelectValue placeholder="Not assessed" />
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
