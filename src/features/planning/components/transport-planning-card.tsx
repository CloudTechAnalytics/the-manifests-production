'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { formatDate, formatCurrency } from '@/shared/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { TransportationFormDialog } from '@/features/transportation/components/transportation-form-dialog';
import type { ShipmentTransportation } from '@/shared/types';

interface TransportPlanningCardProps {
  shipmentId: string;
  branchId: string;
  legs: ShipmentTransportation[];
  onChanged: () => void;
}

export function TransportPlanningCard({ shipmentId, branchId, legs, onChanged }: TransportPlanningCardProps) {
  const [dialog, setDialog] = useState<{ existing: ShipmentTransportation | null } | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Transport Planning</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ existing: null })}>
          <Plus className="h-3.5 w-3.5" />
          Add Leg
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {legs.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            No transportation legs planned yet.
          </div>
        ) : (
          legs.map((leg) => (
            <div
              key={leg.id}
              className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
              onClick={() => setDialog({ existing: leg })}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {[leg.transport_company, leg.truck_number, leg.driver_name].filter(Boolean).join(' · ') ||
                    'Leg details pending'}
                </span>
                {leg.escort_required && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                    Escort required
                  </Badge>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <span>Pickup: {leg.pickup_address || '—'}</span>
                <span>Delivery: {leg.delivery_address || '—'}</span>
                <span>Exp. Pickup: {formatDate(leg.expected_pickup_date)}</span>
                <span>Exp. Delivery: {formatDate(leg.expected_delivery_date)}</span>
                <span>Truck Type: {leg.truck_type || '—'}</span>
                <span>Route: {leg.route || '—'}</span>
                <span>Distance: {leg.estimated_distance_km != null ? `${leg.estimated_distance_km} km` : '—'}</span>
                <span>Est. Cost: {leg.estimated_transport_cost != null ? formatCurrency(leg.estimated_transport_cost) : '—'}</span>
                <span>
                  Delivery Contact:{' '}
                  {[leg.delivery_contact_name, leg.delivery_contact_phone].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {dialog && (
        <TransportationFormDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          shipmentId={shipmentId}
          branchId={branchId}
          existing={dialog.existing}
          onSaved={onChanged}
        />
      )}
    </Card>
  );
}
