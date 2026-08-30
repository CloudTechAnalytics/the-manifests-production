'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SHIPMENT_STATUS_META, formatCurrency } from '@/lib/utils/status';
import type { Shipment, ShipmentContainer } from '@/types';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

interface PlanningShipmentHeaderProps {
  shipment: Shipment;
  containers: ShipmentContainer[];
}

/**
 * Read-only — everything here already exists on the Shipment. Nothing in
 * this block is editable; Planning coordinates execution, it doesn't
 * recreate the shipment.
 */
export function PlanningShipmentHeader({ shipment, containers }: PlanningShipmentHeaderProps) {
  const statusMeta = SHIPMENT_STATUS_META[shipment.status] ?? {
    label: shipment.status ?? 'Unknown',
    color: 'bg-muted text-muted-foreground',
  };

  const containerSummary =
    containers.length > 0
      ? `${containers.length} x ${containers[0].container_type || 'container'}`
      : '—';

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/shipments/${shipment.id}`} className="font-serif text-lg font-bold text-primary hover:underline">
            {shipment.reference_number ?? 'Shipment'}
          </Link>
          <Badge variant="secondary" className={statusMeta.color}>
            {statusMeta.label}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <InfoRow label="Customer" value={shipment.customer?.company_name ?? '—'} />
          <InfoRow label="Route" value={`${shipment.origin ?? '—'} → ${shipment.destination ?? '—'}`} />
          <InfoRow label="Container" value={containerSummary} />
          <InfoRow label="Commodity" value={shipment.commodity ?? '—'} />
          <InfoRow label="Incoterm" value={shipment.incoterm ?? '—'} />
          <InfoRow
            label="Weight"
            value={shipment.chargeable_weight != null ? `${shipment.chargeable_weight.toLocaleString()} KG` : '—'}
          />
          <InfoRow
            label="Goods Value"
            value={shipment.goods_value != null ? formatCurrency(shipment.goods_value, shipment.goods_value_currency) : '—'}
          />
          <InfoRow label="Current Stage" value={statusMeta.label} />
        </div>
      </CardContent>
    </Card>
  );
}
