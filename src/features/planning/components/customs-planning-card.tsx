'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { formatDate } from '@/shared/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { CustomsFormDialog } from '@/features/customs/components/customs-form-dialog';
import type { ShipmentCustoms, ShipmentStage } from '@/shared/types';

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

interface CustomsPlanningCardProps {
  shipmentId: string;
  branchId: string;
  customs: ShipmentCustoms | null;
  customsOfficerStage: ShipmentStage | undefined;
  onChanged: () => void;
}

export function CustomsPlanningCard({
  shipmentId,
  branchId,
  customs,
  customsOfficerStage,
  onChanged,
}: CustomsPlanningCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Customs Planning</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          {customs ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {customs ? 'Edit' : 'Add'}
        </Button>
      </CardHeader>
      <CardContent>
        {!customs ? (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            No customs record for this shipment yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoRow
              label="Customs Officer"
              value={
                customsOfficerStage?.assigned_user?.full_name ?? (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                    Unassigned
                  </Badge>
                )
              }
            />
            <InfoRow label="Expected PAAR" value={formatDate(customs.expected_paar_date)} />
            <InfoRow label="Expected Declaration" value={formatDate(customs.expected_declaration_date)} />
            <InfoRow label="Expected Duty Payment" value={formatDate(customs.expected_duty_payment_date)} />
            <InfoRow label="Expected Examination" value={formatDate(customs.expected_examination_date)} />
            <InfoRow label="Expected Release" value={formatDate(customs.expected_release_date)} />
            <InfoRow label="Expected Exit" value={formatDate(customs.expected_exit_date)} />
          </div>
        )}
      </CardContent>

      <CustomsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        shipmentId={shipmentId}
        branchId={branchId}
        existing={customs}
        onSaved={onChanged}
      />
    </Card>
  );
}
