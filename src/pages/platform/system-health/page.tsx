'use client';

import { SystemHealthCard } from '@/components/platform/system-health-card';

export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">System Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live reachability of the platform's underlying services.
        </p>
      </div>

      <div className="max-w-md">
        <SystemHealthCard />
      </div>
    </div>
  );
}
