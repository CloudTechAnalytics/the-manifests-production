import Link from 'next/link';
import { ArrowLeft, Ship } from 'lucide-react';

export const metadata = { title: 'Privacy Policy — The Manifest' };

/**
 * Linked from the registration wizard's consent checkboxes (spec section
 * 5). platform_settings.privacy_version ('v1' by default) is what's
 * actually recorded against the accepting user in consent_records — this
 * page's content and that version number should be bumped together.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>
      <div className="mt-6 flex items-center gap-2.5">
        <Ship className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-2xl font-bold tracking-tight">Privacy Policy</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Version v1 &middot; Effective on registration</p>

      <div className="prose prose-sm mt-8 max-w-none space-y-4 text-sm leading-relaxed text-foreground/90">
        <p>
          This Policy describes how CloudTech Logistics Suite collects and uses information when you register an
          organization on The Manifest and when your organization&apos;s users use the platform.
        </p>
        <p>
          <strong>What we collect.</strong> Business details you provide at registration (company name, business
          type, country/city, contact details), account details for each user (name, email, phone), and
          operational data your organization enters into the platform.
        </p>
        <p>
          <strong>Tenant isolation.</strong> Your organization&apos;s data is enforced at the database level to be
          accessible only to your organization&apos;s own users and, for platform oversight and support purposes
          only, CloudTech&apos;s Platform Admin.
        </p>
        <p>
          <strong>Retention.</strong> We retain audit records of account and organization lifecycle events
          (registration, verification, invitations, plan changes) for security and support purposes.
        </p>
        <p>This page is a working placeholder pending final legal review.</p>
      </div>
    </div>
  );
}
