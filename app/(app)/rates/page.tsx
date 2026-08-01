'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BadgeDollarSign, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/status';
import { useAuth } from '@/contexts/auth-context';
import { useBranchSelector } from '@/hooks/use-branch-selector';
import { BranchSelectField } from '@/components/shared/branch-select-field';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FreightRateCard, ShipmentType } from '@/types';

const SHIPMENT_TYPES: ShipmentType[] = ['air', 'sea', 'road', 'rail', 'multimodal'];

export default function RateCardsPage() {
  const { profile, hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('sales');
  const [rows, setRows] = useState<FreightRateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ existing: FreightRateCard | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('freight_rate_cards')
        .select('*')
        .is('deleted_at', null)
        .order('trade_lane_origin', { ascending: true });
      if (error) throw error;
      setRows((data as FreightRateCard[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!profile) return;
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('freight_rate_cards')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      toast.success('Rate card removed');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove rate card'));
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.trade_lane_origin.toLowerCase().includes(q) ||
      r.trade_lane_destination.toLowerCase().includes(q) ||
      (r.carrier ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <BadgeDollarSign className="h-6 w-6 text-primary" />
            Rate Cards
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buy/sell tariffs per trade lane, so quoting doesn&apos;t start from a blank line.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setDialog({ existing: null })}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Rate Card
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by origin, destination, or carrier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={BadgeDollarSign}
              title="No rate cards yet"
              message="Add a trade lane rate to speed up quoting."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lane</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Buy</TableHead>
                  <TableHead>Sell</TableHead>
                  <TableHead>Margin</TableHead>
                  <TableHead>Valid</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const margin = r.sell_rate - r.buy_rate;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.trade_lane_origin} → {r.trade_lane_destination}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.carrier ?? '—'}</TableCell>
                      <TableCell>
                        {r.shipment_type ? (
                          <Badge variant="outline" className="capitalize">
                            {r.shipment_type}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.container_type ?? '—'}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(r.buy_rate, r.currency)}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(r.sell_rate, r.currency)}</TableCell>
                      <TableCell className="text-sm">
                        <span className={margin >= 0 ? 'text-emerald-700' : 'text-destructive'}>
                          {formatCurrency(margin, r.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.valid_from ?? '—'} – {r.valid_to ?? '—'}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setDialog({ existing: r })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={deletingId === r.id}
                              onClick={() => handleDelete(r.id)}
                            >
                              {deletingId === r.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog && (
        <RateCardFormDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          existing={dialog.existing}
          onSaved={load}
        />
      )}
    </div>
  );
}

function RateCardFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: FreightRateCard | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const {
    needsSelection: needsBranchSelection,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    branchId,
    loading: branchesLoading,
  } = useBranchSelector(profile);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [carrier, setCarrier] = useState('');
  const [shipmentType, setShipmentType] = useState<ShipmentType | ''>('');
  const [containerType, setContainerType] = useState('');
  const [buyRate, setBuyRate] = useState('');
  const [sellRate, setSellRate] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrigin(existing?.trade_lane_origin ?? '');
    setDestination(existing?.trade_lane_destination ?? '');
    setCarrier(existing?.carrier ?? '');
    setShipmentType(existing?.shipment_type ?? '');
    setContainerType(existing?.container_type ?? '');
    setBuyRate(existing ? String(existing.buy_rate) : '');
    setSellRate(existing ? String(existing.sell_rate) : '');
    setCurrency(existing?.currency || 'NGN');
    setValidFrom(existing?.valid_from ?? '');
    setValidTo(existing?.valid_to ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile || !origin.trim() || !destination.trim() || !buyRate || !sellRate) return;
    if (!existing && !branchId) return;
    setSubmitting(true);
    try {
      const payload = {
        trade_lane_origin: origin.trim(),
        trade_lane_destination: destination.trim(),
        carrier: carrier.trim() || null,
        shipment_type: shipmentType || null,
        container_type: containerType.trim() || null,
        buy_rate: Number(buyRate),
        sell_rate: Number(sellRate),
        currency: currency.trim() || 'NGN',
        valid_from: validFrom || null,
        valid_to: validTo || null,
        notes: notes.trim() || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase.from('freight_rate_cards').update(payload).eq('id', existing.id);
        if (error) throw error;
        toast.success('Rate card updated');
      } else {
        const { error } = await supabase
          .from('freight_rate_cards')
          .insert({ ...payload, branch_id: branchId, created_by: profile.id });
        if (error) throw error;
        toast.success('Rate card added');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save rate card'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Rate Card' : 'Add Rate Card'}</DialogTitle>
          <DialogDescription>Buy/sell tariff for a trade lane, carrier, and container type.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!existing && needsBranchSelection && (
            <BranchSelectField
              branches={branches}
              value={selectedBranchId}
              onChange={setSelectedBranchId}
              loading={branchesLoading}
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-origin">Origin</Label>
              <Input id="rc-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-destination">Destination</Label>
              <Input id="rc-destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-carrier">Carrier</Label>
              <Input id="rc-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-type">Shipment Type</Label>
              <Select value={shipmentType} onValueChange={(v) => setShipmentType(v as ShipmentType)}>
                <SelectTrigger id="rc-type">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {SHIPMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-container">Container Type</Label>
            <Input
              id="rc-container"
              value={containerType}
              onChange={(e) => setContainerType(e.target.value)}
              placeholder="20ft, 40ft, 40ft HC…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rc-buy">Buy Rate</Label>
              <Input
                id="rc-buy"
                type="number"
                min="0"
                step="0.01"
                value={buyRate}
                onChange={(e) => setBuyRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-sell">Sell Rate</Label>
              <Input
                id="rc-sell"
                type="number"
                min="0"
                step="0.01"
                value={sellRate}
                onChange={(e) => setSellRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-currency">Currency</Label>
              <Input
                id="rc-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-valid-from">Valid From</Label>
              <Input id="rc-valid-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-valid-to">Valid To</Label>
              <Input id="rc-valid-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !origin.trim() ||
              !destination.trim() ||
              !buyRate ||
              !sellRate ||
              (!existing && !branchId)
            }
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Add Rate Card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
