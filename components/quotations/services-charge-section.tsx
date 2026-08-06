'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils/status';
import { QUOTATION_SERVICES } from '@/lib/quotation-constants';
import { computeLineTotal, computeQuotationTotals, type QuotationFormValues } from '@/lib/quotation-schema';

/**
 * Sections 4 (Services Required) + 5 (Charge Breakdown) — combined
 * because checking a service directly manipulates the charge table's
 * field array; keeping them apart would mean two components reaching
 * into the same piece of form state.
 */
export function ServicesChargeSection() {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const services = watch('services') ?? [];
  const items = watch('items') ?? [];
  const currency = watch('currency');

  const toggleService = (key: string, checked: boolean) => {
    if (checked) {
      setValue('services', [...services, key]);
      const def = QUOTATION_SERVICES.find((s) => s.key === key);
      append({
        service_key: key,
        description: def?.defaultDescription ?? def?.label ?? key,
        quantity: 1,
        unit_price: 0,
        discount_rate: 0,
        tax_rate: 0,
      });
    } else {
      setValue(
        'services',
        services.filter((s) => s !== key)
      );
      // Remove charge rows this service generated — walk backwards since
      // remove() shifts indices.
      for (let i = fields.length - 1; i >= 0; i--) {
        if (items[i]?.service_key === key) remove(i);
      }
    }
  };

  const addManualCharge = () =>
    append({
      service_key: null,
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_rate: 0,
      tax_rate: 0,
    });

  const totals = computeQuotationTotals(items);

  return (
    <>
      {/* Section 4: Services Required */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Services Required</CardTitle>
          <CardDescription>
            Selecting a service adds a matching row to the charge breakdown below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {QUOTATION_SERVICES.map((service) => (
              <label
                key={service.key}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={services.includes(service.key)}
                  onCheckedChange={(checked) => toggleService(service.key, checked === true)}
                />
                {service.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Charge Breakdown */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Charge Breakdown</CardTitle>
            <CardDescription>Pricing for every service and charge on this quotation.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addManualCharge}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Charge
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No charges yet — select a service above or add one manually.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Service</TableHead>
                    <TableHead className="w-20 text-right">Qty</TableHead>
                    <TableHead className="w-28 text-right">Unit Price</TableHead>
                    <TableHead className="w-24 text-right">Tax %</TableHead>
                    <TableHead className="w-24 text-right">Discount %</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const row = items[index];
                    const lineTotal = row ? computeLineTotal(row) : 0;
                    return (
                      <TableRow key={field.id}>
                        <TableCell>
                          <Input
                            {...register(`items.${index}.description`)}
                            placeholder="Charge description"
                          />
                          {errors.items?.[index]?.description && (
                            <p className="mt-1 text-xs text-destructive">
                              {errors.items[index]?.description?.message}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="text-right"
                            {...register(`items.${index}.quantity`)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="text-right"
                            {...register(`items.${index}.unit_price`)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            className="text-right"
                            {...register(`items.${index}.tax_rate`)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            className="text-right"
                            {...register(`items.${index}.discount_rate`)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(lineTotal, currency)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {errors.items?.message && (
            <p className="text-xs text-destructive">{errors.items.message}</p>
          )}
          {typeof errors.items?.message === 'undefined' && errors.items?.root?.message && (
            <p className="text-xs text-destructive">{errors.items.root.message}</p>
          )}

          <Separator />

          <div className="ml-auto w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(totals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-amber-700">
                -{formatCurrency(totals.discountAmount, currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">VAT</span>
              <span className="font-medium">{formatCurrency(totals.taxAmount, currency)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="text-primary">{formatCurrency(totals.total, currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
