'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Building2, Mail, Phone, Globe, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BUSINESS_TYPE_OPTIONS, type RegisterFormValues } from '@/lib/register-schema';

const HOW_HEARD_OPTIONS = ['Search Engine', 'Social Media', 'Referral', 'Industry Event', 'Advertisement', 'Other'];

/** Step 1 of the registration wizard — spec section 2. Only 6 fields are required; everything else is optional and clearly marked. */
export function BusinessStep() {
  const { register, control, formState: { errors } } = useFormContext<RegisterFormValues>();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Tell us about your business</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This sets up your organization on The Manifest. You can change these details later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="business_name">Business / Company Name *</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="business_name" {...register('business_name')} placeholder="ABC Logistics Ltd" className="pl-10" autoFocus />
          </div>
          {errors.business_name && <p className="text-xs text-destructive">{errors.business_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_type">Business Type *</Label>
          <Controller
            control={control}
            name="business_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="business_type"><SelectValue placeholder="Select a type" /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.business_type && <p className="text-xs text-destructive">{errors.business_type.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="registration_number">Company Registration Number</Label>
          <Input id="registration_number" {...register('registration_number')} placeholder="Optional" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="country">Country *</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="country" {...register('country')} placeholder="Nigeria" className="pl-10" />
          </div>
          {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="city">State / City *</Label>
          <Input id="city" {...register('city')} placeholder="Lagos" />
          {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_email">Business Email *</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="business_email" type="email" {...register('business_email')} placeholder="info@yourcompany.com" className="pl-10" />
          </div>
          {errors.business_email && <p className="text-xs text-destructive">{errors.business_email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_phone">Phone Number *</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="business_phone" {...register('business_phone')} placeholder="+234..." className="pl-10" />
          </div>
          {errors.business_phone && <p className="text-xs text-destructive">{errors.business_phone.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="website" {...register('website')} placeholder="Optional" className="pl-10" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expected_users">Expected Number of Users</Label>
          <Input id="expected_users" type="number" min={0} {...register('expected_users')} placeholder="Optional" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expected_monthly_shipments">Expected Monthly Shipments</Label>
          <Input id="expected_monthly_shipments" type="number" min={0} {...register('expected_monthly_shipments')} placeholder="Optional" />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="referral_source">How did you hear about us?</Label>
          <Controller
            control={control}
            name="referral_source"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id="referral_source"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {HOW_HEARD_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
    </div>
  );
}
