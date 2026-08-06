'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { resolveScopeOfServiceLabel, resolveExcludedServiceOptions } from '@/lib/quotation-rules';
import type { QuotationFormValues } from '@/lib/quotation-schema';

/**
 * Scope of Service — both lists are fully computed from `services`,
 * never manually edited, so they can never contradict each other or
 * what's actually selected: Included mirrors `services` directly (same
 * as before); Not Included is the developer-defined catalog minus
 * whatever's tied to an already-selected service (e.g. selecting
 * Examination removes "Examination Charges" from Not Included). No
 * checkboxes here — see resolveExcludedServiceOptions() for the rule.
 */
export function ScopeOfServiceSection() {
  const { watch, setValue } = useFormContext<QuotationFormValues>();
  const services = watch('services') ?? [];
  const excludedOptions = resolveExcludedServiceOptions(services);

  // excluded_services is stored (not just derived at render time) so a
  // saved quotation's PDF/detail view reflects what applied at save
  // time, without needing to re-run this logic outside the form.
  useEffect(() => {
    setValue(
      'excluded_services',
      excludedOptions.map((o) => o.label),
      { shouldDirty: false }
    );
    // excludedOptions is recomputed fresh every render from `services` —
    // depending on its identity would loop, so depend on the actual
    // membership that drives it instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.join('|'), setValue]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Scope of Service</CardTitle>
        <CardDescription>What this quotation covers, and what it explicitly doesn&apos;t — both update instantly as services change.</CardDescription>
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
              {services.map((key) => (
                <li key={key} className="flex animate-in items-center gap-2 fade-in slide-in-from-left-1 duration-200">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  {resolveScopeOfServiceLabel(key)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Not Included
          </p>
          {excludedOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything in the standard scope is included.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {excludedOptions.map((option) => (
                <li
                  key={option.label}
                  className="flex animate-in items-center gap-2 fade-in slide-in-from-left-1 duration-200"
                >
                  <X className="h-3.5 w-3.5 shrink-0 text-red-600" />
                  {option.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
