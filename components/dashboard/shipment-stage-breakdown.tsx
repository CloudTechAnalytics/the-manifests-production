'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useShipmentStageCounts, type ShipmentStageCounts } from '@/hooks/use-shipment-stage-counts';

const TILES: { key: keyof ShipmentStageCounts; label: string; href: string }[] = [
  { key: 'planning', label: 'Planning', href: '/planning' },
  { key: 'documentation', label: 'Documentation', href: '/documents' },
  { key: 'awaitingCustoms', label: 'Awaiting Customs', href: '/customs' },
  { key: 'customsClearance', label: 'Customs Clearance', href: '/customs' },
  { key: 'terminalProcessing', label: 'Terminal', href: '/terminal' },
  { key: 'cargoExamination', label: 'Examination', href: '/examination' },
  { key: 'released', label: 'Released', href: '/terminal' },
  { key: 'transport', label: 'Transport', href: '/transportation' },
  { key: 'delivered', label: 'Delivered', href: '/shipments' },
  { key: 'completed', label: 'Completed', href: '/shipments' },
];

/**
 * Item 18 — live per-department shipment counters, sourced from
 * shipment_stages (the granular 12-stage lifecycle) rather than the
 * coarser top-line KPI row above, which already covers the
 * highest-level buckets. No manual refresh: useShipmentStageCounts
 * re-queries on mount, same as every other dashboard widget.
 */
export function ShipmentStageBreakdown() {
  const { counts, loading } = useShipmentStageCounts();

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Shipment Stage Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0 sm:grid-cols-5">
        {TILES.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className="rounded-lg border border-border p-3 text-center transition-colors hover:bg-accent/50"
          >
            {loading ? (
              <Skeleton className="mx-auto h-7 w-10" />
            ) : (
              <p className="text-2xl font-bold text-primary">{counts[tile.key]}</p>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.label}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
