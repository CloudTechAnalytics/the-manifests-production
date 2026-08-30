'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import type { EmployeeFormValues } from '@/shared/lib/employee-schema';
import type { Profile } from '@/shared/types';

interface EmployeeManifestAccessSectionProps {
  availableProfiles: Profile[];
}

/** Step 4 — Manifest Access. HR job title and system role are
 *  separate concepts (spec section 12) — linking is optional. A
 *  login-less employee (driver, warehouse staff) is a fully
 *  legitimate record; this section is simply empty until linked, not
 *  broken. */
export function EmployeeManifestAccessSection({ availableProfiles }: EmployeeManifestAccessSectionProps) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<EmployeeFormValues>();
  const hasAccess = watch('has_manifest_access');
  const profileId = watch('profile_id');
  const selected = availableProfiles.find((p) => p.id === profileId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Manifest Access</CardTitle>
        <CardDescription>
          Does this employee have a login to The Manifest? Not every employee needs one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="has_manifest_access"
            checked={hasAccess}
            onCheckedChange={(v) => {
              setValue('has_manifest_access', v);
              if (!v) setValue('profile_id', '');
            }}
          />
          <Label htmlFor="has_manifest_access" className="text-sm font-normal">
            This employee has a Manifest login
          </Label>
        </div>

        {hasAccess && (
          <div className="space-y-1.5">
            <Label htmlFor="profile_id">
              Manifest Account <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={control}
              name="profile_id"
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <SelectTrigger id="profile_id">
                    <SelectValue placeholder="Select a user account" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.profile_id && <p className="text-xs text-destructive">{errors.profile_id.message}</p>}
            <p className="text-xs text-muted-foreground">
              Creating a brand-new login isn&apos;t done here — invite a new user from Users, then link them to this
              employee.
            </p>
          </div>
        )}

        {hasAccess && selected && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">System Role</p>
            <p className="capitalize text-muted-foreground">{selected.role?.replace(/_/g, ' ')}</p>
            {selected.branch && (
              <>
                <p className="mt-2 font-medium">Branch Access</p>
                <p className="text-muted-foreground">{selected.branch.name}</p>
              </>
            )}
          </div>
        )}

        {!hasAccess && (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            No Manifest login for this employee — they&apos;ll be tracked in HR only, with no access to the app.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
