'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Receipt,
  User,
  Calendar,
  Package,
  Loader2,
  Wallet,
  Plus,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  INVOICE_STATUS_META,
  isInvoiceOverdue,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/lib/utils/status';
import type { Invoice, Customer, Shipment, Quotation, PaymentAllocation } from '@/types';

type InvoiceDetail = Invoice & {
  customer: Customer | null;
  shipment: Shipment | null;
  quotation: Quotation | null;
};

type AllocationRow = PaymentAllocation & {
  payment: {
    id: string;
    payment_number: string | null;
    payment_date: string;
    payment_method: string;
  } | null;
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('*, customer:customers(*), shipment:shipments(*), quotation:quotations(*)')
        .eq('id', invoiceId)
        .is('deleted_at', null)
        .maybeSingle();

      if (invErr || !inv) {
        setInvoice(null);
        return;
      }
      setInvoice(inv as InvoiceDetail);

      const { data: allocs } = await supabase
        .from('payment_allocations')
        .select('*, payment:payments(id, payment_number, payment_date, payment_method)')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      setAllocations((allocs as AllocationRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async () => {
    if (!invoice || !profile) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', invoiceId);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: invoice.branch_id,
        action: 'invoice.deleted',
        entity_type: 'invoice',
        entity_id: invoiceId,
        description: `Deleted invoice ${invoice.invoice_number ?? ''}`,
        metadata: { invoice_number: invoice.invoice_number },
      });

      toast.success('Invoice deleted');
      router.push('/invoices');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete invoice';
      toast.error(message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleCancel = async () => {
    if (!invoice || !profile) return;
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'cancelled', updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq('id', invoiceId);
      if (error) throw error;
      toast.success('Invoice cancelled');
      loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel invoice';
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-1" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!invoice) {
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

  const overdue = isInvoiceOverdue(invoice);
  const statusMeta = INVOICE_STATUS_META[invoice.status];
  const outstanding = invoice.total - invoice.amount_paid;
  const canCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const canRecordPayment = invoice.status !== 'paid' && invoice.status !== 'cancelled';

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/invoices">Invoices</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{invoice.invoice_number ?? 'Invoice'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/invoices">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-medium tracking-tight">
                {invoice.invoice_number ?? 'Invoice'}
              </h1>
              <Badge variant="secondary" className={overdue ? 'bg-red-100 text-red-700' : statusMeta.color}>
                {overdue ? 'Overdue' : statusMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {invoice.customer?.company_name ?? 'Unknown customer'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRecordPayment && (
            <Link href={`/payments/new?invoice_id=${invoiceId}`}>
              <Button size="sm">
                <Wallet className="mr-1.5 h-4 w-4" />
                Record Payment
              </Button>
            </Link>
          )}
          <Link href={`/invoices/${invoiceId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
          {canCancel && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel Invoice
            </Button>
          )}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete invoice?</DialogTitle>
                <DialogDescription>
                  This will soft-delete invoice &quot;{invoice.invoice_number}&quot;. The
                  record is retained but hidden from lists. This action can be undone by
                  an admin.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <User className="h-4 w-4 text-blue-600" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{invoice.customer?.company_name ?? '—'}</p>
              <p className="text-muted-foreground">{invoice.customer?.email ?? '—'}</p>
              <p className="text-muted-foreground">{invoice.customer?.phone ?? '—'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Calendar className="h-4 w-4 text-blue-600" />
                Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Issue Date</span>
                <span className="font-medium">{formatDate(invoice.issue_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date</span>
                <span className={overdue ? 'font-medium text-red-600' : 'font-medium'}>
                  {formatDate(invoice.due_date)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{formatDate(invoice.created_at)}</span>
              </div>
            </CardContent>
          </Card>

          {(invoice.shipment || invoice.quotation) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Package className="h-4 w-4 text-blue-600" />
                  References
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {invoice.shipment && (
                  <Link
                    href={`/shipments/${invoice.shipment.id}`}
                    className="flex justify-between hover:text-primary"
                  >
                    <span className="text-muted-foreground">Shipment</span>
                    <span className="font-medium text-primary">
                      {invoice.shipment.reference_number}
                    </span>
                  </Link>
                )}
                {invoice.quotation && (
                  <Link
                    href={`/quotations/${invoice.quotation.id}`}
                    className="flex justify-between hover:text-primary"
                  >
                    <span className="text-muted-foreground">Quotation</span>
                    <span className="font-medium text-primary">
                      {invoice.quotation.quotation_number}
                    </span>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {invoice.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Amount + Payment history */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Amount Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold">{formatCurrency(invoice.total, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(invoice.amount_paid, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between text-base">
                <span className="font-semibold">Outstanding</span>
                <span className={`font-bold ${outstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatCurrency(outstanding, invoice.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Payment History</CardTitle>
                <CardDescription>Payments applied to this invoice.</CardDescription>
              </div>
              {canRecordPayment && (
                <Link href={`/payments/new?invoice_id=${invoiceId}`}>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Payment
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {allocations.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No payments recorded"
                  message="Payments applied to this invoice will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Ref</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a) => (
                      <TableRow key={a.id} className="transition-colors hover:bg-accent/60">
                        <TableCell className="font-medium text-primary">
                          <Link href={`/payments/${a.payment?.id}`}>
                            {a.payment?.payment_number ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.payment ? formatDate(a.payment.payment_date) : '—'}
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {a.payment?.payment_method.replace('_', ' ') ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(a.amount, invoice.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
