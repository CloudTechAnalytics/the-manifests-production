'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { formatDate } from '@/shared/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { TerminalFormDialog } from '@/features/terminal/components/terminal-form-dialog';
import type { TerminalOperation } from '@/shared/types';

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

interface TerminalPlanningCardProps {
  shipmentId: string;
  branchId: string;
  terminal: TerminalOperation | null;
  onChanged: () => void;
}

export function TerminalPlanningCard({ shipmentId, branchId, terminal, onChanged }: TerminalPlanningCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Terminal Planning</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          {terminal ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {terminal ? 'Edit' : 'Add'}
        </Button>
      </CardHeader>
      <CardContent>
        {!terminal ? (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            No terminal record for this shipment yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoRow label="Terminal" value={terminal.terminal_name || '—'} />
            <InfoRow label="Terminal Contact" value={terminal.terminal_contact || '—'} />
            <InfoRow label="Booking Slot" value={terminal.booking_slot || '—'} />
            <InfoRow label="Terminal Reference" value={terminal.terminal_reference || '—'} />
            <InfoRow label="Expected Gate In" value={formatDate(terminal.expected_gate_in)} />
            <InfoRow label="Expected Gate Out" value={formatDate(terminal.expected_gate_out)} />
            <InfoRow label="Expected DO Collection" value={formatDate(terminal.expected_delivery_order_collection)} />
          </div>
        )}
      </CardContent>

      <TerminalFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        shipmentId={shipmentId}
        branchId={branchId}
        existing={terminal}
        onSaved={onChanged}
      />
    </Card>
  );
}
