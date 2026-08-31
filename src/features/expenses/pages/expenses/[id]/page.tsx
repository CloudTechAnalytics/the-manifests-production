'use client';

import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { getErrorMessage } from '@/shared/lib/utils';
import { adminForceDelete } from '@/shared/lib/utils/admin-delete';
import { canDeleteOwnRecord } from '@/shared/lib/utils/ownership';
import { useAuth } from '@/shared/contexts/auth-context';
import * as expensesService from '@/features/expenses/services/expenses.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
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
  EXPENSE_CATEGORY_META,
  EXPENSE_STATUS_META,
  formatCurrency,
  formatDate,
} from '@/shared/lib/utils/status';

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const expenseId = params.id!;
  const queryClient = useQueryClient();
  // Mirrors can_manage_finance() (migration 034's RLS for expenses UPDATE):
  // admin, branch_manager, and finance can all approve/reject, not just
  // admin — and a user can hold more than one of those at once.
  const canApprove = hasRole('admin') || hasRole('branch_manager') || hasRole('finance');

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: expense, isLoading: loading } = useQuery({
    queryKey: ['expense', expenseId],
    queryFn: () => expensesService.fetchExpenseDetail(expenseId),
    enabled: !!expenseId,
  });

  const canDelete = !!expense && canDeleteOwnRecord({ hasRole });

  const invalidateExpense = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
  };

  const decisionMutation = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') => {
      if (!expense || !profile) throw new Error('Not ready');
      return expensesService.decideExpense(
        expenseId,
        decision,
        profile.id,
        expense.branch_id,
        expense.expense_number
      );
    },
    onSuccess: (_data, decision) => {
      invalidateExpense();
      toast.success(`Expense ${decision}`);
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to update expense');
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!expense || !profile) return;
      if (hasRole('admin')) {
        const result = await adminForceDelete('expense', expenseId);
        if (!result.success) throw new Error(result.error);
        return;
      }
      await expensesService.softDeleteExpense(expenseId, profile.id, expense.branch_id, expense.expense_number);
    },
    onSuccess: () => {
      invalidateExpense();
      toast.success(hasRole('admin') ? 'Expense permanently deleted' : 'Expense deleted');
      navigate('/expenses');
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to delete expense');
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
        <Link to="/expenses">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Expenses
          </Button>
        </Link>
      </div>
    );
  }

  const statusMeta = EXPENSE_STATUS_META[expense.status] ?? {
    label: expense.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/expenses">Expenses</Link>
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
          <Link to="/expenses">
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
              <Button
                size="sm"
                onClick={() => decisionMutation.mutate('approved')}
                disabled={decisionMutation.isPending}
              >
                {decisionMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => decisionMutation.mutate('rejected')}
                disabled={decisionMutation.isPending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          <Link to={`/expenses/${expenseId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
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
                  <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-600" />Delete expense?</DialogTitle>
                  <DialogDescription>
                    {hasRole('admin') ? (
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Category</span>
            <span className="font-medium">{EXPENSE_CATEGORY_META[expense.category]?.label ?? expense.category}</span>
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
              <Link to={`/shipments/${expense.shipment.id}`} className="font-medium text-primary flex items-center gap-1">
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
