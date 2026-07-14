'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Wallet, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { PAYMENT_METHOD_META, formatCurrency } from '@/lib/utils/status';
import type { Customer, Invoice, PaymentMethod } from '@/types';

const paymentSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_method: z.enum(['bank_transfer', 'cheque', 'cash', 'card', 'other']),
  reference: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function NewPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const preselectInvoiceId = searchParams.get('invoice_id');

  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState<Invoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const isAdmin = profile?.role === 'admin';
  const branchId = profile?.branch_id ?? null;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      customer_id: '',
      amount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'bank_transfer',
      reference: '',
      notes: '',
    },
  });

  const selectedCustomerId = watch('customer_id');
  const amount = Number(watch('amount')) || 0;

  // Load customers
  useEffect(() => {
    if (!profile) return;
    let query = supabase
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .order('company_name', { ascending: true });
    if (!isAdmin && branchId) query = query.eq('branch_id', branchId);
    query.then(({ data, error }) => {
      if (error) return console.error('Error loading customers:', error);
      setCustomers((data as Customer[]) ?? []);
    });
  }, [profile, isAdmin, branchId]);

  // If arriving from an invoice's "Record Payment" link, preselect that
  // invoice's customer.
  useEffect(() => {
    if (!preselectInvoiceId) return;
    supabase
      .from('invoices')
      .select('customer_id')
      .eq('id', preselectInvoiceId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.customer_id) setValue('customer_id', data.customer_id);
      });
  }, [preselectInvoiceId, setValue]);

  const loadOutstandingInvoices = useCallback(async () => {
    if (!selectedCustomerId) {
      setOutstandingInvoices([]);
      return;
    }
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', selectedCustomerId)
      .in('status', ['sent', 'partial'])
      .is('deleted_at', null)
      .order('due_date', { ascending: true });
    if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) {
      console.error('Error loading outstanding invoices:', error);
      setOutstandingInvoices([]);
      return;
    }
    const invoices = (data as Invoice[]) ?? [];
    setOutstandingInvoices(invoices);

    // Preselect the invoice we arrived from, defaulted to its full outstanding amount
    if (preselectInvoiceId) {
      const target = invoices.find((i) => i.id === preselectInvoiceId);
      if (target) {
        const outstanding = Number(target.total) - Number(target.amount_paid);
        setAllocations({ [target.id]: outstanding });
        setValue('amount', outstanding);
      }
    }
  }, [selectedCustomerId, isAdmin, branchId, preselectInvoiceId, setValue]);

  useEffect(() => {
    loadOutstandingInvoices();
    setAllocations({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations]
  );
  const unallocated = amount - totalAllocated;

  const toggleInvoice = (invoice: Invoice, checked: boolean) => {
    setAllocations((prev) => {
      const next = { ...prev };
      if (checked) {
        const outstanding = Number(invoice.total) - Number(invoice.amount_paid);
        const remainingPayment = Math.max(amount - totalAllocated, 0);
        next[invoice.id] = Math.min(outstanding, remainingPayment || outstanding);
      } else {
        delete next[invoice.id];
      }
      return next;
    });
  };

  const updateAllocationAmount = (invoiceId: string, value: number) => {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const onSubmit = async (values: PaymentFormValues) => {
    if (!profile?.branch_id || !profile.id) {
      toast.error('Your account is not assigned to a branch.');
      return;
    }
    if (totalAllocated > values.amount + 0.01) {
      toast.error('Allocated amount cannot exceed the payment amount.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id: values.customer_id,
          branch_id: profile.branch_id,
          payment_date: values.payment_date,
          payment_method: values.payment_method,
          amount: values.amount,
          reference: values.reference || null,
          notes: values.notes || null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id, payment_number')
        .single();

      if (paymentError || !paymentData) {
        throw new Error(paymentError?.message ?? 'Failed to record payment');
      }

      const allocationEntries = Object.entries(allocations).filter(([, amt]) => amt > 0);
      if (allocationEntries.length > 0) {
        const { error: allocError } = await supabase.from('payment_allocations').insert(
          allocationEntries.map(([invoiceId, amt]) => ({
            payment_id: paymentData.id,
            invoice_id: invoiceId,
            amount: amt,
            created_by: profile.id,
          }))
        );
        if (allocError) {
          console.error('Allocation insert error:', allocError);
          toast.warning('Payment recorded, but some allocations failed to save.');
        }
      }

      const customer = customers.find((c) => c.id === values.customer_id);
      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: profile.branch_id,
        action: 'payment.created',
        entity_type: 'payment',
        entity_id: paymentData.id,
        description: `Recorded payment ${paymentData.payment_number ?? ''} from "${customer?.company_name ?? 'Unknown customer'}"`,
        metadata: { customer_id: values.customer_id, amount: values.amount },
      });

      toast.success('Payment recorded successfully');
      router.push(`/payments/${paymentData.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record payment';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/payments">Payments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Record Payment</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href="/payments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-medium tracking-tight">
            <Wallet className="h-6 w-6 text-blue-600" />
            Record Payment
          </h1>
          <p className="text-sm text-muted-foreground">
            Log a payment received and apply it to outstanding invoices.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Wallet className="h-4 w-4 text-blue-600" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
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
                <Label htmlFor="amount">
                  Amount Received <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  {...control.register('amount', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
                />
                {errors.amount && (
                  <p className="text-xs text-destructive">{errors.amount.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment_method">Payment Method</Label>
                <Controller
                  control={control}
                  name="payment_method"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v as PaymentMethod)}>
                      <SelectTrigger id="payment_method">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PAYMENT_METHOD_META) as PaymentMethod[]).map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_META[m].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment_date">
                  Payment Date <span className="text-destructive">*</span>
                </Label>
                <Input id="payment_date" type="date" {...control.register('payment_date')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reference">Reference (optional)</Label>
                <Input id="reference" placeholder="Bank txn ID, cheque no…" {...control.register('reference')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} {...control.register('notes')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Apply to Invoices</CardTitle>
            <CardDescription>
              {selectedCustomerId
                ? 'Choose which outstanding invoices this payment covers. Any leftover is kept as unallocated credit.'
                : 'Select a customer to see their outstanding invoices.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedCustomerId && outstandingInvoices.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                This customer has no outstanding invoices.
              </p>
            )}
            {outstandingInvoices.map((inv) => {
              const outstanding = Number(inv.total) - Number(inv.amount_paid);
              const checked = inv.id in allocations;
              return (
                <div
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleInvoice(inv, c === true)}
                    />
                    <div>
                      <p className="text-sm font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        Outstanding: {formatCurrency(outstanding, inv.currency)}
                      </p>
                    </div>
                  </div>
                  {checked && (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={outstanding}
                      value={allocations[inv.id]}
                      onChange={(e) => updateAllocationAmount(inv.id, Number(e.target.value) || 0)}
                      className="w-full sm:w-32"
                    />
                  )}
                </div>
              );
            })}

            {(totalAllocated > 0 || amount > 0) && (
              <>
                <Separator />
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Amount</span>
                    <span className="font-medium">{formatCurrency(amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Allocated</span>
                    <span className="font-medium">{formatCurrency(totalAllocated)}</span>
                  </div>
                  <div className="flex justify-between text-base">
                    <span className="font-semibold">Unallocated</span>
                    <span className={`font-bold ${unallocated < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {formatCurrency(unallocated)}
                    </span>
                  </div>
                  {unallocated < 0 && (
                    <p className="text-xs text-destructive">
                      Allocated amount exceeds the payment amount — reduce an allocation.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href="/payments" className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting || unallocated < 0} className="w-full sm:w-auto">
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </div>
      </form>
    </div>
  );
}
