'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { QUOTATION_SERVICES } from '@/lib/quotation-constants';
import { resolveChargeTemplate } from '@/lib/quotation-rules';
import type { QuotationFormValues } from '@/lib/quotation-schema';

/**
 * Section 4 — Services Required. Checking a service seeds a matching
 * charge row (Section 7's "Auto-generate Charges") via the centralized
 * rules engine's resolveChargeTemplate, so the description is
 * mode-aware (e.g. "Ocean Freight" vs "Air Freight") without this
 * component knowing the naming rules itself.
 */
export function ServicesSection() {
  const { control, watch, setValue } = useFormContext<QuotationFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const services = watch('services') ?? [];
  const items = watch('items') ?? [];
  const shipmentType = watch('shipment_type');

  const toggleService = (key: string, checked: boolean) => {
    if (checked) {
      setValue('services', [...services, key]);
      const template = resolveChargeTemplate(key, { shipment_type: shipmentType });
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
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-accent/50"
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
