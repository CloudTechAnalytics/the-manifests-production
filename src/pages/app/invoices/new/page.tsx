'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Receipt, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useBranchSelector } from '@/hooks/use-branch-selector';
import { BranchSelectField } from '@/components/shared/branch-select-field';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { formatCurrency } from '@/lib/utils/status';
import type { Customer, Quotation, Shipment } from '@/types';

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

const invoiceSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  shipment_id: z.string().optional().or(z.literal('')),
  quotation_id: z.string().optional().or(z.literal('')),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional().or(z.literal('')),
  currency: z.string().min(1, 'Currency is required'),
  subtotal: z.coerce.number().min(0, 'Subtotal must be ≥ 0'),
  tax_amount: z.coerce.number().min(0, 'Tax must be ≥ 0'),
  notes: z.string().optional().or(z.literal('')),
  terms: z.string().optional().or(z.literal('')),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function NewInvoicePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  const isAdmin = profile?.role === 'admin';
  const myBranchId = profile?.branch_id ?? null;
  const [branchError, setBranchError] = useState('');
  const {
    needsSelection: needsBranchSelection,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    branchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customer_id: '',
      shipment_id: '',
      quotation_id: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'NGN',
      subtotal: 0,
      tax_amount: 0,
      notes: '',
      terms: 'Payment due within 14 days of invoice date.',
    },
  });

  const selectedCustomerId = watch('customer_id');
  const subtotal = watch('subtotal');
  const taxAmount = watch('tax_amount');
  const currency = watch('currency');
  const total = (Number(subtotal) || 0) + (Number(taxAmount) || 0);

  // Load customers
  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('customers')
      .select('*')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('company_name', { ascending: true });
    if (!isAdmin && myBranchId) query = query.eq('branch_id', myBranchId);
    query.then(({ data, error }) => {
      if (error) return console.error('Error loading customers:', error);
      setCustomers((data as Customer[]) ?? []);
    });
  }, [profile, isAdmin, myBranchId]);

  // Load shipments + approved quotations for the selected customer
  const loadForCustomer = useCallback(async () => {
    if (!selectedCustomerId) {
      setShipments([]);
      setQuotations([]);
      return;
    }
    let shipQuery = supabase
      .from('shipments')
      .select('*')
      .eq('customer_id', selectedCustomerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    let quotQuery = supabase
      .from('quotations')
      .select('*')
      .eq('customer_id', selectedCustomerId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (!isAdmin && myBranchId) {
      shipQuery = shipQuery.eq('branch_id', myBranchId);
      quotQuery = quotQuery.eq('branch_id', myBranchId);
    }
    const [shipRes, quotRes] = await Promise.all([shipQuery, quotQuery]);
    setShipments((shipRes.data as Shipment[]) ?? []);
    setQuotations((quotRes.data as Quotation[]) ?? []);
  }, [selectedCustomerId, isAdmin, myBranchId]);

  useEffect(() => {
    loadForCustomer();
  }, [loadForCustomer]);

  const handleQuotationSelect = (quotationId: string) => {
    setValue('quotation_id', quotationId);
    const q = quotations.find((x) => x.id === quotationId);
    if (q) {
      setValue('subtotal', Number(q.subtotal));
      setValue('tax_amount', Number(q.tax_amount));
      setValue('currency', q.currency);
    }
  };

  const onSubmit = async (values: InvoiceFormValues) => {
    if (!profile?.id) return;
    if (!branchId) {
      setBranchError('Please select a branch');
      return;
    }
    setBranchError('');
    setSubmitting(true);
    try {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          customer_id: values.customer_id,
          shipment_id: values.shipment_id || null,
          quotation_id: values.quotation_id || null,
          branch_id: branchId,
          status: 'sent',
          issue_date: values.issue_date,
          due_date: values.due_date || null,
          subtotal: values.subtotal,
          tax_amount: values.tax_amount,
          total,
          currency: values.currency,
          notes: values.notes || null,
          terms: values.terms || null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, invoice_number')
        .single();

      if (invoiceError || !invoiceData) {
        throw new Error(invoiceError?.message ?? 'Failed to create invoice');
      }

      const customer = customers.find((c) => c.id === values.customer_id);
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'invoice.created',
        entity_type: 'invoice',
        entity_id: invoiceData.id,
        description: `Created invoice ${invoiceData.invoice_number ?? ''} for "${customer?.company_name ?? 'Unknown customer'}"`,
        metadata: {
          customer_id: values.customer_id,
          total,
          currency: values.currency,
        },
      });

      toast.success('Invoice created successfully');
      router.push(`/invoices/${invoiceData.id}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create invoice');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/invoices">Invoices</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Invoice</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href="/invoices">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Receipt className="h-6 w-6 text-blue-600" />
            New Invoice
          </h1>
          <p className="text-sm text-muted-foreground">
            Bill a customer, optionally against a shipment or quotation.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {needsBranchSelection && (
          <BranchSelectField
            branches={branches}
            value={selectedBranchId}
            onChange={setSelectedBranchId}
            loading={branchesLoading}
            error={branchError}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Receipt className="h-4 w-4 text-blue-600" />
              Invoice Details
            </CardTitle>
            <CardDescription>Who this invoice is for and what it references.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customer_id">
                  Customer <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="customer_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="customer_id">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.customer_id && (
                  <p className="text-xs text-destructive">{errors.customer_id.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment_id">Shipment (optional)</Label>
                <Controller
                  control={control}
                  name="shipment_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={!selectedCustomerId}>
                      <SelectTrigger id="shipment_id">
                        <SelectValue placeholder={selectedCustomerId ? 'Select shipment' : 'Select a customer first'} />
                      </SelectTrigger>
                      <SelectContent>
                        {shipments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.reference_number ?? s.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="quotation_id">
                  Approved Quotation (optional — auto-fills amounts)
                </Label>
                <Controller
                  control={control}
                  name="quotation_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={handleQuotationSelect}
                      disabled={!selectedCustomerId}
                    >
                      <SelectTrigger id="quotation_id">
                        <SelectValue
                          placeholder={selectedCustomerId ? 'Select approved quotation' : 'Select a customer first'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {quotations.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.quotation_number ?? q.id.slice(0, 8)} — {formatCurrency(q.total, q.currency)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedCustomerId && quotations.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No approved quotations for this customer.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="issue_date">
                  Issue Date <span className="text-destructive">*</span>
                </Label>
                <Input id="issue_date" type="date" {...control.register('issue_date')} />
                {errors.issue_date && (
                  <p className="text-xs text-destructive">{errors.issue_date.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due_date">Due Date</Label>
                <Input id="due_date" type="date" {...control.register('due_date')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} placeholder="Internal notes…" {...control.register('notes')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms</Label>
              <Textarea id="terms" rows={2} placeholder="Payment terms…" {...control.register('terms')} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Amount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <div className="space-y-1.5">
                <Label htmlFor="subtotal">Subtotal</Label>
                <Input
                  id="subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  {...control.register('subtotal', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
                />
                {errors.subtotal && (
                  <p className="text-xs text-destructive">{errors.subtotal.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax_amount">Tax</Label>
                <Input
                  id="tax_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  {...control.register('tax_amount', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
                />
                {errors.tax_amount && (
                  <p className="text-xs text-destructive">{errors.tax_amount.message}</p>
                )}
              </div>
            </div>
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-primary">{formatCurrency(total, currency)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href="/invoices" className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create Invoice
          </Button>
        </div>
      </form>
    </div>
  );
}
