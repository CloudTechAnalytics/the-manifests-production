'use client';

import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Wallet, User, Loader2, PlusCircle } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { adminForceDelete } from '@/shared/lib/utils/admin-delete';
import { canDeleteOwnRecord } from '@/shared/lib/utils/ownership';
import { useAuth } from '@/shared/contexts/auth-context';
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
import { Checkbox } from '@/shared/components/ui/checkbox';
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
import { PAYMENT_METHOD_META, formatCurrency, formatDate } from '@/shared/lib/utils/status';
import type { Invoice } from '@/shared/types';

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const paymentId = params.id!;
  const queryClient = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => paymentsService.fetchPaymentDetail(paymentId),
    enabled: !!paymentId,
  });
  const payment = data?.payment ?? null;
  const allocations = data?.allocations ?? [];
  const loading = isLoading;

  const canDelete = !!payment && canDeleteOwnRecord({ hasRole });

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [newAllocations, setNewAllocations] = useState<Record<string, number>>({});

  const { data: outstandingInvoices = [], isFetching: loadingInvoices } = useQuery({
    queryKey: ['payment', paymentId, 'outstanding-invoices', payment?.customer_id],
    queryFn: () => paymentsService.fetchOutstandingInvoicesForCustomer(payment!.customer_id),
    enabled: allocateOpen && !!payment,
    select: (invoices) => {
      const alreadyAppliedInvoiceIds = new Set(allocations.map((a) => a.invoice_id));
      return invoices.filter((inv) => !alreadyAppliedInvoiceIds.has(inv.id));
    },
  });

  const openAllocateDialog = () => {
    setNewAllocations({});
    setAllocateOpen(true);
  };

  const invalidatePayment = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['payment', paymentId] });
  };

  const unallocated = payment
    ? Number(payment.amount) - Number(payment.allocated_amount)
    : 0;

  const totalNewAllocated = useMemo(
    () => Object.values(newAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [newAllocations]
  );
  const remainingAfterNew = unallocated - totalNewAllocated;

  const toggleNewInvoice = (invoice: Invoice, checked: boolean) => {
    if (checked) {
      // This payment has no currency of its own — allocating across
      // invoices of different currencies would silently mark a
      // foreign-currency invoice as paid/partial with no conversion
      // applied. Block mixing currencies, whether the conflicting invoice
      // is already-allocated on this payment or newly being checked now.
      const existingCurrency = allocations.find((a) => a.invoice)?.invoice?.currency;
      const selectedIds = Object.keys(newAllocations);
      const newlySelected = outstandingInvoices.find((i) => selectedIds.includes(i.id));
      const conflictCurrency = existingCurrency ?? newlySelected?.currency;
      if (conflictCurrency && conflictCurrency !== invoice.currency) {
        toast.error(
          `This payment already has a ${conflictCurrency} invoice — can't mix currencies in one payment.`
        );
        return;
      }
    }
    setNewAllocations((prev) => {
      const next = { ...prev };
      if (checked) {
        const outstanding = Number(invoice.total) - Number(invoice.amount_paid);
        const remaining = Math.max(unallocated - totalNewAllocated, 0);
        // No `|| outstanding` fallback — see payments/new's toggleInvoice
        // for why: a legitimate 0 (nothing left unallocated) shouldn't
        // fall back to the full outstanding balance.
        next[invoice.id] = Math.min(outstanding, remaining);
      } else {
        delete next[invoice.id];
      }
      return next;
    });
  };

  const updateNewAllocationAmount = (invoiceId: string, value: number) => {
    setNewAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const allocateMutation = useMutation({
    mutationFn: (entries: [string, number][]) => {
      if (!payment || !profile) throw new Error('Not ready');
      return paymentsService.allocatePayment(
        paymentId,
        payment.branch_id,
        payment.payment_number,
        profile.id,
        entries
      );
    },
    onSuccess: () => {
      invalidatePayment();
      toast.success('Payment allocated successfully');
      setAllocateOpen(false);
      setNewAllocations({});
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to allocate payment');
      toast.error(message);
    },
  });

  const handleAllocate = () => {
    if (!payment || !profile) return;
    const entries = Object.entries(newAllocations).filter(([, amt]) => amt > 0) as [string, number][];
    if (entries.length === 0) return;
    if (totalNewAllocated > unallocated + 0.01) {
      toast.error('Allocated amount cannot exceed the unallocated balance.');
      return;
    }
    allocateMutation.mutate(entries);
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!payment || !profile) return;
      if (hasRole('admin')) {
        const result = await adminForceDelete('payment', paymentId);
        if (!result.success) throw new Error(result.error);
        return;
      }
      await paymentsService.deletePaymentWithAllocations(
        paymentId,
        profile.id,
        payment.branch_id,
        payment.payment_number,
        payment.amount,
        allocations.length > 0
      );
    },
    onSuccess: () => {
      invalidatePayment();
      toast.success(hasRole('admin') ? 'Payment permanently deleted' : 'Payment deleted');
      navigate('/payments');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to delete payment');
      toast.error(message);
    },
    onSettled: () => {
      setDeleteOpen(false);
    },
  });

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

  if (!payment) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Wallet className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Payment not found</h2>
          <p className="text-sm text-muted-foreground">
            This payment may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link to="/payments">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Payments
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/payments">Payments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{payment.payment_number ?? 'Payment'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/payments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">
              {payment.payment_number ?? 'Payment'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {payment.customer?.company_name ?? 'Unknown customer'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unallocated > 0.01 && (
            <Dialog open={allocateOpen} onOpenChange={(open) => (open ? openAllocateDialog() : setAllocateOpen(false))}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-1.5 h-4 w-4" />
                  Allocate to Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Allocate Payment</DialogTitle>
                  <DialogDescription>
                    Apply the unallocated balance of {payment.payment_number} to this
                    customer&apos;s outstanding invoices.
                  </DialogDescription>
                </DialogHeader>

                <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                  {loadingInvoices ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : outstandingInvoices.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      This customer has no other outstanding invoices.
                    </p>
                  ) : (
                    outstandingInvoices.map((inv) => {
                      const outstanding = Number(inv.total) - Number(inv.amount_paid);
                      const checked = inv.id in newAllocations;
                      return (
                        <div
                          key={inv.id}
                          className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => toggleNewInvoice(inv, c === true)}
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
                              value={newAllocations[inv.id]}
                              onChange={(e) =>
                                updateNewAllocationAmount(inv.id, Number(e.target.value) || 0)
                              }
                              className="w-full sm:w-32"
                            />
                          )}
                        </div>
                      );
                    })
                  )}

                  {totalNewAllocated > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Unallocated Balance</span>
                          <span className="font-medium">{formatCurrency(unallocated)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Applying Now</span>
                          <span className="font-medium">{formatCurrency(totalNewAllocated)}</span>
                        </div>
                        <div className="flex justify-between text-base">
                          <span className="font-semibold">Remaining After</span>
                          <span
                            className={`font-bold ${remainingAfterNew < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                          >
                            {formatCurrency(remainingAfterNew)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={handleAllocate}
                    disabled={allocateMutation.isPending || totalNewAllocated <= 0 || remainingAfterNew < -0.01}
                  >
                    {allocateMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Apply Allocation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                  <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete payment?</DialogTitle>
                  <DialogDescription>
                    {hasRole('admin') ? (
                      <>
                        This permanently deletes payment &quot;{payment.payment_number}&quot;
                        and its allocations, updating any linked invoices&apos; outstanding
                        balances back up. This cannot be undone.
                      </>
                    ) : (
                      <>
                        This will soft-delete payment &quot;{payment.payment_number}&quot; and remove
                        its allocations, updating any linked invoices&apos; outstanding balances back
                        up. This action can be undone by an admin.
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <User className="h-4 w-4 text-blue-600" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{payment.customer?.company_name ?? '—'}</p>
              <p className="text-muted-foreground">{payment.customer?.email ?? '—'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Payment Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(payment.payment_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium">{PAYMENT_METHOD_META[payment.payment_method]?.label ?? payment.payment_method}</span>
              </div>
              {payment.reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-medium">{payment.reference}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Amount</span>
                <span className="font-bold">{formatCurrency(payment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allocated</span>
                <span className="font-medium">{formatCurrency(payment.allocated_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unallocated</span>
                <span className={`font-medium ${unallocated > 0.01 ? 'text-amber-600' : ''}`}>
                  {formatCurrency(unallocated)}
                </span>
              </div>
            </CardContent>
          </Card>

          {payment.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {payment.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Applied To</CardTitle>
              <CardDescription>Invoices this payment was allocated against.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {allocations.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Not allocated to any invoice"
                  message="This payment is held as unapplied credit."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Invoice Total</TableHead>
                      <TableHead className="text-right">Amount Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a) => (
                      <TableRow key={a.id} className="transition-colors hover:bg-accent/60">
                        <TableCell className="font-medium text-primary">
                          <Link to={`/invoices/${a.invoice?.id}`}>
                            {a.invoice?.invoice_number ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {a.invoice ? formatCurrency(a.invoice.total) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(a.amount)}
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
