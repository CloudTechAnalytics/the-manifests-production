'use client';

import { useEffect, useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PAYMENT_TERMS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  REQUIRED_DOCUMENT_OPTIONS,
  getDefaultRequiredDocuments,
} from '@/lib/quotation-constants';
import type { QuotationFormValues } from '@/lib/quotation-schema';
import type { QuotationPriority } from '@/types';

const PRIORITY_OPTIONS: { value: QuotationPriority; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'vip', label: 'VIP' },
];

/** Section 6 — Payment Terms. */
export function PaymentTermsSection() {
  const { control } = useFormContext<QuotationFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Payment Terms</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="payment_terms">Payment Terms</Label>
          <Controller
            control={control}
            name="payment_terms"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="payment_terms">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment_method">Payment Method</Label>
          <Controller
            control={control}
            name="payment_method"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="payment_method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** Section 7 — Required Documents checklist. */
export function RequiredDocumentsSection() {
  const { watch, getValues, setValue } = useFormContext<QuotationFormValues>();
  const selected = watch('required_documents') ?? [];
  const direction = watch('shipment_direction');

  // Pre-fill the standard checklist for the chosen direction the first
  // time it's picked — guarded on "still empty" so it never clobbers a
  // manual edit made afterwards.
  const lastAppliedDirection = useRef<string | null>(null);
  useEffect(() => {
    if (!direction || direction === lastAppliedDirection.current) return;
    if ((getValues('required_documents') ?? []).length === 0) {
      setValue('required_documents', getDefaultRequiredDocuments(direction));
    }
    lastAppliedDirection.current = direction;
  }, [direction, getValues, setValue]);

  const toggle = (doc: string, checked: boolean) => {
    setValue(
      'required_documents',
      checked ? [...selected, doc] : selected.filter((d) => d !== doc)
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Required Documents</CardTitle>
        <CardDescription>
          What the customer should expect to provide — Operations sees this at a glance once the
          shipment is live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {REQUIRED_DOCUMENT_OPTIONS.map((doc) => (
            <label
              key={doc}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-accent/50"
            >
              <Checkbox
                checked={selected.includes(doc)}
                onCheckedChange={(c) => toggle(doc, c === true)}
              />
              {doc}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Section 8 — Validity, priority, and notes. */
export function ValiditySection() {
  const { control, register } = useFormContext<QuotationFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Validity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="valid_until">
              Quotation Valid Until <span className="text-destructive">*</span>
            </Label>
            <Input id="valid_until" type="date" {...register('valid_until')} />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-wrap gap-4 pt-2"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={p.value} />
                      {p.label}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Internal Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            placeholder="Notes visible only to your team…"
            {...register('notes')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer_notes">Customer Notes</Label>
          <Textarea
            id="customer_notes"
            rows={3}
            placeholder="Notes that will appear on the quotation the customer sees…"
            {...register('customer_notes')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="terms">Terms &amp; Conditions</Label>
          <Textarea
            id="terms"
            rows={4}
            placeholder="Payment terms, delivery conditions, etc."
            {...register('terms')}
          />
        </div>
      </CardContent>
    </Card>
  );
}
