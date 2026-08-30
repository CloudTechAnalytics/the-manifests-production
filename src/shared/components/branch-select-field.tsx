'use client';

import { Building2 } from 'lucide-react';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { Branch } from '@/shared/types';

interface BranchSelectFieldProps {
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
  loading?: boolean;
  error?: string;
}

/** Only rendered when the acting user has no branch of their own — see useBranchSelector. */
export function BranchSelectField({
  branches,
  value,
  onChange,
  loading,
  error,
}: BranchSelectFieldProps) {
  return (
    <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <Label htmlFor="record-branch" className="flex items-center gap-1.5 text-amber-900">
        <Building2 className="h-3.5 w-3.5" />
        Branch <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange} disabled={loading}>
        <SelectTrigger id="record-branch">
          <SelectValue placeholder={loading ? 'Loading branches…' : 'Select a branch'} />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-amber-800">
        Your account isn't assigned to a branch, so pick which one this record belongs to.
      </p>
    </div>
  );
}
