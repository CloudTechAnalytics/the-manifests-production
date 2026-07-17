'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Wallet, User, Loader2, PlusCircle } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { PAYMENT_METHOD_META, formatCurrency, formatDate } from '@/lib/utils/status';
import type { Payment, Customer, PaymentAllocation, Invoice } from '@/types';

type PaymentDetail = Payment & { customer: Customer | null };
type AllocationRow = PaymentAllocation & {
  invoice: { id: string; invoice_number: string | null; total: number } | null;
};

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const paymentId = params.id;

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [outstandingInvoices, setOutstandingInvoices] = useState<Invoice[]>([]);
  const [newAllocations, setNewAllocations] = useState<Record<string, number>>({});
  const [allocating, setAllocating] = useState(false);

  const loadData = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    try {
      const { data: p, error: pErr } = await supabase
        .from('payments')
        .select('*, customer:customers(*)')
        .eq('id', paymentId)
        .is('deleted_at', null)
        .maybeSingle();

      if (pErr || !p) {
        setPayment(null);
        return;
      }
      setPayment(p as PaymentDetail);

      const { data: allocs } = await supabase
        .from('payment_allocations')
        .select('*, invoice:invoices(id, invoice_number, total)')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: false });
      setAllocations((allocs as AllocationRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const unallocated = payment
    ? Number(payment.amount) - Number(payment.allocated_amount)
    : 0;

  const loadOutstandingInvoices = useCallback(async () => {
    if (!payment) return;
    setLoadingInvoices(true);
    try {
      const alreadyAppliedInvoiceIds = new Set(allocations.map((a) => a.invoice_id));
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', payment.customer_id)
        .in('status', ['sent', 'partial'])
        .is('deleted_at', null)
        .order('due_date', { ascending: true });

      if (error) {
        console.error('Error loading outstanding invoices:', error);
        setOutstandingInvoices([]);
        return;
      }
      const invoices = ((data as Invoice[]) ?? []).filter(
        (inv) => !alreadyAppliedInvoiceIds.has(inv.id)
      );
      setOutstandingInvoices(invoices);
    } finally {
      setLoadingInvoices(false);
    }
  }, [payment, allocations]);

  const openAllocateDialog = () => {
    setNewAllocations({});
    setAllocateOpen(true);
    loadOutstandingInvoices();
  };

  const totalNewAllocated = useMemo(
    () => Object.values(newAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [newAllocations]
  );
  const remainingAfterNew = unallocated - totalNewAllocated;

  const toggleNewInvoice = (invoice: Invoice, checked: boolean) => {
    setNewAllocations((prev) => {
      const next = { ...prev };
      if (checked) {
        const outstanding = Number(invoice.total) - Number(invoice.amount_paid);
        const remaining = Math.max(unallocated - totalNewAllocated, 0);
        next[invoice.id] = Math.min(outstanding, remaining || outstanding);
      } else {
        delete next[invoice.id];
      }
      return next;
    });
  };

  const updateNewAllocationAmount = (invoiceId: string, value: number) => {
    setNewAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const handleAllocate = async () => {
    if (!payment || !profile) return;
    const entries = Object.entries(newAllocations).filter(([, amt]) => amt > 0);
    if (entries.length === 0) return;
    if (totalNewAllocated > unallocated + 0.01) {
      toast.error('Allocated amount cannot exceed the unallocated balance.');
      return;
    }
    setAllocating(true);
    try {
      const { error } = await supabase.from('payment_allocations').insert(
        entries.map(([invoiceId, amt]) => ({
          payment_id: paymentId,
          invoice_id: invoiceId,
          amount: amt,
          created_by: profile.id,
        }))
      );
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: payment.branch_id,
        action: 'payment.allocated',
        entity_type: 'payment',
        entity_id: paymentId,
        description: `Applied ${payment.payment_number ?? ''} to ${entries.length} invoice${entries.length === 1 ? '' : 's'}`,
        metadata: { total_allocated: totalNewAllocated },
      });

      toast.success('Payment allocated successfully');
      setAllocateOpen(false);
      setNewAllocations({});
      loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to allocate payment';
      toast.error(message);
    } finally {
      setAllocating(false);
    }
  };

  const handleDelete = async () => {
    if (!payment || !profile) return;
    setDeleting(true);
    try {
      // Remove allocations first so the sync trigger recalculates the
      // affected invoices' amount_paid/status back down before we soft
      // delete the payment itself — otherwise those invoices would stay
      // "paid" against a payment that no longer counts.
      if (allocations.length > 0) {
        const { error: allocDeleteError } = await supabase
          .from('payment_allocations')
          .delete()
          .eq('payment_id', paymentId);
        if (allocDeleteError) throw allocDeleteError;
      }

      const { error } = await supabase
        .from('payments')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', paymentId);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: payment.branch_id,
        action: 'payment.deleted',
        entity_type: 'payment',
        entity_id: paymentId,
        description: `Deleted payment ${payment.payment_number ?? ''}`,
        metadata: { payment_number: payment.payment_number, amount: payment.amount },
      });

      toast.success('Payment deleted');
      router.push('/payments');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete payment';
      toast.error(message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
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
        <Link href="/payments">
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
              <Link href="/payments">Payments</Link>
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
          <Link href="/payments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-2xl font-normal tracking-tight">
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
              <DialogContent className="max-w-lg">
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
                    disabled={allocating || totalNewAllocated <= 0 || remainingAfterNew < -0.01}
                  >
                    {allocating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Apply Allocation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                <DialogTitle>Delete payment?</DialogTitle>
                <DialogDescription>
                  This will soft-delete payment &quot;{payment.payment_number}&quot; and remove
                  its allocations, updating any linked invoices&apos; outstanding balances back
                  up. This action can be undone by an admin.
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
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
              <CardTitle className="text-base font-semibold">Payment Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(payment.payment_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium">{PAYMENT_METHOD_META[payment.payment_method].label}</span>
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
                <CardTitle className="text-base font-semibold">Notes</CardTitle>
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
              <CardTitle className="text-base font-semibold">Applied To</CardTitle>
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
                          <Link href={`/invoices/${a.invoice?.id}`}>
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
