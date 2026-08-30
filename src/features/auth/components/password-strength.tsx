'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { evaluatePassword } from '@/shared/lib/utils/password-policy';

const STRENGTH_META: Record<string, { label: string; color: string }> = {
  too_weak: { label: 'Enter a password', color: 'bg-secondary' },
  weak: { label: 'Weak', color: 'bg-red-500' },
  fair: { label: 'Fair', color: 'bg-amber-500' },
  strong: { label: 'Strong', color: 'bg-emerald-500' },
};

/**
 * Live strength meter + explicit requirement list for the registration
 * Account step. Nothing like this exists elsewhere in the app —
 * change-password only checks length >= 8 — so this is new, not reused.
 * Its rules mirror lib/utils/password-policy.ts, which mirrors the actual
 * server-side gate in supabase/functions/_shared/password-policy.ts.
 */
export function PasswordStrength({ password }: { password: string }) {
  const evaluation = evaluatePassword(password);
  const meta = STRENGTH_META[evaluation.strength];

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <div className="flex h-1.5 w-full gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-full flex-1 rounded-full transition-colors',
                i < evaluation.score ? meta.color : 'bg-secondary'
              )}
            />
          ))}
        </div>
        <p className={cn('text-xs font-medium', password.length === 0 ? 'text-muted-foreground' : '')}>
          {meta.label}
        </p>
      </div>

      <ul className="space-y-1">
        {evaluation.requirements.map((req) => (
          <li key={req.id} className="flex items-center gap-1.5 text-xs">
            {req.met ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={req.met ? 'text-foreground' : 'text-muted-foreground'}>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
