'use client';

import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import Link from 'next/link';
import { Eye, EyeOff, Lock, Mail, Phone, User as UserIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordStrength } from '@/components/auth/password-strength';
import type { RegisterFormValues } from '@/lib/register-schema';

/** Step 2 — spec section 3: creates the Organization Owner. Highest org-level permissions; never Platform Admin. */
export function AccountStep() {
  const { register, control, watch, formState: { errors } } = useFormContext<RegisterFormValues>();
  const [showPassword, setShowPassword] = useState(false);
  const password = watch('password');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Create your account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;ll be the Organization Owner — the highest permission level in your organization.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="owner_first_name">First Name *</Label>
          <div className="relative">
            <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="owner_first_name" {...register('owner_first_name')} className="pl-10" autoFocus />
          </div>
          {errors.owner_first_name && <p className="text-xs text-destructive">{errors.owner_first_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="owner_last_name">Last Name *</Label>
          <Input id="owner_last_name" {...register('owner_last_name')} />
          {errors.owner_last_name && <p className="text-xs text-destructive">{errors.owner_last_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="owner_email">Work Email *</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="owner_email" type="email" {...register('owner_email')} placeholder="you@yourcompany.com" className="pl-10" />
          </div>
          {errors.owner_email && <p className="text-xs text-destructive">{errors.owner_email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="owner_phone">Phone Number *</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="owner_phone" {...register('owner_phone')} placeholder="+234..." className="pl-10" />
          </div>
          {errors.owner_phone && <p className="text-xs text-destructive">{errors.owner_phone.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="password">Password *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className="pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          <div className="pt-1">
            <PasswordStrength password={password || ''} />
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="confirm_password">Confirm Password *</Label>
          <Input id="confirm_password" type={showPassword ? 'text' : 'password'} {...register('confirm_password')} />
          {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <Controller
          control={control}
          name="terms_accepted"
          render={({ field }) => (
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              <span>
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="font-medium text-primary underline underline-offset-2">
                  Terms of Service
                </Link>
              </span>
            </label>
          )}
        />
        {errors.terms_accepted && <p className="text-xs text-destructive">{errors.terms_accepted.message}</p>}

        <Controller
          control={control}
          name="privacy_accepted"
          render={({ field }) => (
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              <span>
                I agree to the{' '}
                <Link href="/privacy" target="_blank" className="font-medium text-primary underline underline-offset-2">
                  Privacy Policy
                </Link>
              </span>
            </label>
          )}
        />
        {errors.privacy_accepted && <p className="text-xs text-destructive">{errors.privacy_accepted.message}</p>}
      </div>
    </div>
  );
}
