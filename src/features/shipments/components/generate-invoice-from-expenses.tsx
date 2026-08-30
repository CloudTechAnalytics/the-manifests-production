'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Receipt, ArrowRight } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { formatCurrency, EXPENSE_CATEGORY_META } from '@/shared/lib/utils/status';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { Expense, ExpenseCategory } from '@/shared/types';

/**
 * The workflow a CEO described directly: for a lot of jobs the forwarder
 * fronts the money and only knows the real cost once the shipment is
 * done — the quotation-first flow doesn't fit that. The data model
 * already allowed a shipment with no quotation and an invoice created
 * straight off it (both are optional FKs); what was missing was turning
 * the expenses already logged against this shipment into that invoice
 * without retyping every line by hand.
 *
 * Only counts *approved* expenses — a pending or rejected one isn't a
 * confirmed cost yet, and billing the client off an unapproved number
 * would be billing them for something that might not even be real.
 */
export function GenerateInvoiceFromExpenses({
  shipmentId,
  branchId,
  customerId,
}: {
  shipmentId: string;
  branchId: string;
  customerId: string;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [markupPercent, setMarkupPercent] = useState('15');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('shipment_id', shipmentId)
        .eq('status', 'approved')
        .is('deleted_at', null);
      if (error) {
        console.error('Failed to load expenses:', error.message);
      }
      setExpenses((data as Expense[]) ?? []);
      setLoading(false);
    })();
  }, [shipmentId]);

  if (loading) return <Skeleton className="h-48 w-full" />;

  const currency = expenses[0]?.currency || 'NGN';
  const costTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const markup = Number(markupPercent) || 0;
  const total = costTotal * (1 + markup / 100);

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {});

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      const breakdown = Object.entries(byCategory)
        .map(([cat, amt]) => `${EXPENSE_CATEGORY_META[cat as ExpenseCategory]?.label ?? cat}: ${formatCurrency(amt, currency)}`)
        .join('\n');
      const notes = `Generated from ${expenses.length} approved shipment expense${expenses.length === 1 ? '' : 's'} (${formatCurrency(costTotal, currency)}) + ${markup}% margin.\n\n${breakdown}`;

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          customer_id: customerId,
          shipment_id: shipmentId,
          quotation_id: null,
          branch_id: branchId,
          status: 'draft',
          subtotal: total,
          tax_amount: 0,
          total,
          currency,
          notes,
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'invoice.generated_from_expenses',
        entity_type: 'invoices',
        entity_id: invoice.id,
        description: `Generated invoice from ${expenses.length} shipment expense(s)`,
      });

      toast.success('Invoice generated — review before sending');
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to generate invoice'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Receipt className="h-4 w-4 text-primary" />
          Generate Invoice from Expenses
        </CardTitle>
        <CardDescription>
          For jobs run on your own money first — roll up this shipment&apos;s actual approved costs into a
          ready-to-send invoice, no quotation needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expenses.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No approved expenses logged against this shipment yet.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {Object.entries(byCategory).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{EXPENSE_CATEGORY_META[cat as ExpenseCategory]?.label ?? cat}</span>
                  <span>{formatCurrency(amt, currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-medium">
                <span>Actual cost</span>
                <span>{formatCurrency(costTotal, currency)}</span>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="markup">Margin %</Label>
                <Input
                  id="markup"
                  type="number"
                  min="0"
                  step="1"
                  className="w-28"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                />
              </div>
              <div className="flex-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <p className="text-xs text-muted-foreground">Invoice total</p>
                <p className="text-lg font-bold">{formatCurrency(total, currency)}</p>
              </div>
            </div>

            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
              Generate Draft Invoice
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
