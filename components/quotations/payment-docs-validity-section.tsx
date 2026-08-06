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
} from '@/lib/quotation-constants';
import { resolveRequiredDocuments } from '@/lib/quotation-rules';
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

/**
 * Section 7 — Required Documents checklist. Fully reactive: recomputes
 * on every change of direction/mode/incoterm/services, not just a
 * one-time prefill — e.g. switching to Export immediately drops PAAR,
 * switching to Air immediately adds Air Waybill.
 *
 * Distinguishes "the engine put this here" from "the user checked this
 * by hand": a ref tracks exactly which documents were last
 * auto-applied. A document only gets pruned when it's both (a) no
 * longer in the freshly computed set AND (b) was part of the previous
 * auto-applied set — so a manual addition unrelated to the changed
 * context is never touched.
 */
export function RequiredDocumentsSection() {
  const { watch, getValues, setValue } = useFormContext<QuotationFormValues>();
  const selected = watch('required_documents') ?? [];
  const direction = watch('shipment_direction');
  const shipmentType = watch('shipment_type');
  const incoterm = watch('incoterm');
  const services = watch('services') ?? [];

  const lastAutoApplied = useRef<Set<string>>(new Set());
  useEffect(() => {
    const computed = new Set(
      resolveRequiredDocuments({
        shipment_direction: direction,
        shipment_type: shipmentType,
        incoterm,
        services,
      })
    );
    const current = getValues('required_documents') ?? [];
    const prevAuto = lastAutoApplied.current;

    const next = current.filter((d) => !prevAuto.has(d) || computed.has(d));
    for (const d of computed) {
      if (!next.includes(d)) next.push(d);
    }

    const changed = next.length !== current.length || next.some((d, i) => d !== current[i]);
    if (changed) {
      setValue('required_documents', next, { shouldDirty: true });
    }
    lastAutoApplied.current = computed;
    // services is an array — join it so the effect only re-fires when its
    // actual membership changes, not on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, shipmentType, incoterm, services.join('|'), getValues, setValue]);

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
