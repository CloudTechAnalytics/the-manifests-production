'use client';

import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import * as expensesService from '@/features/expenses/services/expenses.service';
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
import { Skeleton } from '@/shared/components/ui/skeleton';
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
import { EXPENSE_CATEGORY_META } from '@/shared/lib/utils/status';
import type { ExpenseCategory } from '@/shared/types';

const expenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  category: z.enum([
    'transport',
    'customs',
    'rent',
    'salaries_benefits',
    'utilities',
    'demurrage',
    'storage',
    're_examination_penalty',
    'delivery_order_regeneration',
    'other',
  ]),
  shipment_id: z.string().optional().or(z.literal('')),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  currency: z.string().min(1),
  expense_date: z.string().min(1, 'Expense date is required'),
  notes: z.string().optional().or(z.literal('')),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

export default function EditExpensePage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const expenseId = params.id!;
  const queryClient = useQueryClient();

  const isAdmin = profile?.role === 'admin';
  const userBranchId = profile?.branch_id ?? null;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: '',
      category: 'other',
      shipment_id: '',
      amount: 0,
      currency: 'NGN',
      expense_date: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  const { data: expense, isLoading: loading, isError } = useQuery({
    queryKey: ['expense', expenseId],
    queryFn: () => expensesService.fetchExpenseForEdit(expenseId),
    enabled: !!expenseId,
  });
  const notFound = !loading && (isError || !expense);

  useEffect(() => {
    if (!expense) return;
    reset({
      description: expense.description,
      category: expense.category,
      shipment_id: expense.shipment_id ?? '',
      amount: Number(expense.amount),
      currency: expense.currency,
      expense_date: expense.expense_date,
      notes: expense.notes ?? '',
    });
  }, [expense, reset]);

  const { data: shipments = [] } = useQuery({
    queryKey: ['expenses', 'form-shipments', isAdmin, userBranchId],
    queryFn: () => expensesService.fetchShipmentsForExpenseForm(isAdmin, userBranchId),
    enabled: !!profile,
  });

  const updateMutation = useMutation({
    mutationFn: (values: ExpenseFormValues) => {
      if (!profile?.id || !expense) throw new Error('Not ready');
      return expensesService.updateExpense(expenseId, {
        description: values.description,
        category: values.category,
        shipment_id: values.shipment_id || null,
        amount: values.amount,
        currency: values.currency,
        expense_date: values.expense_date,
        notes: values.notes || null,
        updated_by: profile.id,
        branch_id: expense.branch_id,
        expense_number: expense.expense_number,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
      toast.success('Expense updated successfully');
      navigate(`/expenses/${expenseId}`);
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'Failed to update expense');
      toast.error(message);
    },
  });

  const onSubmit = (values: ExpenseFormValues) => {
    if (!profile?.id) return;
    updateMutation.mutate(values);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (notFound) {
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

  const expenseNumber = expense?.expense_number ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/expenses">Expenses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/expenses/${expenseId}`}>{expenseNumber ?? 'Expense'}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to={`/expenses/${expenseId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <CreditCard className="h-6 w-6 text-blue-600" />
            Edit Expense
          </h1>
          <p className="text-sm text-muted-foreground">{expenseNumber}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <CreditCard className="h-4 w-4 text-blue-600" />
              Expense Details
            </CardTitle>
            <CardDescription>
              Approval status can&apos;t be changed here — use Approve/Reject on the expense
              detail page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Input id="description" placeholder="Fuel for delivery truck" {...control.register('description')} />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v as ExpenseCategory)}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[]).map((c) => (
                          <SelectItem key={c} value={c}>
                            {EXPENSE_CATEGORY_META[c].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment_id">Shipment (optional)</Label>
                <Controller
                  control={control}
                  name="shipment_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="shipment_id">
                        <SelectValue placeholder="Link to a shipment" />
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

              <div className="space-y-1.5">
                <Label htmlFor="amount">
                  Amount <span className="text-destructive">*</span>
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

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="expense_date">
                  Expense Date <span className="text-destructive">*</span>
                </Label>
                <Input id="expense_date" type="date" {...control.register('expense_date')} />
                {errors.expense_date && (
                  <p className="text-xs text-destructive">{errors.expense_date.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} placeholder="Additional details…" {...control.register('notes')} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link to={`/expenses/${expenseId}`} className="sm:shrink-0">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={updateMutation.isPending} className="w-full sm:w-auto">
            {updateMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
