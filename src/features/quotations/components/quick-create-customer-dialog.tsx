'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { Customer, CustomerType } from '@/shared/types';

interface QuickCreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string | null;
  onCreated: (customer: Customer) => void;
}

/**
 * The minimum a customer record needs to exist (full detail — contacts,
 * address, notes — stays on the real Customers module, edited there
 * later). Section 1 of the quotation only needs this to unblock "I don't
 * have this customer in the system yet" without leaving the page.
 */
export function QuickCreateCustomerDialog({
  open,
  onOpenChange,
  branchId,
  onCreated,
}: QuickCreateCustomerDialogProps) {
  const { profile } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [type, setType] = useState<CustomerType>('corporate');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCompanyName('');
    setType('corporate');
    setEmail('');
    setPhone('');
    setCountry('Nigeria');
    setError('');
  };

  const handleCreate = async () => {
    if (!profile) return;
    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }
    if (!branchId) {
      setError('Select a branch on the quotation first');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { data, error: insertError } = await supabase
        .from('customers')
        .insert({
          company_name: companyName.trim(),
          type,
          email: email.trim() || null,
          phone: phone.trim() || null,
          country,
          status: 'active',
          branch_id: branchId,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('*')
        .single();

      if (insertError || !data) {
        throw new Error(insertError?.message ?? 'Failed to create customer');
      }

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId,
        action: 'customer.created',
        entity_type: 'customer',
        entity_id: data.id,
        description: `Created customer "${companyName.trim()}" from a quotation`,
      });

      toast.success(`"${companyName.trim()}" added`);
      onCreated(data as Customer);
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create customer'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            New Customer
          </DialogTitle>
          <DialogDescription>
            Add just enough to select them on this quotation — the full profile
            (contacts, address, notes) can be filled in later from the Customers
            page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qc-company-name">
              Company Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Logistics Ltd."
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CustomerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-country">Country</Label>
              <Input id="qc-country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qc-email">Email</Label>
              <Input
                id="qc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-phone">Phone</Label>
              <Input id="qc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Add Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
