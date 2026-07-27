'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn, getErrorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/status';
import type { Customer, Quotation, ShipmentType } from '@/types';

// --- Validation schema ----------------------------------------------------

const lineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().min(0, 'Quantity must be ≥ 0'),
  unit_price: z.coerce.number().min(0, 'Unit price must be ≥ 0'),
  tax_rate: z.coerce.number().min(0, 'Tax rate must be ≥ 0').max(100, 'Tax rate must be ≤ 100'),
});

const quotationSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  shipment_type: z.enum(['air', 'sea', 'road', 'rail', 'multimodal']),
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  valid_until: z.date({
    required_error: 'Valid until date is required',
    invalid_type_error: 'Please select a date',
  }),
  currency: z.string().min(1, 'Currency is required'),
  notes: z.string().optional().or(z.literal('')),
  terms: z.string().optional().or(z.literal('')),
  items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
});

type QuotationFormValues = z.infer<typeof quotationSchema>;

// --- Helpers ---------------------------------------------------------------

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

const SHIPMENT_TYPES: { value: ShipmentType; label: string }[] = [
  { value: 'air', label: 'Air' },
  { value: 'sea', label: 'Sea' },
  { value: 'road', label: 'Road' },
  { value: 'rail', label: 'Rail' },
  { value: 'multimodal', label: 'Multimodal' },
];

function computeLineTotal(quantity: number, unitPrice: number, taxRate: number): number {
  return quantity * unitPrice * (1 + taxRate / 100);
}

// --- Page ------------------------------------------------------------------

export default function EditQuotationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const quotationId = params.id;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [existingItemIds, setExistingItemIds] = useState<string[]>([]);
  const [quotationBranchId, setQuotationBranchId] = useState<string | null>(null);
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      customer_id: '',
      shipment_type: 'air',
      origin: '',
      destination: '',
      currency: 'NGN',
      notes: '',
      terms: '',
      items: [],
    },
  });

  const {
    fields: itemFields,
    append: appendItem,
    remove: removeItem,
  } = useFieldArray({ control, name: 'items' });

  // Load customers in the user's branch (admins see all)
  const loadCustomers = useCallback(async () => {
    if (!profile) return;
    setLoadingCustomers(true);
    try {
      let query = supabase
        .from('customers')
        .select('*, branch:branches(*)')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('company_name', { ascending: true });

      if (!isAdmin && userBranchId) {
        query = query.eq('branch_id', userBranchId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading customers:', error);
        setCustomers([]);
        return;
      }
      setCustomers((data as Customer[]) ?? []);
    } finally {
      setLoadingCustomers(false);
    }
  }, [profile, isAdmin, userBranchId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Load existing quotation + items
  useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('quotations')
          .select('*, items:quotation_items(*)')
          .eq('id', quotationId)
          .is('deleted_at', null)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          setNotFound(true);
          return;
        }

        const quotation = data as Quotation;
        const items = (quotation.items ?? [])
          .filter((i) => !i.deleted_at)
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

        setExistingItemIds(items.map((i) => i.id));
        setQuotationBranchId(quotation.branch_id);
        setQuotationNumber(quotation.quotation_number);

        reset({
          customer_id: quotation.customer_id,
          shipment_type: quotation.shipment_type ?? 'air',
          origin: quotation.origin ?? '',
          destination: quotation.destination ?? '',
          valid_until: quotation.valid_until
            ? new Date(quotation.valid_until)
            : undefined,
          currency: quotation.currency,
          notes: quotation.notes ?? '',
          terms: quotation.terms ?? '',
          items:
            items.length > 0
              ? items.map((i) => ({
                  id: i.id,
                  description: i.description,
                  quantity: Number(i.quantity),
                  unit_price: Number(i.unit_price),
                  tax_rate: Number(i.tax_rate),
                }))
              : [{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }],
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quotationId, reset]);

  // Watch all items for live calculation
  const items = watch('items');
  const currency = watch('currency');

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    let total = 0;

    for (const item of items ?? []) {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const taxRate = Number(item.tax_rate) || 0;

      const lineSubtotal = qty * unitPrice;
      const lineTax = lineSubtotal * (taxRate / 100);
      const lineTotal = lineSubtotal + lineTax;

      subtotal += lineSubtotal;
      taxAmount += lineTax;
      total += lineTotal;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [items]);

  const addItem = () =>
    appendItem({
      description: '',
      quantity: 1,
      unit_price: 0,
      tax_rate: 0,
    });

  const onSubmit = async (values: QuotationFormValues) => {
    if (!profile?.id || !quotationBranchId) {
      toast.error('Unable to determine quotation branch.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update the quotation
      const { error: quotationError } = await supabase
        .from('quotations')
        .update({
          customer_id: values.customer_id,
          shipment_type: values.shipment_type,
          origin: values.origin || null,
          destination: values.destination || null,
          valid_until: values.valid_until.toISOString(),
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          total: totals.total,
          currency: values.currency,
          notes: values.notes || null,
          terms: values.terms || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotationId);

      if (quotationError) throw quotationError;

      // 2. Sync line items: soft-delete removed, update existing, insert new
      const submittedIds = values.items
        .map((i) => i.id)
        .filter((id): id is string => Boolean(id));
      const removedIds = existingItemIds.filter(
        (id) => !submittedIds.includes(id)
      );

      if (removedIds.length > 0) {
        const { error: delErr } = await supabase
          .from('quotation_items')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', removedIds);
        if (delErr) console.error('Item delete error:', delErr);
      }

      for (const item of values.items) {
        const qty = Number(item.quantity);
        const unitPrice = Number(item.unit_price);
        const taxRate = Number(item.tax_rate);
        const lineTotal = computeLineTotal(qty, unitPrice, taxRate);

        const payload = {
          quotation_id: quotationId,
          description: item.description,
          quantity: qty,
          unit_price: unitPrice,
          tax_rate: taxRate,
          total: Math.round(lineTotal * 100) / 100,
        };

        if (item.id) {
          const { error: upErr } = await supabase
            .from('quotation_items')
            .update(payload)
            .eq('id', item.id);
          if (upErr) console.error('Item update error:', upErr);
        } else {
          const { error: insErr } = await supabase
            .from('quotation_items')
            .insert(payload);
          if (insErr) console.error('Item insert error:', insErr);
        }
      }

      // 3. Log activity
      const customer = customers.find((c) => c.id === values.customer_id);
      const { error: activityError } = await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: quotationBranchId,
        action: 'quotation.updated',
        entity_type: 'quotation',
        entity_id: quotationId,
        description: `Updated quotation ${quotationNumber ?? ''} for "${customer?.company_name ?? 'Unknown customer'}"`,
        metadata: {
          customer_id: values.customer_id,
          customer_name: customer?.company_name,
          shipment_type: values.shipment_type,
          total: totals.total,
          currency: values.currency,
        },
      });

      if (activityError) {
        console.error('Activity log error:', activityError);
      }

      toast.success('Quotation updated successfully');
      router.push(`/quotations/${quotationId}`);
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update quotation');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Loading state ---------------------------------------------------------

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // --- Not found --------------------------------------------------------------

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Quotation not found</h2>
          <p className="text-sm text-muted-foreground">
            This quotation may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/quotations">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Quotations
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/quotations">Quotations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/quotations/${quotationId}`}>
                {quotationNumber ?? 'Quotation'}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/quotations/${quotationId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <FileText className="h-6 w-6 text-blue-600" />
            Edit Quotation
          </h1>
          <p className="text-sm text-muted-foreground">
            {quotationNumber
              ? `Update ${quotationNumber}.`
              : 'Update this quotation.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Quotation Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-4 w-4 text-blue-600" />
              Quotation Details
            </CardTitle>
            <CardDescription>
              Basic shipment and validity information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="customer_id">
                  Customer <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="customer_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="customer_id">
                        <SelectValue
                          placeholder={
                            loadingCustomers
                              ? 'Loading customers…'
                              : 'Select a customer'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.length === 0 && !loadingCustomers ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No active customers found.
                          </div>
                        ) : (
                          customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.company_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.customer_id && (
                  <p className="text-xs text-destructive">
                    {errors.customer_id.message}
                  </p>
                )}
              </div>

              {/* Shipment Type */}
              <div className="space-y-1.5">
                <Label htmlFor="shipment_type">Shipment Type</Label>
                <Controller
                  control={control}
                  name="shipment_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="shipment_type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIPMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="currency">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Origin */}
              <div className="space-y-1.5">
                <Label htmlFor="origin">
                  Origin <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="origin"
                  placeholder="Lagos, Nigeria"
                  {...register('origin')}
                />
                {errors.origin && (
                  <p className="text-xs text-destructive">
                    {errors.origin.message}
                  </p>
                )}
              </div>

              {/* Destination */}
              <div className="space-y-1.5">
                <Label htmlFor="destination">
                  Destination <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="destination"
                  placeholder="London, UK"
                  {...register('destination')}
                />
                {errors.destination && (
                  <p className="text-xs text-destructive">
                    {errors.destination.message}
                  </p>
                )}
              </div>

              {/* Valid Until */}
              <div className="space-y-1.5">
                <Label htmlFor="valid_until">
                  Valid Until <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="valid_until"
                  render={({ field }) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="valid_until"
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.valid_until && (
                  <p className="text-xs text-destructive">
                    {errors.valid_until.message}
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Internal notes about this quotation…"
                {...register('notes')}
              />
            </div>

            {/* Terms */}
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms &amp; Conditions</Label>
              <Textarea
                id="terms"
                rows={4}
                placeholder="Payment terms, delivery conditions, etc."
                {...register('terms')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">
                Line Items
              </CardTitle>
              <CardDescription>
                Add the services or charges included in this quotation.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              className="sm:shrink-0"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itemFields.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No items added yet. Click &quot;Add Item&quot; to get started.
              </p>
            ) : (
              itemFields.map((field, index) => {
                const item = items?.[index];
                const qty = Number(item?.quantity) || 0;
                const unitPrice = Number(item?.unit_price) || 0;
                const taxRate = Number(item?.tax_rate) || 0;
                const lineTotal = computeLineTotal(qty, unitPrice, taxRate);

                return (
                  <div key={field.id} className="space-y-3">
                    {index > 0 && <Separator />}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Item {index + 1}
                      </p>
                      {itemFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="space-y-1.5 lg:col-span-2">
                        <Label htmlFor={`items.${index}.description`}>
                          Description <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`items.${index}.description`}
                          placeholder="Freight forwarding service"
                          {...register(`items.${index}.description`)}
                        />
                        {errors.items?.[index]?.description && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.description?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`items.${index}.quantity`}>
                          Quantity
                        </Label>
                        <Input
                          id={`items.${index}.quantity`}
                          type="number"
                          step="any"
                          min="0"
                          {...register(`items.${index}.quantity`)}
                        />
                        {errors.items?.[index]?.quantity && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.quantity?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`items.${index}.unit_price`}>
                          Unit Price
                        </Label>
                        <Input
                          id={`items.${index}.unit_price`}
                          type="number"
                          step="any"
                          min="0"
                          {...register(`items.${index}.unit_price`)}
                        />
                        {errors.items?.[index]?.unit_price && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.unit_price?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`items.${index}.tax_rate`}>
                          Tax Rate (%)
                        </Label>
                        <Input
                          id={`items.${index}.tax_rate`}
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          {...register(`items.${index}.tax_rate`)}
                        />
                        {errors.items?.[index]?.tax_rate && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.tax_rate?.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">
                          Line Total:{' '}
                        </span>
                        <span className="text-sm font-semibold">
                          {formatCurrency(lineTotal, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {errors.items?.message && (
              <p className="text-xs text-destructive">
                {errors.items.message}
              </p>
            )}
            {typeof errors.items?.message === 'undefined' &&
              errors.items?.root?.message && (
                <p className="text-xs text-destructive">
                  {errors.items.root.message}
                </p>
              )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">
                {formatCurrency(totals.subtotal, currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium">
                {formatCurrency(totals.taxAmount, currency)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-primary">
                {formatCurrency(totals.total, currency)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href={`/quotations/${quotationId}`} className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
