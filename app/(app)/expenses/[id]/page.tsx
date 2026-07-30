'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  CreditCard,
  Check,
  X,
  Loader2,
  Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { adminForceDelete } from '@/lib/utils/admin-delete';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
  EXPENSE_CATEGORY_META,
  EXPENSE_STATUS_META,
  formatCurrency,
  formatDate,
} from '@/lib/utils/status';
import type { Expense, Shipment, Profile } from '@/types';

type ExpenseDetail = Expense & {
  shipment: Shipment | null;
  paid_by_user: Profile | null;
  approved_by_user: Profile | null;
};

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const expenseId = params.id;
  const isAdmin = profile?.role === 'admin';
  // Mirrors can_manage_finance() (migration 024's RLS for expenses UPDATE):
  // admin, branch_manager, and finance can all approve/reject, not just admin.
  const canApprove =
    profile?.role === 'admin' ||
    profile?.role === 'branch_manager' ||
    profile?.role === 'finance';

  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadData = useCallback(async () => {
    if (!expenseId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(
          '*, shipment:shipments(*), paid_by_user:profiles!expenses_paid_by_fkey(*), approved_by_user:profiles!expenses_approved_by_fkey(*)'
        )
        .eq('id', expenseId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) {
        setExpense(null);
        return;
      }
      setExpense(data as ExpenseDetail);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!expense || !profile) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          status: decision,
          approved_by: profile.id,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', expenseId);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: expense.branch_id,
        action: `expense.${decision}`,
        entity_type: 'expense',
        entity_id: expenseId,
        description: `${decision === 'approved' ? 'Approved' : 'Rejected'} expense ${expense.expense_number ?? ''}`,
        metadata: { expense_number: expense.expense_number },
      });

      toast.success(`Expense ${decision}`);
      loadData();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update expense');
      toast.error(message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!expense || !profile) return;
    setDeleting(true);
    try {
      if (profile.role === 'admin') {
        const result = await adminForceDelete('expense', expenseId);
        if (!result.success) throw new Error(result.error);
        toast.success('Expense permanently deleted');
        router.push('/expenses');
        return;
      }

      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', expenseId);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: expense.branch_id,
        action: 'expense.deleted',
        entity_type: 'expense',
        entity_id: expenseId,
        description: `Deleted expense ${expense.expense_number ?? ''}`,
        metadata: { expense_number: expense.expense_number },
      });

      toast.success('Expense deleted');
      router.push('/expenses');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to delete expense');
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
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <CreditCard className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Expense not found</h2>
          <p className="text-sm text-muted-foreground">
            This expense may have been deleted or you don&apos;t have access.
          </p>
        </div>
        <Link href="/expenses">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Expenses
          </Button>
        </Link>
      </div>
    );
  }

  const statusMeta = EXPENSE_STATUS_META[expense.status];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/expenses">Expenses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{expense.expense_number ?? 'Expense'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/expenses">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">
                {expense.expense_number ?? 'Expense'}
              </h1>
              <Badge variant="secondary" className={statusMeta.color}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{expense.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && expense.status === 'pending' && (
            <>
              <Button size="sm" onClick={() => handleDecision('approved')} disabled={updating}>
                {updating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDecision('rejected')}
                disabled={updating}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          <Link href={`/expenses/${expenseId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
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
                <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete expense?</DialogTitle>
                <DialogDescription>
                  {profile?.role === 'admin' ? (
                    <>
                      This permanently deletes expense &quot;{expense.expense_number}&quot;.
                      This cannot be undone.
                    </>
                  ) : (
                    <>
                      This will soft-delete expense &quot;{expense.expense_number}&quot;. The
                      record is retained but hidden from lists.
                    </>
                  )}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Category</span>
            <span className="font-medium">{EXPENSE_CATEGORY_META[expense.category].label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{formatDate(expense.expense_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid By</span>
            <span className="font-medium">{expense.paid_by_user?.full_name ?? '—'}</span>
          </div>
          {expense.approved_by_user && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {expense.status === 'rejected' ? 'Rejected By' : 'Approved By'}
              </span>
              <span className="font-medium">{expense.approved_by_user.full_name}</span>
            </div>
          )}
          {expense.shipment && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipment</span>
              <Link href={`/shipments/${expense.shipment.id}`} className="font-medium text-primary flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                {expense.shipment.reference_number}
              </Link>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Amount</span>
            <span className="font-bold">{formatCurrency(expense.amount, expense.currency)}</span>
          </div>
        </CardContent>
      </Card>

      {expense.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{expense.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
