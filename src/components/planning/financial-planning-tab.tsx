'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PLAN_COST_CATEGORY_LABELS, formatCurrency } from '@/lib/utils/status';
import { EditFinancialsDialog } from '@/components/planning/edit-financials-dialog';
import type { PlanCostCategory, PlanCostEstimate, ShipmentPlan } from '@/types';

interface FinancialPlanningTabProps {
  shipmentId: string;
  branchId: string;
  plan: ShipmentPlan;
  onChanged: () => void;
}

const CATEGORIES = Object.keys(PLAN_COST_CATEGORY_LABELS) as PlanCostCategory[];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  );
}

/**
 * Financial Planning (§11) — replaces the old single-number Financials
 * tab with a granular per-category breakdown (plan_cost_estimates),
 * rolled up into Gross Cost / Profit / Margin against the plan's
 * Expected Revenue, plus a Quotation vs. Planned Cost comparison when
 * the plan has a linked quotation.
 */
export function FinancialPlanningTab({ shipmentId, branchId, plan, onChanged }: FinancialPlanningTabProps) {
  const { profile } = useAuth();
  const [estimates, setEstimates] = useState<Record<PlanCostCategory, PlanCostEstimate | undefined>>(
    {} as Record<PlanCostCategory, PlanCostEstimate | undefined>
  );
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<PlanCostCategory | null>(null);
  const [revenueEditOpen, setRevenueEditOpen] = useState(false);

  const currency = plan.goods_value_currency || 'NGN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plan_cost_estimates')
        .select('*')
        .eq('shipment_id', shipmentId);
      if (error) {
        console.error('Error loading cost estimates:', error);
        setEstimates({} as Record<PlanCostCategory, PlanCostEstimate | undefined>);
        return;
      }
      const byCategory: Record<PlanCostCategory, PlanCostEstimate | undefined> = {} as Record<
        PlanCostCategory,
        PlanCostEstimate | undefined
      >;
      ((data as PlanCostEstimate[]) ?? []).forEach((e) => {
        byCategory[e.category] = e;
      });
      setEstimates(byCategory);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (category: PlanCostCategory, amount: string) => {
    if (!profile?.id) return;
    const numeric = amount === '' ? 0 : Number(amount);
    if (Number.isNaN(numeric)) return;
    const existing = estimates[category];
    if (existing && existing.estimated_amount === numeric) return;

    setSavingCategory(category);
    try {
      const { error } = await supabase.from('plan_cost_estimates').upsert(
        {
          shipment_id: shipmentId,
          branch_id: branchId,
          category,
          estimated_amount: numeric,
          currency,
          created_by: existing ? existing.created_by : profile.id,
          updated_by: profile.id,
        },
        { onConflict: 'shipment_id,category' }
      );
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to save ${PLAN_COST_CATEGORY_LABELS[category]}`));
    } finally {
      setSavingCategory(null);
    }
  };

  const grossCost = CATEGORIES.reduce((sum, c) => sum + (estimates[c]?.estimated_amount ?? 0), 0);
  const revenue = plan.estimated_revenue;
  const profit = revenue !== null ? revenue - grossCost : null;
  const marginPercent = revenue !== null && revenue !== 0 && profit !== null ? (profit / revenue) * 100 : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-lg font-semibold">Cost Breakdown</CardTitle>
          <p className="text-xs text-muted-foreground">Estimated cost per category, saved as you type</p>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CATEGORIES.map((category) => (
                <div key={category} className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">{PLAN_COST_CATEGORY_LABELS[category]}</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={estimates[category]?.estimated_amount ?? ''}
                    disabled={savingCategory === category}
                    onBlur={(e) => handleSave(category, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-lg font-semibold">Financial Summary</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRevenueEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-0">
          <InfoRow label="Expected Gross Cost" value={formatCurrency(grossCost, currency)} />
          <InfoRow
            label="Expected Revenue"
            value={revenue !== null ? formatCurrency(revenue, currency) : null}
          />
          <InfoRow label="Expected Profit" value={profit !== null ? formatCurrency(profit, currency) : null} />
          <InfoRow label="Margin %" value={marginPercent !== null ? `${marginPercent.toFixed(1)}%` : null} />
          {plan.quotation && (
            <>
              <InfoRow
                label="Quotation Total"
                value={
                  <Link to={`/quotations/${plan.quotation.id}`} className="text-primary hover:underline">
                    {formatCurrency(plan.quotation.total, plan.quotation.currency)}
                  </Link>
                }
              />
              <InfoRow
                label="Quotation vs. Planned Cost"
                value={formatCurrency(plan.quotation.total - grossCost, plan.quotation.currency)}
              />
            </>
          )}
        </CardContent>
      </Card>

      <EditFinancialsDialog
        plan={plan}
        open={revenueEditOpen}
        onOpenChange={setRevenueEditOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
