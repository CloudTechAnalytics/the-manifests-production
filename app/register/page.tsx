'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, ChevronLeft, Loader2, MailCheck, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/utils';
import { CONTACT_EMAIL } from '@/lib/contact';
import { registerSchema, REGISTER_FORM_DEFAULTS, type RegisterFormValues } from '@/lib/register-schema';
import { useRegisterWizard } from '@/lib/register-wizard';
import { RegisterProgress } from '@/components/register/register-progress';
import { BusinessStep } from '@/components/register/business-step';
import { AccountStep } from '@/components/register/account-step';

interface RegisterResult {
  emailed: boolean;
  link?: string;
  ownerEmail: string;
  similarNameWarning: boolean;
}

/**
 * Self-service registration — spec sections 1-6. Business + Account are
 * real react-hook-form steps (one FormProvider, per-step field validation
 * via useRegisterWizard, same pattern as the quotation wizard); nothing is
 * lost moving between them because nothing remounts. Submitting calls the
 * public register-organization edge function, which does the transactional
 * provisioning (org + Head Office branch + departments + trial + owner)
 * server-side — see migration 064's provision_organization().
 */
export default function RegisterPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [resending, setResending] = useState(false);

  const methods = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: REGISTER_FORM_DEFAULTS,
    mode: 'onBlur',
  });
  const wizard = useRegisterWizard(methods.trigger);

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-organization`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(values),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        toast.error(data.error ?? `Registration failed (${response.status})`);
        return;
      }

      setResult({
        emailed: !!data.emailed,
        link: data.link,
        ownerEmail: values.owner_email,
        similarNameWarning: !!data.similar_name_warning,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to submit registration'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!result) return;
    setResending(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resend-verification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email: result.ownerEmail }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? 'Failed to resend verification email');
        return;
      }
      toast.success('Verification email sent (if the address needs one).');
      if (data.link) setResult((r) => (r ? { ...r, link: data.link, emailed: !!data.emailed } : r));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to resend verification email'));
    } finally {
      setResending(false);
    }
  };

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md space-y-8 text-center">
          <RegisterProgress currentStage={3} />
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold tracking-tight">Check your email to verify your account</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a verification link to <span className="font-medium text-foreground">{result.ownerEmail}</span>.
                Click it to activate your trial and sign in.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Already know you want a paid plan? You can subscribe and skip the trial as soon as you sign in.
              </p>
            </div>
            {result.similarNameWarning && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Note: we found an organization with a similar name already on The Manifest. If that&apos;s unexpected,
                contact <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
              </p>
            )}
            {!result.emailed && result.link && (
              <div className="w-full rounded-lg border border-dashed border-border bg-muted/40 p-3 text-left text-xs">
                <p className="font-medium text-foreground">Email delivery isn&apos;t configured in this environment.</p>
                <a href={result.link} className="mt-1 block break-all text-primary underline">{result.link}</a>
              </div>
            )}
            <Button variant="outline" onClick={handleResend} disabled={resending} className="w-full">
              {resending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Resend verification email
            </Button>
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Already verified? Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">
            Already have an account? Sign in
          </Link>
        </div>

        <RegisterProgress currentStage={wizard.stepIndex + 1} />

        <FormProvider {...methods}>
          <form
            onSubmit={methods.handleSubmit(onSubmit)}
            className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            {wizard.currentStep.id === 'business' ? <BusinessStep /> : <AccountStep />}

            <div className="flex items-center justify-between border-t border-border pt-5">
              <Button type="button" variant="outline" onClick={wizard.goBack} disabled={wizard.isFirst}>
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              {wizard.isLast ? (
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create Account
                  <ShieldCheck className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={wizard.goNext}>
                  Next
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </FormProvider>

        <p className="text-center text-xs text-muted-foreground">
          Questions? <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
