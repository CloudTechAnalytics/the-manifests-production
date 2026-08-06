'use client';

import { useFormContext } from 'react-hook-form';
import { Ship, Plane, Truck, Package2, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDate } from '@/lib/utils/status';
import { QUOTATION_SERVICES, paymentTermsLabel } from '@/lib/quotation-constants';
import { computeQuotationTotals, computeQuotationCompleteness } from '@/lib/quotation-schema';
import type { QuotationFormValues } from '@/lib/quotation-schema';
import type { Customer, QuotationStatus } from '@/types';
import { QUOTATION_STATUS_META } from '@/lib/utils/status';

const MODE_ICON = { air: Plane, sea: Ship, road: Truck, rail: Truck, multimodal: Package2 };

interface QuotationSummaryPanelProps {
  customers: Customer[];
  /** Only present once the quotation exists — the panel omits Status on New. */
  status?: QuotationStatus;
}

/**
 * Section 11 — sticky live summary. Pure read of the same form state the
 * rest of the page edits, via useFormContext, so there's no separate
 * state to keep in sync.
 */
export function QuotationSummaryPanel({ customers, status }: QuotationSummaryPanelProps) {
  const { watch } = useFormContext<QuotationFormValues>();
  const values = watch();

  const customer = customers.find((c) => c.id === values.customer_id);
  const totals = computeQuotationTotals(values.items ?? []);
  const ModeIcon = values.shipment_type ? MODE_ICON[values.shipment_type] : MapPin;
  const statusMeta = status ? QUOTATION_STATUS_META[status] : null;
  const showCompleteness = !status || status === 'draft' || status === 'pending_approval';
  const completeness = computeQuotationCompleteness(values);

  return (
    <Card className="sticky top-6 border-primary/20 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Quotation Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMeta && (
          <Badge variant="secondary" className={statusMeta.color}>
            {statusMeta.label}
          </Badge>
        )}

        {showCompleteness && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Quotation Completion</span>
              <span className="font-medium">{completeness}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span className="max-w-[60%] truncate text-right font-medium">
              {customer?.company_name ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Direction</span>
            <span className="font-medium capitalize">{values.shipment_direction || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Mode</span>
            <span className="flex items-center gap-1.5 font-medium capitalize">
              <ModeIcon className="h-3.5 w-3.5 text-primary" />
              {values.shipment_type || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Origin</span>
            <span className="max-w-[60%] truncate text-right font-medium">
              {values.origin_port || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Destination</span>
            <span className="max-w-[60%] truncate text-right font-medium">
              {values.destination_port || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Incoterm</span>
            <span className="font-medium">{values.incoterm || '—'}</span>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Containers</span>
            <span className="font-medium">
              {values.container_count ? `${values.container_count} × ${values.container_size || '—'}` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Weight</span>
            <span className="font-medium">
              {values.weight ? `${values.weight} ${values.weight_unit}` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CBM</span>
            <span className="font-medium">{values.cbm || '—'}</span>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Services Selected
          </p>
          {values.services && values.services.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {values.services.map((key) => {
                const service = QUOTATION_SERVICES.find((s) => s.key === key);
                return (
                  <Badge key={key} variant="outline" className="text-[11px]">
                    {service?.label ?? key}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">None selected</p>
          )}
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Payment Terms</span>
            <span className="max-w-[60%] truncate text-right font-medium">
              {values.payment_terms ? paymentTermsLabel(values.payment_terms) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Validity</span>
            <span className="font-medium">{values.valid_until ? formatDate(values.valid_until) : '—'}</span>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(totals.subtotal, values.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-medium text-amber-700">
              -{formatCurrency(totals.discountAmount, values.currency)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">VAT</span>
            <span className="font-medium">{formatCurrency(totals.taxAmount, values.currency)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Grand Total</span>
            <span className="font-bold text-primary">
              {formatCurrency(totals.total, values.currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
