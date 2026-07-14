'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Receipt, Loader2 } from 'lucide-react';
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { formatCurrency } from '@/lib/utils/status';
import type { Invoice } from '@/types';

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

const invoiceSchema = z.object({
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional().or(z.literal('')),
  currency: z.string().min(1, 'Currency is required'),
  subtotal: z.coerce.number().min(0, 'Subtotal must be ≥ 0'),
  tax_amount: z.coerce.number().min(0, 'Tax must be ≥ 0'),
  notes: z.string().optional().or(z.literal('')),
  terms: z.string().optional().or(z.literal('')),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const invoiceId = params.id;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceBranchId, setInvoiceBranchId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      issue_date: '',
      due_date: '',
      currency: 'NGN',
      subtotal: 0,
      tax_amount: 0,
      notes: '',
      terms: '',
    },
  });

  const subtotal = watch('subtotal');
  const taxAmount = watch('tax_amount');
  const currency = watch('currency');
  const total = (Number(subtotal) || 0) + (Number(taxAmount) || 0);

  useEffect(() => {
    if (!invoiceId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .is('deleted_at', null)
          .maybeSingle();

        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }

        const invoice = data as Invoice;
        setInvoiceBranchId(invoice.branch_id);
        setInvoiceNumber(invoice.invoice_number);

        reset({
          issue_date: invoice.issue_date,
          due_date: invoice.due_date ?? '',
          currency: invoice.currency,
          subtotal: Number(invoice.subtotal),
          tax_amount: Number(invoice.tax_amount),
          notes: invoice.notes ?? '',
          terms: invoice.terms ?? '',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, reset]);

  const onSubmit = async (values: InvoiceFormValues) => {
    if (!profile?.id || !invoiceBranchId) {
      toast.error('Unable to determine invoice branch.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          issue_date: values.issue_date,
          due_date: values.due_date || null,
          currency: values.currency,
          subtotal: values.subtotal,
          tax_amount: values.tax_amount,
          total,
          notes: values.notes || null,
          terms: values.terms || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: invoiceBranchId,
        action: 'invoice.updated',
        entity_type: 'invoice',
        entity_id: invoiceId,
        description: `Updated invoice ${invoiceNumber ?? ''}`,
        metadata: { total, currency: values.currency },
      });

      toast.success('Invoice updated successfully');
      router.push(`/invoices/${invoiceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update invoice';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Receipt className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Invoice not found</h2>
          <p className="text-sm text-muted-foreground">
            This invoice may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/invoices">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Invoices
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/invoices">Invoices</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/invoices/${invoiceId}`}>{invoiceNumber ?? 'Invoice'}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link href={`/invoices/${invoiceId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Receipt className="h-6 w-6 text-blue-600" />
            Edit Invoice
          </h1>
          <p className="text-sm text-muted-foreground">
            {invoiceNumber ? `Update ${invoiceNumber}.` : 'Update this invoice.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Receipt className="h-4 w-4 text-blue-600" />
              Invoice Details
            </CardTitle>
            <CardDescription>
              Customer and shipment/quotation links can&apos;t be changed after creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Textarea id="notes" rows={2} {...control.register('notes')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms</Label>
              <Textarea id="terms" rows={2} {...control.register('terms')} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Amount</CardTitle>
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
              </div>
            </div>
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-primary">{formatCurrency(total, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Amount paid and status update automatically as payments are recorded — they
              can&apos;t be edited directly here.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href={`/invoices/${invoiceId}`} className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
