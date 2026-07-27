'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface SectionFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  placeholder?: string;
}

interface PlanSectionEditDialogProps {
  planId: string;
  title: string;
  description?: string;
  fields: SectionFieldDef[];
  initialValues: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PlanSectionEditDialog({
  planId,
  title,
  description,
  fields,
  initialValues,
  open,
  onOpenChange,
  onSaved,
}: PlanSectionEditDialogProps) {
  const { profile } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      const v = initialValues[f.key];
      next[f.key] = v === null || v === undefined ? '' : String(v as string | number);
    });
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    if (!profile?.id) return;
    setSubmitting(true);
    try {
      const payload: Record<string, string | number | null> = {
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      };
      fields.forEach((f) => {
        const raw = values[f.key] ?? '';
        if (raw === '') {
          payload[f.key] = null;
        } else if (f.type === 'number') {
          payload[f.key] = Number(raw);
        } else {
          payload[f.key] = raw;
        }
      });

      const { error } = await supabase.from('shipment_plans').update(payload).eq('id', planId);
      if (error) throw error;

      toast.success(`${title} updated`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = getErrorMessage(err, `Failed to update ${title.toLowerCase()}`);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type={f.type}
                step={f.type === 'number' ? '0.01' : undefined}
                min={f.type === 'number' ? '0' : undefined}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
