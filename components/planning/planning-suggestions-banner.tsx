'use client';

import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import type { PlanningSuggestion } from '@/lib/utils/planning-suggestions';

interface PlanningSuggestionsBannerProps {
  suggestions: PlanningSuggestion[];
}

/**
 * Smart Automation (§16) — non-blocking, dismissible suggestions.
 * Same visual shape as PlanningRiskBanner but informational (blue), and
 * dismissal is local/session-only — nothing is persisted, so a
 * suggestion reappears if its condition is still true next visit.
 */
export function PlanningSuggestionsBanner({ suggestions }: PlanningSuggestionsBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = suggestions.filter((s) => !dismissed.has(s.id));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
        <Lightbulb className="h-4 w-4" />
        Suggestions
      </p>
      <ul className="space-y-1.5">
        {visible.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-2 text-sm text-blue-700">
            <span>{s.message}</span>
            <button
              type="button"
              className="shrink-0 text-blue-400 hover:text-blue-600"
              onClick={() => setDismissed((prev) => new Set(prev).add(s.id))}
              aria-label="Dismiss suggestion"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
