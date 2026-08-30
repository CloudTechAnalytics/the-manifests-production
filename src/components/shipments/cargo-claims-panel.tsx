'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, ShieldAlert } from 'lucide-react';
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
import type { CargoClaim, CargoClaimType, CargoClaimAgainst, CargoClaimStatus, CargoInsurancePolicy } from '@/types';

const CLAIM_TYPE_LABELS: Record<CargoClaimType, string> = {
  damage: 'Damage',
  loss: 'Loss',
  shortage: 'Shortage',
  other: 'Other',
};

const CLAIM_AGAINST_LABELS: Record<CargoClaimAgainst, string> = {
  carrier: 'Carrier',
  terminal: 'Terminal',
  insurer: 'Insurer',
  transporter: 'Transporter',
  other: 'Other',
};

const CLAIM_STATUS_META: Record<CargoClaimStatus, { label: string; color: string }> = {
  filed: { label: 'Filed', color: 'bg-blue-100 text-blue-700' },
  under_review: { label: 'Under Review', color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  settled: { label: 'Settled', color: 'bg-emerald-100 text-emerald-700' },
};

interface CargoClaimsPanelProps {
  shipmentId: string;
  branchId: string;
  claims: CargoClaim[];
  insurancePolicies: CargoInsurancePolicy[];
  onReload: () => void;
}

export function CargoClaimsPanel({ shipmentId, branchId, claims, insurancePolicies, onReload }: CargoClaimsPanelProps) {
  const { hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('branch_manager') || hasRole('documentation');
  const [dialog, setDialog] = useState<{ existing: CargoClaim | null } | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Cargo Claims
        </CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ existing: null })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            File Claim
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {claims.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No claims filed for this shipment.
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((c) => (
              <div
                key={c.id}
                className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
                onClick={() => canManage && setDialog({ existing: c })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-medium">
                      {c.claim_number || 'Claim'}
                      <Badge className={cn('ml-2 align-middle', CLAIM_STATUS_META[c.status].color)}>
                        {CLAIM_STATUS_META[c.status].label}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground">
                      {CLAIM_TYPE_LABELS[c.claim_type]} · Against {c.claimed_against_name || CLAIM_AGAINST_LABELS[c.claimed_against]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Filed {formatDate(c.filed_date)}
                      {c.amount_claimed != null && ` · Claimed ${formatCurrency(c.amount_claimed, c.currency)}`}
                      {c.amount_settled != null && ` · Settled ${formatCurrency(c.amount_settled, c.currency)}`}
                    </p>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  </div>
                  {canManage && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); setDialog({ existing: c }); }}>
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
        <CargoClaimFormDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          shipmentId={shipmentId}
          branchId={branchId}
          existing={dialog.existing}
          insurancePolicies={insurancePolicies}
          onSaved={onReload}
        />
      )}
    </Card>
  );
}

function CargoClaimFormDialog({
  open,
  onOpenChange,
  shipmentId,
  branchId,
  existing,
  insurancePolicies,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  branchId: string;
  existing: CargoClaim | null;
  insurancePolicies: CargoInsurancePolicy[];
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [claimType, setClaimType] = useState<CargoClaimType>('damage');
  const [claimedAgainst, setClaimedAgainst] = useState<CargoClaimAgainst>('carrier');
  const [claimedAgainstName, setClaimedAgainstName] = useState('');
  const [insurancePolicyId, setInsurancePolicyId] = useState('');
  const [status, setStatus] = useState<CargoClaimStatus>('filed');
  const [amountClaimed, setAmountClaimed] = useState('');
  const [amountSettled, setAmountSettled] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [filedDate, setFiledDate] = useState('');
  const [resolvedDate, setResolvedDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClaimType(existing?.claim_type ?? 'damage');
    setClaimedAgainst(existing?.claimed_against ?? 'carrier');
    setClaimedAgainstName(existing?.claimed_against_name ?? '');
    setInsurancePolicyId(existing?.insurance_policy_id ?? '');
    setStatus(existing?.status ?? 'filed');
    setAmountClaimed(existing?.amount_claimed != null ? String(existing.amount_claimed) : '');
    setAmountSettled(existing?.amount_settled != null ? String(existing.amount_settled) : '');
    setCurrency(existing?.currency || 'NGN');
    setFiledDate(existing?.filed_date ?? new Date().toISOString().slice(0, 10));
    setResolvedDate(existing?.resolved_date ?? '');
    setDescription(existing?.description ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const payload = {
        claim_type: claimType,
        claimed_against: claimedAgainst,
        claimed_against_name: claimedAgainstName.trim() || null,
        insurance_policy_id: insurancePolicyId || null,
        status,
        amount_claimed: amountClaimed ? Number(amountClaimed) : null,
        amount_settled: amountSettled ? Number(amountSettled) : null,
        currency: currency.trim() || 'NGN',
        filed_date: filedDate || new Date().toISOString().slice(0, 10),
        resolved_date: resolvedDate || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        updated_by: profile.id,
      };

      if (existing) {
        const { error } = await supabase.from('cargo_claims').update(payload).eq('id', existing.id);
        if (error) throw error;
        toast.success('Claim updated');
      } else {
        const { error } = await supabase
          .from('cargo_claims')
          .insert({ ...payload, shipment_id: shipmentId, branch_id: branchId, created_by: profile.id });
        if (error) throw error;
        toast.success('Claim filed');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save claim'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Claim' : 'File a Claim'}</DialogTitle>
          <DialogDescription>
            Supporting evidence (photos, survey reports) can be attached from this shipment&apos;s Documents tab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-type">Claim Type</Label>
              <Select value={claimType} onValueChange={(v) => setClaimType(v as CargoClaimType)}>
                <SelectTrigger id="claim-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CLAIM_TYPE_LABELS) as CargoClaimType[]).map((t) => (
                    <SelectItem key={t} value={t}>{CLAIM_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CargoClaimStatus)}>
                <SelectTrigger id="claim-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CLAIM_STATUS_META) as CargoClaimStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{CLAIM_STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-against">Claimed Against</Label>
              <Select value={claimedAgainst} onValueChange={(v) => setClaimedAgainst(v as CargoClaimAgainst)}>
                <SelectTrigger id="claim-against"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CLAIM_AGAINST_LABELS) as CargoClaimAgainst[]).map((a) => (
                    <SelectItem key={a} value={a}>{CLAIM_AGAINST_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-against-name">Name (optional)</Label>
              <Input
                id="claim-against-name"
                value={claimedAgainstName}
                onChange={(e) => setClaimedAgainstName(e.target.value)}
                placeholder="e.g. Maersk Line"
              />
            </div>
          </div>

          {insurancePolicies.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="claim-policy">Insurance Policy (optional)</Label>
              <Select value={insurancePolicyId || undefined} onValueChange={setInsurancePolicyId}>
                <SelectTrigger id="claim-policy"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {insurancePolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.insurer_name} {p.policy_number ? `#${p.policy_number}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-amount">Amount Claimed</Label>
              <Input id="claim-amount" type="number" min="0" step="0.01" value={amountClaimed} onChange={(e) => setAmountClaimed(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-settled">Amount Settled</Label>
              <Input id="claim-settled" type="number" min="0" step="0.01" value={amountSettled} onChange={(e) => setAmountSettled(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-currency">Currency</Label>
              <Input id="claim-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-filed">Filed Date</Label>
              <Input id="claim-filed" type="date" value={filedDate} onChange={(e) => setFiledDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-resolved">Resolved Date</Label>
              <Input id="claim-resolved" type="date" value={resolvedDate} onChange={(e) => setResolvedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim-description">Description</Label>
            <Textarea id="claim-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim-notes">Notes</Label>
            <Textarea id="claim-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'File Claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
