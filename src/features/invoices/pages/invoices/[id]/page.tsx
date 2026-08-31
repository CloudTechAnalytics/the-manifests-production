'use client';

import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Printer,
  Ship,
} from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { adminForceDelete } from '@/shared/lib/utils/admin-delete';
import { canDeleteOwnRecord } from '@/shared/lib/utils/ownership';
import { useAuth } from '@/shared/contexts/auth-context';
import * as invoicesService from '@/features/invoices/services/invoices.service';
import type { InvoiceDetail, InvoiceAllocationRow } from '@/features/invoices/services/invoices.service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
import { EmptyState } from '@/shared/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/shared/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import {
  INVOICE_STATUS_META,
  isInvoiceOverdue,
  formatCurrency,
  formatDate,
} from '@/shared/lib/utils/status';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const invoiceId = params.id!;
  const queryClient = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesService.fetchInvoiceDetail(invoiceId),
    enabled: !!invoiceId,
  });
  const invoice = data?.invoice ?? null;
  const allocations = data?.allocations ?? [];
  const loading = isLoading;

  const canDelete = !!invoice && canDeleteOwnRecord({ hasRole });

  const invalidateInvoice = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !profile) return;
      if (hasRole('admin')) {
        const result = await adminForceDelete('invoice', invoiceId);
        if (!result.success) throw new Error(result.error);
        return;
      }
      await invoicesService.deleteInvoiceWithAllocations(
        invoiceId,
        profile.id,
        invoice.branch_id,
        invoice.invoice_number
      );
    },
    onSuccess: () => {
      invalidateInvoice();
      toast.success(hasRole('admin') ? 'Invoice permanently deleted' : 'Invoice deleted');
      navigate('/invoices');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to delete invoice');
      toast.error(message);
    },
    onSettled: () => {
      setDeleteOpen(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !profile) return;
      await invoicesService.cancelInvoice(invoiceId, profile.id, invoice.branch_id, invoice.invoice_number);
    },
    onSuccess: () => {
      invalidateInvoice();
      toast.success('Invoice cancelled');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to cancel invoice');
      toast.error(message);
    },
  });

  const handlePrint = () => {
    window.print();
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
        <Link to="/invoices">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Invoices
          </Button>
        </Link>
      </div>
    );
  }

  const overdue = isInvoiceOverdue(invoice);
  const statusMeta = INVOICE_STATUS_META[invoice.status] ?? {
    label: invoice.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };
  const outstanding = invoice.total - invoice.amount_paid;
  const canCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  // Matches payments/new's loadOutstandingInvoices filter (status in
  // sent/partial) — a draft invoice isn't sent yet, so offering "Record
  // Payment" for one led to a dead-end: the new-payment form has nothing
  // to preselect and never explains why.
  const canRecordPayment = invoice.status === 'sent' || invoice.status === 'partial';

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="no-print space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/invoices">Invoices</Link>
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
          <Link to="/invoices">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">
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
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
          {canRecordPayment && (
            <Link to={`/payments/new?invoice_id=${invoiceId}`}>
              <Button size="sm">
                <Wallet className="mr-1.5 h-4 w-4" />
                Record Payment
              </Button>
            </Link>
          )}
          <Link to={`/invoices/${invoiceId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
          {canCancel && (
            <Button variant="outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Cancel Invoice
            </Button>
          )}
          {canDelete && (
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
                  <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete invoice?</DialogTitle>
                  <DialogDescription>
                    {hasRole('admin') ? (
                      <>
                        This permanently deletes invoice &quot;{invoice.invoice_number}&quot;
                        and releases any payment allocations against it. This cannot be
                        undone.
                      </>
                    ) : (
                      <>
                        This will soft-delete invoice &quot;{invoice.invoice_number}&quot;. The
                        record is retained but hidden from lists. This action can be undone by
                        an admin.
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
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
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
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
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Package className="h-4 w-4 text-blue-600" />
                  References
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {invoice.shipment && (
                  <Link
                    to={`/shipments/${invoice.shipment.id}`}
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
                    to={`/quotations/${invoice.quotation.id}`}
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
                <CardTitle className="text-lg font-semibold">Notes</CardTitle>
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
              <CardTitle className="text-lg font-semibold">Amount Summary</CardTitle>
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
                <CardTitle className="text-lg font-semibold">Payment History</CardTitle>
                <CardDescription>Payments applied to this invoice.</CardDescription>
              </div>
              {canRecordPayment && (
                <Link to={`/payments/new?invoice_id=${invoiceId}`}>
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
                          <Link to={`/payments/${a.payment?.id}`}>
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

      <div className="print-only hidden">
        <PrintInvoice invoice={invoice} allocations={allocations} />
      </div>
    </div>
  );
}

// --- Print layout ----------------------------------------------------------

function PrintInvoice({
  invoice,
  allocations,
}: {
  invoice: InvoiceDetail;
  allocations: InvoiceAllocationRow[];
}) {
  const statusMeta = INVOICE_STATUS_META[invoice.status] ?? {
    label: invoice.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };
  const outstanding = invoice.total - invoice.amount_paid;

  return (
    <div className="space-y-6">
      {/* Letterhead */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
          <Ship className="h-4.5 w-4.5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-serif text-base font-bold leading-tight">
            {invoice.branch?.name ?? 'The Manifest'}
          </p>
          {invoice.branch?.address && (
            <p className="text-xs text-muted-foreground">{invoice.branch.address}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {[invoice.branch?.phone, invoice.branch?.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* Print header */}
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">INVOICE</h1>
          <p className="text-sm text-muted-foreground">{invoice.invoice_number ?? 'Draft'}</p>
        </div>
        <div className="text-right">
          <Badge variant="secondary" className={statusMeta.color}>
            {statusMeta.label}
          </Badge>
          <p className="mt-2 text-xs text-muted-foreground">
            Issued: {formatDate(invoice.issue_date)}
          </p>
          <p className="text-xs text-muted-foreground">Due: {formatDate(invoice.due_date)}</p>
        </div>
      </div>

      {/* Bill To */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Bill To</p>
        <p className="text-sm font-medium">{invoice.customer?.company_name ?? '—'}</p>
        {invoice.customer?.address && (
          <p className="text-sm text-muted-foreground">{invoice.customer.address}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {[invoice.customer?.email, invoice.customer?.phone].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* Reference */}
      {(invoice.shipment || invoice.quotation) && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {invoice.shipment && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Shipment</p>
              <p className="font-medium">{invoice.shipment.reference_number}</p>
            </div>
          )}
          {invoice.quotation && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Quotation</p>
              <p className="font-medium">{invoice.quotation.quotation_number}</p>
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="ml-auto w-64 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="font-medium">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span>{formatCurrency(invoice.total, invoice.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid</span>
          <span className="font-medium">{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
        </div>
        <div className="flex justify-between text-base font-bold">
          <span>Balance Due</span>
          <span>{formatCurrency(outstanding, invoice.currency)}</span>
        </div>
      </div>

      {/* Payment history */}
      {allocations.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Payments Received
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 font-medium">Reference</th>
                <th className="pb-1 font-medium">Date</th>
                <th className="pb-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td className="py-0.5">{a.payment?.payment_number ?? '—'}</td>
                  <td className="py-0.5">{a.payment ? formatDate(a.payment.payment_date) : '—'}</td>
                  <td className="py-0.5 text-right">{formatCurrency(a.amount, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {(invoice.notes || invoice.terms) && (
        <div className="space-y-3 border-t border-border pt-4 text-sm">
          {invoice.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Terms &amp; Conditions
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">{invoice.terms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
