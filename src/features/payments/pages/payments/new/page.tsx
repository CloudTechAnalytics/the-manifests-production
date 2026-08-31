'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Wallet, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { useBranchSelector } from '@/shared/hooks/use-branch-selector';
import { BranchSelectField } from '@/shared/components/branch-select-field';
import * as paymentsService from '@/features/payments/services/payments.service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Separator } from '@/shared/components/ui/separator';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { PAYMENT_METHOD_META, formatCurrency } from '@/shared/lib/utils/status';
import type { Invoice, PaymentMethod } from '@/shared/types';

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const preselectInvoiceId = searchParams.get('invoice_id');
  const queryClient = useQueryClient();

  const [allocations, setAllocations] = useState<Record<string, number>>({});

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

  const { data: customers = [] } = useQuery({
    queryKey: ['payments', 'form-customers', isAdmin, myBranchId],
    queryFn: () => paymentsService.fetchCustomersForPaymentForm(isAdmin, myBranchId),
    enabled: !!profile,
  });

  // If arriving from an invoice's "Record Payment" link, preselect that
  // invoice's customer.
  const { data: preselectCustomerId } = useQuery({
    queryKey: ['payments', 'form-preselect-invoice', preselectInvoiceId],
    queryFn: () => paymentsService.fetchInvoiceCustomerId(preselectInvoiceId!),
    enabled: !!preselectInvoiceId,
  });
  useEffect(() => {
    if (preselectCustomerId) setValue('customer_id', preselectCustomerId);
  }, [preselectCustomerId, setValue]);

  const { data: outstandingInvoices = [] } = useQuery({
    queryKey: ['payments', 'form-outstanding-invoices', selectedCustomerId, isAdmin, myBranchId],
    queryFn: () =>
      paymentsService.fetchOutstandingInvoicesForPaymentForm(selectedCustomerId, isAdmin, myBranchId),
    enabled: !!selectedCustomerId,
  });

  // Preselect the invoice we arrived from, defaulted to its full outstanding amount
  useEffect(() => {
    if (!preselectInvoiceId || outstandingInvoices.length === 0) return;
    const target = outstandingInvoices.find((i) => i.id === preselectInvoiceId);
    if (target) {
      const outstanding = Number(target.total) - Number(target.amount_paid);
      setAllocations({ [target.id]: outstanding });
      setValue('amount', outstanding);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectInvoiceId, outstandingInvoices]);

  useEffect(() => {
    setAllocations({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations]
  );
  const unallocated = amount - totalAllocated;

  const toggleInvoice = (invoice: Invoice, checked: boolean) => {
    if (checked) {
      // payments has no currency of its own — a single payment amount
      // allocated across invoices of different currencies would silently
      // mark a foreign-currency invoice as paid/partial with no
      // conversion applied. Block mixing currencies within one payment.
      const selectedIds = Object.keys(allocations);
      const firstSelected = outstandingInvoices.find((i) => selectedIds.includes(i.id));
      if (firstSelected && firstSelected.currency !== invoice.currency) {
        toast.error(
          `This payment already has a ${firstSelected.currency} invoice selected — can't mix currencies in one payment.`
        );
        return;
      }
    }
    setAllocations((prev) => {
      const next = { ...prev };
      if (checked) {
        const outstanding = Number(invoice.total) - Number(invoice.amount_paid);
        const remainingPayment = Math.max(amount - totalAllocated, 0);
        // No `|| outstanding` fallback: remainingPayment is legitimately 0
        // when the amount hasn't been entered yet (or is already fully
        // allocated) — falling back to the full outstanding balance in
        // that case silently overallocated past the payment amount.
        next[invoice.id] = Math.min(outstanding, remainingPayment);
      } else {
        delete next[invoice.id];
      }
      return next;
    });
  };

  const updateAllocationAmount = (invoiceId: string, value: number) => {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const createMutation = useMutation({
    mutationFn: (values: PaymentFormValues) => {
      if (!profile?.id || !branchId) {
        throw new Error('Please select a branch');
      }
      const customer = customers.find((c) => c.id === values.customer_id);
      const allocationEntries = Object.entries(allocations).filter(([, amt]) => amt > 0) as [
        string,
        number,
      ][];
      return paymentsService.createPayment({
        customer_id: values.customer_id,
        branch_id: branchId,
        payment_date: values.payment_date,
        payment_method: values.payment_method,
        amount: values.amount,
        reference: values.reference || null,
        notes: values.notes || null,
        created_by: profile.id,
        customer_name: customer?.company_name ?? 'Unknown customer',
        allocations: allocationEntries,
      });
    },
    onSuccess: (paymentData) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (paymentData.allocationFailed) {
        toast.warning('Payment recorded, but some allocations failed to save.');
      } else {
        toast.success('Payment recorded successfully');
      }
      navigate(`/payments/${paymentData.id}`);
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to record payment');
      toast.error(message);
    },
  });

  const onSubmit = (values: PaymentFormValues) => {
    if (!profile?.id) return;
    if (!branchId) {
      setBranchError('Please select a branch');
      return;
    }
    setBranchError('');
    if (totalAllocated > values.amount + 0.01) {
      toast.error('Allocated amount cannot exceed the payment amount.');
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/payments">Payments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Record Payment</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to="/payments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Wallet className="h-6 w-6 text-blue-600" />
            Record Payment
          </h1>
          <p className="text-sm text-muted-foreground">
            Log a payment received and apply it to outstanding invoices.
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
            <CardTitle className="text-lg font-semibold">Apply to Invoices</CardTitle>
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
          <Link to="/payments" className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending || unallocated < 0} className="w-full sm:w-auto">
            {createMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </div>
      </form>
    </div>
  );
}
