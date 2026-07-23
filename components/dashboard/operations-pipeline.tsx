import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PipelineCounts } from '@/hooks/use-dashboard-data';

const STAGE_COLORS: Record<string, string> = {
  quotation: 'bg-slate-100 text-slate-700 ring-slate-200',
  booking: 'bg-blue-100 text-blue-700 ring-blue-200',
  documentation: 'bg-amber-100 text-amber-700 ring-amber-200',
  customs: 'bg-purple-100 text-purple-700 ring-purple-200',
  in_transit: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
  delivered: 'bg-green-100 text-green-700 ring-green-200',
};

interface OperationsPipelineProps {
  pipeline: PipelineCounts[];
  loading?: boolean;
}

function StageNode({ stage }: { stage: PipelineCounts }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span
        className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-card text-base font-bold ring-2 ${STAGE_COLORS[stage.key] ?? 'bg-muted text-muted-foreground ring-border'}`}
      >
        {stage.count}
      </span>
      <span className="text-xs font-medium text-muted-foreground">
        {stage.label}
      </span>
    </div>
  );
}

export function OperationsPipeline({ pipeline, loading }: OperationsPipelineProps) {
  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-3">
        <CardTitle className="text-lg font-semibold">
          Operations Pipeline
        </CardTitle>
        <CardDescription>
          Where every deal and shipment currently stands, quotation to delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            {/* Desktop: full-width, equally spaced, connecting lines edge to edge */}
            <div className="hidden items-start md:flex">
              {pipeline.map((stage, i) => (
                <div key={stage.key} className="flex flex-1 items-center">
                  <div className="flex flex-1 justify-center">
                    <StageNode stage={stage} />
                  </div>
                  {i < pipeline.length - 1 && (
                    <div className="h-0.5 flex-1 -translate-y-3 bg-border" />
                  )}
                </div>
              ))}
            </div>

            {/* Mobile: horizontally scrollable */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin md:hidden">
              {pipeline.map((stage, i) => (
                <div key={stage.key} className="flex items-center">
                  <div className="min-w-[84px]">
                    <StageNode stage={stage} />
                  </div>
                  {i < pipeline.length - 1 && (
                    <div className="h-0.5 w-6 shrink-0 -translate-y-3 bg-border" />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
