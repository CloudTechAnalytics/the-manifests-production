'use client';

import { CreditCard } from 'lucide-react';
import { ComingSoon } from '@/components/platform/coming-soon';

export default function BillingPage() {
  return (
    <ComingSoon
      icon={CreditCard}
      title="Billing"
      description="Platform-level invoicing and payment history for customer subscriptions — MRR/ARR and trial status already live on Subscriptions."
    />
  );
}
