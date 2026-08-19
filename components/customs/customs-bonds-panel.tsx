'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage, cn } from '@/lib/utils';
import { formatDate, formatCurrency } from '@/lib/utils/status';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type { CustomsBond, CustomsBondType, CustomsBondStatus } from '@/types';

const BOND_TYPE_LABELS: Record<CustomsBondType, string> = {
  single_entry: 'Single Entry',
  continuous: 'Continuous (Annual)',
  bonded_warehouse: 'Bonded Warehouse',
  transit: 'Transit / In-Bond',
  other: 'Other',
};

const BOND_STATUS_META: Record<CustomsBondStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700' },
  discharged: { label: 'Discharged', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-700' },
  claimed_against: { label: 'Claimed Against', color: 'bg-amber-100 text-amber-700' },
};

interface CustomsBondsPanelProps {
  shipmentId: string;
  branchId: string;
  bonds: CustomsBond[];
  onReload: () => void;
}

export function CustomsBondsPanel({ shipmentId, branchId, bonds, onReload }: CustomsBondsPanelProps) {
  const { hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('customs');
  const [dialog, setDialog] = useState<{ existing: CustomsBond | null } | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText className="h-4 w-4 text-primary" />
          Customs Bonds
        </CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ existing: null })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Bond
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {bonds.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No customs bond recorded for this shipment.
          </div>
        ) : (
          <div className="space-y-3">
            {bonds.map((b) => (
              <div
                key={b.id}
                className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
                onClick={() => canManage && setDialog({ existing: b })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-medium">
                      {b.bond_number || 'Bond'}
                      <Badge className={cn('ml-2 align-middle', BOND_STATUS_META[b.status].color)}>
                        {BOND_STATUS_META[b.status].label}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground">
                      {BOND_TYPE_LABELS[b.bond_type]}
                      {b.surety_name && ` · ${b.surety_name}`}
                      {b.bond_amount != null && ` · ${formatCurrency(b.bond_amount, b.currency)}`}
                    </p>
                    {(b.issue_date || b.expiry_date) && (
                      <p className="text-xs text-muted-foreground">
                        {b.issue_date ? formatDate(b.issue_date) : '—'} to {b.expiry_date ? formatDate(b.expiry_date) : '—'}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); setDialog({ existing: b }); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {dialog && (
        <CustomsBondFormDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          shipmentId={shipmentId}
          branchId={branchId}
          existing={dialog.existing}
          onSaved={onReload}
        />
      )}
    </Card>
  );
}

function CustomsBondFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: CustomsBond | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [bondNumber, setBondNumber] = useState('');
  const [bondType, setBondType] = useState<CustomsBondType>('single_entry');
  const [suretyName, setSuretyName] = useState('');
  const [bondAmount, setBondAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState<CustomsBondStatus>('active');
  const [dischargedDate, setDischargedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBondNumber(existing?.bond_number ?? '');
    setBondType(existing?.bond_type ?? 'single_entry');
    setSuretyName(existing?.surety_name ?? '');
    setBondAmount(existing?.bond_amount != null ? String(existing.bond_amount) : '');
    setCurrency(existing?.currency || 'NGN');
    setIssueDate(existing?.issue_date ?? '');
    setExpiryDate(existing?.expiry_date ?? '');
    setStatus(existing?.status ?? 'active');
    setDischargedDate(existing?.discharged_date ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const payload = {
        bond_number: bondNumber.trim() || null,
        bond_type: bondType,
        surety_name: suretyName.trim() || null,
        bond_amount: bondAmount ? Number(bondAmount) : null,
        currency: currency.trim() || 'NGN',
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        status,
        discharged_date: dischargedDate || null,
        notes: notes.trim() || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase.from('customs_bonds').update(payload).eq('id', existing.id);
        if (error) throw error;
        toast.success('Bond updated');
      } else {
        const { error } = await supabase
          .from('customs_bonds')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id });
        if (error) throw error;
        toast.success('Bond added');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save bond'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Customs Bond' : 'Add Customs Bond'}</DialogTitle>
          <DialogDescription>
            The financial guarantee posted with customs to secure duty payment on this shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bond-number">Bond Number</Label>
              <Input id="bond-number" value={bondNumber} onChange={(e) => setBondNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bond-type">Bond Type</Label>
              <Select value={bondType} onValueChange={(v) => setBondType(v as CustomsBondType)}>
                <SelectTrigger id="bond-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(BOND_TYPE_LABELS) as CustomsBondType[]).map((t) => (
                    <SelectItem key={t} value={t}>{BOND_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bond-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CustomsBondStatus)}>
                <SelectTrigger id="bond-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(BOND_STATUS_META) as CustomsBondStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{BOND_STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bond-surety">Surety (Bank/Insurer)</Label>
              <Input id="bond-surety" value={suretyName} onChange={(e) => setSuretyName(e.target.value)} placeholder="e.g. Zenith Bank" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bond-amount">Bond Amount</Label>
              <Input id="bond-amount" type="number" min="0" step="0.01" value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bond-currency">Currency</Label>
              <Input id="bond-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bond-issue">Issue Date</Label>
              <Input id="bond-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bond-expiry">Expiry Date</Label>
              <Input id="bond-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bond-discharged">Discharged Date</Label>
              <Input id="bond-discharged" type="date" value={dischargedDate} onChange={(e) => setDischargedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bond-notes">Notes</Label>
            <Textarea id="bond-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Add Bond'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
