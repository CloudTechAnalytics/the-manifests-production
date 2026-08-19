'use client';

import { BarChart3 } from 'lucide-react';
import { ComingSoon } from '@/components/platform/coming-soon';

export default function PlatformAnalyticsPage() {
  return (
    <ComingSoon
      icon={BarChart3}
      title="Platform Analytics"
      description="Cross-tenant usage patterns — feature adoption, module activity, engagement trends across every organization."
    />
  );
}
