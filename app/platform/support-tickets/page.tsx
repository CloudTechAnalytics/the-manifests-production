'use client';

import { LifeBuoy } from 'lucide-react';
import { ComingSoon } from '@/components/platform/coming-soon';

export default function SupportTicketsPage() {
  return (
    <ComingSoon
      icon={LifeBuoy}
      title="Support Tickets"
      description="A queue for customer support requests raised against their organization, with status tracking and internal notes."
    />
  );
}
