'use client';

import { LineChart } from 'lucide-react';
import { ComingSoon } from '@/components/platform/coming-soon';

export default function RevenueAnalyticsPage() {
  return (
    <ComingSoon
      icon={LineChart}
      title="Revenue Analytics"
      description="Deeper revenue trends and cohort breakdowns beyond the MRR/ARR/growth chart already on the Platform Console dashboard."
    />
  );
}
