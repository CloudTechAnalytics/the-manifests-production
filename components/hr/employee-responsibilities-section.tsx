'use client';

import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { EmployeeFormValues } from '@/lib/employee-schema';

const LINKED_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
  { value: 'customs', label: 'Customs' },
  { value: 'planning', label: 'Planning' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'examination', label: 'Examination' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'transport', label: 'Transport' },
];

/** Step 3 — Responsibilities. Spec section 13: one employee, several
 *  functions, without duplicate employee records. "Maps To" is what
 *  the People Capacity engine (migration 087) actually reads — leave
 *  it unset for a responsibility with no operational-role equivalent
 *  (it's just excluded from capacity scoring, not an error). */
export function EmployeeResponsibilitiesSection() {
  const { control, register, setValue } = useFormContext<EmployeeFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'responsibilities' });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Responsibilities</CardTitle>
          <CardDescription>
            Every function this employee actually performs — one is primary, the rest are additional.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:shrink-0"
          onClick={() =>
            append({
              role_title: '',
              linked_role: '',
              is_primary: fields.length === 0,
              start_date: new Date().toISOString().slice(0, 10),
            })
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Responsibility
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No responsibilities added yet. Click &quot;Add Responsibility&quot; to get started.
          </p>
        ) : (
          fields.map((field, index) => (
            <div key={field.id} className="space-y-3">
              {index > 0 && <Separator />}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Responsibility {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`responsibilities.${index}.role_title`}>
                    Role Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`responsibilities.${index}.role_title`}
                    placeholder="Documentation Officer"
                    {...register(`responsibilities.${index}.role_title`)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`responsibilities.${index}.linked_role`}>Maps To</Label>
                  <Controller
                    control={control}
                    name={`responsibilities.${index}.linked_role`}
                    render={({ field: f }) => (
                      <Select value={f.value || ''} onValueChange={f.onChange}>
                        <SelectTrigger id={`responsibilities.${index}.linked_role`}>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          {LINKED_ROLE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`responsibilities.${index}.start_date`}>Start Date</Label>
                  <Input
                    id={`responsibilities.${index}.start_date`}
                    type="date"
                    {...register(`responsibilities.${index}.start_date`)}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-4">
                  <Controller
                    control={control}
                    name={`responsibilities.${index}.is_primary`}
                    render={({ field: f }) => (
                      <Checkbox
                        id={`responsibilities.${index}.is_primary`}
                        checked={f.value}
                        onCheckedChange={(v) => {
                          f.onChange(!!v);
                          // At most one primary — mirrors the DB's own
                          // partial unique index, so submit never fails
                          // on this after a UI slip.
                          if (v) {
                            fields.forEach((_, i) => {
                              if (i !== index) setValue(`responsibilities.${i}.is_primary`, false);
                            });
                          }
                        }}
                      />
                    )}
                  />
                  <Label htmlFor={`responsibilities.${index}.is_primary`} className="text-sm font-normal">
                    Primary responsibility
                  </Label>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
