'use client';

import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { QuickCreateCustomerDialog } from '@/features/quotations/components/quick-create-customer-dialog';
import type { QuotationFormValues } from '@/shared/lib/quotation-schema';
import type { Customer, Profile } from '@/shared/types';

interface CustomerSectionProps {
  customers: Customer[];
  loadingCustomers: boolean;
  salesReps: Profile[];
  branchId: string | null;
  onCustomerCreated: (customer: Customer) => void;
}

/** Section 1 — Customer Information. */
export function CustomerSection({
  customers,
  loadingCustomers,
  salesReps,
  branchId,
  onCustomerCreated,
}: CustomerSectionProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Customer Information</CardTitle>
        <CardDescription>Who this quotation is for, and who to contact about it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="customer_id">
                Customer <span className="text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus className="mr-1 h-3.5 w-3.5" />
                New Customer
              </Button>
            </div>
            <Controller
              control={control}
              name="customer_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="customer_id">
                    <SelectValue
                      placeholder={loadingCustomers ? 'Loading customers…' : 'Select a customer'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 && !loadingCustomers ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No active customers found.
                      </div>
                    ) : (
                      customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.company_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.customer_id && (
              <p className="text-xs text-destructive">{errors.customer_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact_person">Contact Person</Label>
            <Input id="contact_person" placeholder="Jane Doe" {...register('contact_person')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sales_rep_id">Sales Representative</Label>
            <Controller
              control={control}
              name="sales_rep_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="sales_rep_id">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact_email">Email</Label>
            <Input
              id="contact_email"
              type="email"
              placeholder="jane@customer.com"
              {...register('contact_email')}
            />
            {errors.contact_email && (
              <p className="text-xs text-destructive">{errors.contact_email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact_phone">Phone</Label>
            <Input id="contact_phone" placeholder="+234…" {...register('contact_phone')} />
          </div>
        </div>
      </CardContent>

      <QuickCreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branchId={branchId}
        onCreated={onCustomerCreated}
      />
    </Card>
  );
}
