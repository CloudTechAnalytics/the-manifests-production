'use client';

import { useFormContext } from 'react-hook-form';
import { Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { QUOTATION_SERVICES, NOT_INCLUDED_SERVICE_OPTIONS } from '@/lib/quotation-constants';
import type { QuotationFormValues } from '@/lib/quotation-schema';

/**
 * Scope of Service — Included mirrors the Services Required checklist
 * (Section 4), read-only here so there's no second source of truth that
 * could drift; Not Included is its own checklist writing to
 * `excluded_services`.
 */
export function ScopeOfServiceSection() {
  const { watch, setValue } = useFormContext<QuotationFormValues>();
  const services = watch('services') ?? [];
  const excluded = watch('excluded_services') ?? [];

  const toggle = (item: string, checked: boolean) => {
    setValue('excluded_services', checked ? [...excluded, item] : excluded.filter((e) => e !== item));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Scope of Service</CardTitle>
        <CardDescription>What this quotation covers, and what it explicitly doesn&apos;t.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Included Services
          </p>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select services above to include them here.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {services.map((key) => {
                const service = QUOTATION_SERVICES.find((s) => s.key === key);
                return (
                  <li key={key} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {service?.label ?? key}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Not Included
          </p>
          <div className="space-y-1.5">
            {NOT_INCLUDED_SERVICE_OPTIONS.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={excluded.includes(item)}
                  onCheckedChange={(checked) => toggle(item, checked === true)}
                />
                <X className="h-3.5 w-3.5 shrink-0 text-red-600" />
                {item}
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
