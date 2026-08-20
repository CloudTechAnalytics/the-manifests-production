'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EmployeeFormValues } from '@/lib/employee-schema';

/** Step 1 — Personal. */
export function EmployeePersonalSection() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<EmployeeFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Personal</CardTitle>
        <CardDescription>Who this employee is.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input id="first_name" {...register('first_name')} />
            {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <Input id="last_name" {...register('last_name')} />
            {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input id="date_of_birth" type="date" {...register('date_of_birth')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gender">Gender</Label>
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="personal_email">Personal Email</Label>
            <Input id="personal_email" type="email" {...register('personal_email')} />
            {errors.personal_email && <p className="text-xs text-destructive">{errors.personal_email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="personal_phone">Personal Phone</Label>
            <Input id="personal_phone" placeholder="+234 800 000 0000" {...register('personal_phone')} />
          </div>

          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} {...register('address')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
