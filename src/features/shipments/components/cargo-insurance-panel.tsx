'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import {
  deleteCargoInsurancePolicy,
  saveCargoInsurancePolicy,
} from '@/features/shipments/services/shipments.service';
import { getErrorMessage } from '@/shared/lib/utils';
import { formatDate, formatCurrency } from '@/shared/lib/utils/status';
import { useAuth } from '@/shared/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/components/ui/dialog';
import type { CargoInsurancePolicy } from '@/shared/types';

interface CargoInsurancePanelProps {
  shipmentId: string;
  branchId: string;
  policies: CargoInsurancePolicy[];
  onReload: () => void;
}

export function CargoInsurancePanel({
  shipmentId,
  branchId,
  policies,
  onReload,
}: CargoInsurancePanelProps) {
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('documentation');
  const [dialog, setDialog] = useState<{ existing: CargoInsurancePolicy | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!profile) throw new Error('Not ready');
      return deleteCargoInsurancePolicy({ policyId: id, updatedBy: profile.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      toast.success('Policy removed');
      onReload();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to remove policy'));
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-4 w-4 text-primary" />
          Cargo Insurance
        </CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ existing: null })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Policy
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {policies.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No cargo insurance policy recorded for this shipment.
          </div>
        ) : (
          <div className="space-y-3">
            {policies.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between rounded-lg border border-border p-3"
              >
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-medium">
                    {p.insurer_name}
                    {p.policy_number && (
                      <span className="ml-2 text-xs text-muted-foreground">#{p.policy_number}</span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    Coverage:{' '}
                    {p.coverage_amount != null ? formatCurrency(p.coverage_amount, p.currency) : '—'}
                    {p.premium_amount != null &&
                      ` · Premium: ${formatCurrency(p.premium_amount, p.currency)}`}
                  </p>
                  {(p.start_date || p.end_date) && (
                    <p className="text-xs text-muted-foreground">
                      {p.start_date ? formatDate(p.start_date) : '—'} to{' '}
                      {p.end_date ? formatDate(p.end_date) : '—'}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setDialog({ existing: p })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={deletingId === p.id}
                      onClick={() => handleDelete(p.id)}
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {dialog && (
        <InsurancePolicyFormDialog
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

function InsurancePolicyFormDialog({
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
  existing: CargoInsurancePolicy | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [insurerName, setInsurerName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [coverageAmount, setCoverageAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [premiumAmount, setPremiumAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveCargoInsurancePolicy>[0]['payload']) => {
      if (!profile) throw new Error('Not ready');
      return saveCargoInsurancePolicy({
        shipmentId,
        branchId,
        existingId: existing?.id ?? null,
        payload,
        updatedBy: profile.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      toast.success(existing ? 'Policy updated' : 'Policy added');
      onOpenChange(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save policy'));
    },
  });
  const submitting = saveMutation.isPending;

  useEffect(() => {
    if (!open) return;
    setInsurerName(existing?.insurer_name ?? '');
    setPolicyNumber(existing?.policy_number ?? '');
    setCoverageAmount(existing?.coverage_amount != null ? String(existing.coverage_amount) : '');
    setCurrency(existing?.currency || 'NGN');
    setPremiumAmount(existing?.premium_amount != null ? String(existing.premium_amount) : '');
    setStartDate(existing?.start_date ?? '');
    setEndDate(existing?.end_date ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const handleSubmit = () => {
    if (!insurerName.trim()) return;
    saveMutation.mutate({
      insurer_name: insurerName.trim(),
      policy_number: policyNumber.trim() || null,
      coverage_amount: coverageAmount ? Number(coverageAmount) : null,
      currency: currency.trim() || 'NGN',
      premium_amount: premiumAmount ? Number(premiumAmount) : null,
      start_date: startDate || null,
      end_date: endDate || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Insurance Policy' : 'Add Insurance Policy'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ip-insurer">Insurer Name</Label>
              <Input id="ip-insurer" value={insurerName} onChange={(e) => setInsurerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-policy">Policy Number</Label>
              <Input id="ip-policy" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ip-coverage">Coverage Amount</Label>
              <Input
                id="ip-coverage"
                type="number"
                min="0"
                step="0.01"
                value={coverageAmount}
                onChange={(e) => setCoverageAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-premium">Premium Amount</Label>
              <Input
                id="ip-premium"
                type="number"
                min="0"
                step="0.01"
                value={premiumAmount}
                onChange={(e) => setPremiumAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-currency">Currency</Label>
              <Input
                id="ip-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ip-start">Start Date</Label>
              <Input id="ip-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-end">End Date</Label>
              <Input id="ip-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ip-notes">Notes</Label>
            <Textarea id="ip-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting || !insurerName.trim()}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Add Policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
