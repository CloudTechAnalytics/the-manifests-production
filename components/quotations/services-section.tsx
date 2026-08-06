'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { QUOTATION_SERVICES } from '@/lib/quotation-constants';
import { resolveChargeTemplate, resolveDefaultRate } from '@/lib/quotation-rules';
import type { QuotationFormValues } from '@/lib/quotation-schema';

interface ServicesSectionProps {
  branchId: string | null;
}

/**
 * Section 4 — Services Required. Checking a service seeds a matching
 * charge row (Section 7's "Auto-generate Charges") via the centralized
 * rules engine's resolveChargeTemplate, so the description is
 * mode-aware (e.g. "Ocean Freight" vs "Air Freight") without this
 * component knowing the naming rules itself. The row appears instantly
 * at a zero rate — resolveDefaultRate() then fills it in from the
 * existing Rate Cards table (freight_rate_cards) a moment later if a
 * matching trade lane is configured, without blocking the checkbox.
 */
export function ServicesSection({ branchId }: ServicesSectionProps) {
  const { control, watch, setValue, getValues } = useFormContext<QuotationFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const services = watch('services') ?? [];
  const items = watch('items') ?? [];
  const shipmentType = watch('shipment_type');
  const originPort = watch('origin_port');
  const destinationPort = watch('destination_port');

  const toggleService = (key: string, checked: boolean) => {
    if (checked) {
      setValue('services', [...services, key]);
      const template = resolveChargeTemplate(key, { shipment_type: shipmentType });
      const newIndex = fields.length;
      append({
        service_key: key,
        description: template.description,
        quantity: 1,
        unit_price: 0,
        discount_rate: 0,
        tax_rate: 0,
        unit: '',
        notes: '',
        billing_basis: '',
        cost_centre: '',
        gl_account: '',
        internal_reference: '',
        tax_code: '',
      });

      resolveDefaultRate(key, {
        branchId,
        originPort: originPort ?? '',
        destinationPort: destinationPort ?? '',
        shipmentType,
      }).then((rate) => {
        if (rate == null) return;
        // The row may have moved (drag-reorder) or been removed by the
        // time the lookup resolves — find it by service_key + still-zero
        // price rather than trusting the captured index.
        const current = getValues('items');
        const stillAt = current[newIndex]?.service_key === key ? newIndex : current.findIndex((i) => i.service_key === key && i.unit_price === 0);
        if (stillAt >= 0 && current[stillAt].unit_price === 0) {
          setValue(`items.${stillAt}.unit_price`, rate, { shouldDirty: true });
        }
      });
    } else {
      setValue(
        'services',
        services.filter((s) => s !== key)
      );
      // Remove charge rows this service generated — walk backwards since
      // remove() shifts indices.
      for (let i = fields.length - 1; i >= 0; i--) {
        if (items[i]?.service_key === key) remove(i);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Services Required</CardTitle>
        <CardDescription>Selecting a service adds a matching row to the charge breakdown.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {QUOTATION_SERVICES.map((service) => (
            <label
              key={service.key}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent/50"
            >
              <Checkbox
                checked={services.includes(service.key)}
                onCheckedChange={(checked) => toggleService(service.key, checked === true)}
              />
              {service.label}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
