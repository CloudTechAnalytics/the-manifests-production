'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Organization } from '@/types';

/** Onboarding step 1 — spec section 9. Mostly a review; the identity fields (name/registration number) stay platform-admin-only, as documented in update-organization-profile. */
export function OrgInfoStep({ organization, onUpdated }: { organization: Organization; onUpdated: () => void }) {
  const [address, setAddress] = useState(organization.address ?? '');
  const [phone, setPhone] = useState(organization.phone ?? '');
  const [website, setWebsite] = useState(organization.website ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Your session has expired. Please sign in again.'); return; }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-organization-profile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ address, phone, website }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to save');
      toast.success('Organization details saved');
      onUpdated();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save organization details'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Your organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm your details — you can always update these later from Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Organization Name</Label>
          <Input value={organization.name} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Business Email</Label>
          <Input value={organization.email ?? ''} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="onb-phone">Phone</Label>
          <Input id="onb-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="onb-website">Website</Label>
          <Input id="onb-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="onb-address">Address</Label>
          <Input id="onb-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <Button type="button" variant="outline" onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Save details
      </Button>
    </div>
  );
}
