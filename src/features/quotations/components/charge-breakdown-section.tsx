'use client';

import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Separator } from '@/shared/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { formatCurrency } from '@/shared/lib/utils/status';
import { BILLING_BASIS_OPTIONS } from '@/shared/lib/quotation-constants';
import { computeLineTotal, computeQuotationTotals, type QuotationFormValues } from '@/shared/lib/quotation-schema';
import { cn } from '@/shared/lib/utils';

/**
 * Only one layout is ever mounted at a time — not a CSS-hidden dual
 * render — so @dnd-kit's sortable registry never sees two DOM nodes
 * claiming the same drag id. Defaults to the desktop table (most
 * quotations are built at a desk); flips once the real width is known.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    setIsDesktop(query.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

/**
 * Section 5 — Charge Breakdown. Six columns by default (Description,
 * Qty, Rate, VAT %, Discount %, Total) — everything else (Unit, Notes,
 * and the GL/billing fields) lives behind a per-row "More Details"
 * disclosure so the table never needs horizontal scrolling. A real
 * table at md+, a stacked card per charge below that.
 */
export function ChargeBreakdownSection() {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();

  const { fields, append, remove, move } = useFieldArray({ control, name: 'items' });
  const items = watch('items') ?? [];
  const currency = watch('currency');
  const isDesktop = useIsDesktop();

  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    move(oldIndex, newIndex);
  };

  const addManualCharge = () =>
    append({
      service_key: null,
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_rate: 0,
      tax_rate: 0,
      unit: '',
      notes: '',
      billing_basis: '',
      cost_centre: '',
      gl_account: '',
      internal_reference: '',
      tax_code: '',
    });

  const totals = computeQuotationTotals(items);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Charge Breakdown</CardTitle>
          <CardDescription>Description, Qty, Rate, VAT and Discount only — everything else is under More Details.</CardDescription>
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              {isDesktop ? (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[4%] p-2" />
                      <TableHead className="w-[30%] p-2">Description</TableHead>
                      <TableHead className="w-[8%] p-2 text-right">Qty</TableHead>
                      <TableHead className="w-[14%] p-2 text-right">Rate</TableHead>
                      <TableHead className="w-[8%] p-2 text-right">VAT %</TableHead>
                      <TableHead className="w-[8%] p-2 text-right">Disc %</TableHead>
                      <TableHead className="w-[14%] p-2 text-right">Total</TableHead>
                      <TableHead className="w-[7%] p-2" />
                      <TableHead className="w-[7%] p-2" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <ChargeTableRow
                        key={field.id}
                        id={field.id}
                        index={index}
                        row={items[index]}
                        currency={currency}
                        open={openRows.has(field.id)}
                        onToggleOpen={() => toggleOpen(field.id)}
                        onRemove={() => remove(index)}
                        register={register}
                        control={control}
                        errorMessage={errors.items?.[index]?.description?.message}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <ChargeCard
                      key={field.id}
                      id={field.id}
                      index={index}
                      row={items[index]}
                      currency={currency}
                      open={openRows.has(field.id)}
                      onToggleOpen={() => toggleOpen(field.id)}
                      onRemove={() => remove(index)}
                      register={register}
                      control={control}
                      errorMessage={errors.items?.[index]?.description?.message}
                    />
                  ))}
                </div>
              )}
            </SortableContext>
          </DndContext>
        )}

        {errors.items?.message && <p className="text-xs text-destructive">{errors.items.message}</p>}
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
            <span className="font-medium text-amber-700">-{formatCurrency(totals.discountAmount, currency)}</span>
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
  );
}

// --- Shared "More Details" field set ---------------------------------------

type RegisterFn = ReturnType<typeof useFormContext<QuotationFormValues>>['register'];
type ControlType = ReturnType<typeof useFormContext<QuotationFormValues>>['control'];

function MoreDetailsFields({ index, register, control }: { index: number; register: RegisterFn; control: ControlType }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1">
        <Label className="text-xs">Unit</Label>
        <Input className="h-8 text-sm" {...register(`items.${index}.unit`)} placeholder="e.g. CBM" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Billing Basis</Label>
        <Controller
          control={control}
          name={`items.${index}.billing_basis`}
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select basis" />
              </SelectTrigger>
              <SelectContent>
                {BILLING_BASIS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tax Code</Label>
        <Input className="h-8 text-sm" {...register(`items.${index}.tax_code`)} placeholder="e.g. VAT-STD" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Cost Centre</Label>
        <Input className="h-8 text-sm" {...register(`items.${index}.cost_centre`)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">GL Account</Label>
        <Input className="h-8 text-sm" {...register(`items.${index}.gl_account`)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Internal Reference</Label>
        <Input className="h-8 text-sm" {...register(`items.${index}.internal_reference`)} />
      </div>
      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
        <Label className="text-xs">Notes</Label>
        <Input className="h-8 text-sm" {...register(`items.${index}.notes`)} placeholder="Optional note" />
      </div>
    </div>
  );
}

// --- Desktop table row -------------------------------------------------------

interface RowProps {
  id: string;
  index: number;
  row: QuotationFormValues['items'][number] | undefined;
  currency: string;
  open: boolean;
  onToggleOpen: () => void;
  onRemove: () => void;
  register: RegisterFn;
  control: ControlType;
  errorMessage?: string;
}

function ChargeTableRow({ id, index, row, currency, open, onToggleOpen, onRemove, register, control, errorMessage }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const lineTotal = row ? computeLineTotal(row) : 0;

  const rateNotConfigured = row && Number(row.unit_price) === 0;

  return (
    <>
      <TableRow ref={setNodeRef} style={style} className="animate-in fade-in slide-in-from-top-1 duration-200">
        <TableCell className="cursor-grab p-2 align-middle text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </TableCell>
        <TableCell className="p-2">
          <Input className="h-8 text-sm" {...register(`items.${index}.description`)} placeholder="Charge description" />
          {errorMessage && <p className="mt-1 text-xs text-destructive">{errorMessage}</p>}
        </TableCell>
        <TableCell className="p-2">
          <Input type="number" step="any" min="0" className="h-8 text-right text-sm" {...register(`items.${index}.quantity`)} />
        </TableCell>
        <TableCell className="p-2">
          <Input type="number" step="any" min="0" className="h-8 text-right text-sm" {...register(`items.${index}.unit_price`)} />
          {rateNotConfigured && <p className="mt-0.5 truncate text-[10px] text-amber-600">Rate not configured</p>}
        </TableCell>
        <TableCell className="p-2">
          <Input type="number" step="any" min="0" max="100" className="h-8 text-right text-sm" {...register(`items.${index}.tax_rate`)} />
        </TableCell>
        <TableCell className="p-2">
          <Input type="number" step="any" min="0" max="100" className="h-8 text-right text-sm" {...register(`items.${index}.discount_rate`)} />
        </TableCell>
        <TableCell className="p-2 text-right text-sm font-medium">{formatCurrency(lineTotal, currency)}</TableCell>
        <TableCell className="p-2">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleOpen}>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </TableCell>
        <TableCell className="p-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={9} className="animate-in bg-muted/30 py-3 fade-in slide-in-from-top-1 duration-150">
            <MoreDetailsFields index={index} register={register} control={control} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// --- Mobile/tablet card -------------------------------------------------------

function ChargeCard({ id, index, row, currency, open, onToggleOpen, onRemove, register, control, errorMessage }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const lineTotal = row ? computeLineTotal(row) : 0;

  const rateNotConfigured = row && Number(row.unit_price) === 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="animate-in rounded-lg border border-border p-3 fade-in slide-in-from-top-1 duration-200"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </span>
        <Input {...register(`items.${index}.description`)} placeholder="Charge description" className="flex-1" />
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {errorMessage && <p className="mb-2 text-xs text-destructive">{errorMessage}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Qty</Label>
          <Input type="number" step="any" min="0" className="h-8 text-sm" {...register(`items.${index}.quantity`)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rate</Label>
          <Input type="number" step="any" min="0" className="h-8 text-sm" {...register(`items.${index}.unit_price`)} />
          {rateNotConfigured && <p className="truncate text-[10px] text-amber-600">Rate not configured</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">VAT %</Label>
          <Input type="number" step="any" min="0" max="100" className="h-8 text-sm" {...register(`items.${index}.tax_rate`)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Disc %</Label>
          <Input type="number" step="any" min="0" max="100" className="h-8 text-sm" {...register(`items.${index}.discount_rate`)} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button type="button" onClick={onToggleOpen} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          More Details
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        <span className="font-semibold">{formatCurrency(lineTotal, currency)}</span>
      </div>
      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <MoreDetailsFields index={index} register={register} control={control} />
        </div>
      )}
    </div>
  );
}
