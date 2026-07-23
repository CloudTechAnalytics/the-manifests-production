'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, Percent, ShieldAlert, Copy, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { PRIORITY_META, formatCurrency } from '@/lib/utils/status';
import type { ShipmentPlan } from '@/types';

interface PlanSummaryCardProps {
  plan: ShipmentPlan;
  onUpdated: () => void;
}

export function PlanSummaryCard({ plan, onUpdated }: PlanSummaryCardProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [duplicating, setDuplicating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const cost = Number(plan.estimated_cost ?? 0);
  const revenue = Number(plan.estimated_revenue ?? 0);
  const hasFinancials = plan.estimated_cost !== null || plan.estimated_revenue !== null;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;

  const isCancelled = plan.status === 'cancelled';
  const isConverted = !!plan.converted_shipment_id;

  const handleDuplicate = async () => {
    if (!profile?.id) return;
    setDuplicating(true);
    try {
      const { data, error } = await supabase
        .from('shipment_plans')
        .insert({
          customer_id: plan.customer_id,
          quotation_id: plan.quotation_id,
          branch_id: plan.branch_id,
          status: 'planned',
          priority: plan.priority,
          shipment_type: plan.shipment_type,
          origin: plan.origin,
          destination: plan.destination,
          incoterm: plan.incoterm,
          commodity: plan.commodity,
          goods_value: plan.goods_value,
          goods_value_currency: plan.goods_value_currency,
          insurance_required: plan.insurance_required,
          special_instructions: plan.special_instructions,
          total_packages: plan.total_packages,
          total_weight: plan.total_weight,
          total_volume: plan.total_volume,
          hs_code: plan.hs_code,
          cargo_description: plan.cargo_description,
          container_type: plan.container_type,
          container_quantity: plan.container_quantity,
          equipment_supplier: plan.equipment_supplier,
          carrier_line: plan.carrier_line,
          vessel_name: plan.vessel_name,
          voyage_number: plan.voyage_number,
          port_of_loading: plan.port_of_loading,
          port_of_discharge: plan.port_of_discharge,
          service_route: plan.service_route,
          pre_carriage_mode: plan.pre_carriage_mode,
          transport_carrier: plan.transport_carrier,
          truck_number: plan.truck_number,
          estimated_transport_time: plan.estimated_transport_time,
          estimated_cost: plan.estimated_cost,
          estimated_revenue: plan.estimated_revenue,
          risk_level: plan.risk_level,
          planned_by: profile.id,
          assigned_to: plan.assigned_to,
          notes: plan.notes,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, plan_number')
        .single();

      if (error || !data) throw new Error(error?.message ?? 'Failed to duplicate plan');

      toast.success(`Duplicated as ${data.plan_number}`);
      router.push(`/planning/${data.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to duplicate plan';
      toast.error(message);
    } finally {
      setDuplicating(false);
    }
  };

  const handleCancel = async () => {
    if (!profile?.id) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({ status: 'cancelled', updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (error) throw error;
      toast.success('Plan cancelled');
      setCancelOpen(false);
      onUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel plan';
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-lg font-semibold">Planning Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          {!hasFinancials ? (
            <p className="text-sm text-muted-foreground">No cost estimate recorded yet.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  Estimated Cost
                </span>
                <span className="font-medium">
                  {formatCurrency(cost, plan.goods_value_currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Percent className="h-3.5 w-3.5" />
                  Margin (Est.)
                </span>
                <span className="font-medium">{margin === null ? '—' : `${margin.toFixed(1)}%`}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Planned Profit
                </span>
                <span className={`font-medium ${profit < 0 ? 'text-destructive' : ''}`}>
                  {formatCurrency(profit, plan.goods_value_currency)}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
              Risk Level
            </span>
            {plan.risk_level ? (
              <Badge variant="secondary" className={`text-[11px] ${PRIORITY_META[plan.risk_level].color}`}>
                {PRIORITY_META[plan.risk_level].label}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-4 pb-4 pt-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={duplicating}
            onClick={handleDuplicate}
          >
            {duplicating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Duplicate Plan
          </Button>
          {!isCancelled && !isConverted && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Plan
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel plan?</DialogTitle>
            <DialogDescription>
              This marks &quot;{plan.plan_number}&quot; as cancelled. It stays visible for reference
              but can no longer be converted to a shipment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep Plan</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Cancel Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
