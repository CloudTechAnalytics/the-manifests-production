import Link from 'next/link';
import { ArrowLeft, Ship } from 'lucide-react';

export const metadata = { title: 'Terms of Service — The Manifest' };

/**
 * Linked from the registration wizard's consent checkboxes (spec section
 * 5). platform_settings.terms_version ('v1' by default) is what's actually
 * recorded against the accepting user in consent_records — this page's
 * content and that version number should be bumped together.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>
      <div className="mt-6 flex items-center gap-2.5">
        <Ship className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-2xl font-bold tracking-tight">Terms of Service</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Version v1 &middot; Effective on registration</p>

      <div className="prose prose-sm mt-8 max-w-none space-y-4 text-sm leading-relaxed text-foreground/90">
        <p>
          These Terms govern your organization&apos;s use of The Manifest, CloudTech Logistics Suite&apos;s
          multi-tenant freight operations platform. By creating an organization, you agree to these Terms on
          behalf of the business you represent.
        </p>
        <p>
          <strong>Your organization&apos;s data.</strong> Your organization&apos;s customers, shipments,
          quotations, documents, and other records belong to your organization and are isolated from every other
          organization on the platform.
        </p>
        <p>
          <strong>Trial subscriptions.</strong> New organizations begin on a trial subscription with the duration,
          user limit, and features configured by the platform operator at the time of registration. CloudTech may
          suspend or restrict an organization that violates these Terms.
        </p>
        <p>
          <strong>Acceptable use.</strong> You agree not to misuse the platform, attempt to access another
          organization&apos;s data, or circumvent rate limits or account restrictions.
        </p>
        <p>This page is a working placeholder pending final legal review.</p>
      </div>
    </div>
  );
}
