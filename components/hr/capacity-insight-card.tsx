import { AlertCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkforceInsight } from '@/lib/hr/capacity-insights';

/** Renders one Workforce Insight — always recommendation language
 *  ("consider reviewing…"), never framed as a decision already made
 *  (spec section 10). */
export function CapacityInsightCard({ insight }: { insight: WorkforceInsight }) {
  const isNotice = insight.tone === 'notice';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-sm',
        isNotice ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'
      )}
    >
      {isNotice ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      )}
      <p className={isNotice ? 'text-amber-900' : 'text-blue-900'}>{insight.text}</p>
    </div>
  );
}
