# Self-Service Registration — Deployment & Test Runbook

Everything for this feature is written and passes `npm run typecheck` /
`npm run lint` cleanly (aside from two pre-existing, unrelated errors in the
Planning module from other in-progress work). This wasn't run against a live
database from this session — Docker never came back up locally — so please
go through this runbook carefully, ideally against a scratch/staging project
or at a low-traffic time, and **take a backup/snapshot before applying
migrations** since several add `NOT NULL` columns with backfill logic to
`organizations`/`plans`.

## 1. Before you run anything

**Check one Supabase Dashboard setting** — this is the actual enforcement
mechanism for "must verify email before login" and can't be set by a
migration:

> Authentication → Sign In / Providers → Email → **"Confirm email"** must be
> **ON**.

If it's off, `register-organization` still creates the owner with
`email_confirm: false`, but Supabase Auth won't refuse `signInWithPassword`
for an unverified account — the gate becomes cosmetic.

## 2. Apply the migrations, in order

```
062_organization_lifecycle_and_registration_schema.sql
063_platform_settings_and_rate_limiting.sql
064_provisioning_and_user_limit_functions.sql
065_seed_trial_plan_and_platform_settings.sql
066_lock_down_privileged_function_execute.sql
```

Either `supabase db push` (once linked to the real project) or paste each
file into the SQL Editor in that exact order. All are idempotent
(`IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / `DROP POLICY IF EXISTS`), so a
partial re-run is safe.

**Migration 066 matters as much as the others** — it closes a privilege-
escalation gap (see §6 below), including one in two *pre-existing* functions
unrelated to this feature. Don't skip it.

After applying, sanity-check the seed:

```sql
select slug, max_users, is_public from plans where slug = 'trial';
select * from platform_settings;
```

## 3. Deploy edge functions

New:
```
supabase functions deploy register-organization
supabase functions deploy verify-email
supabase functions deploy resend-verification
supabase functions deploy update-organization-profile
```

Modified (redeploy — each gained a plan user-limit check; `invite-user` and
`accept-invite` also gained `department_id`):
```
supabase functions deploy create-user
supabase functions deploy invite-user
supabase functions deploy accept-invite
```

No new secrets needed — the new functions reuse `APP_ORIGIN` and
`RESEND_API_KEY`/`EMAIL_FROM`, which must already be set for
`invite-user`/`create-user` to work today. If `RESEND_API_KEY` isn't set,
registration/verification still work — the API response carries the link
directly (`emailed: false, link: "…"`) instead of emailing it.

## 4. Deploy the frontend

Normal deploy (Netlify, per the existing setup). No new env vars needed.

## 5. Test walkthrough

**Test A — New organization.** Landing page → *Start Free Trial* →
fill Business + Account steps → submit → "Check your email" screen. If
`RESEND_API_KEY` is set, check the inbox; otherwise copy the link shown on
screen. Open it → "Email verified" → redirected to `/login` with the email
prefilled → sign in → lands on `/onboarding` (welcome splash showing
Organization/Plan/Users/Branch) → *Complete Setup* or *Go to Dashboard*.
Confirm in the DB: `organizations.status = 'active_trial'`, a Head Office
branch, 9 departments, an `org_subscriptions` row on the Trial plan.

**Test B — Second organization / isolation.** Register a second company with
a different owner email. Sign in as each owner in turn and confirm neither
can see the other's branches, departments, or team members (Settings →
Branches/Departments, Users page).

**Test C — Multiple roles.** From Org A, invite one person each into Sales,
Operations, Planning, Documentation, Finance (Users page or the onboarding
Invite step). Each accepts via `/accept-invite`, signs in, and should only
see the modules their role permits.

**Test D — Multiple branches.** Settings → Branches (or onboarding's Branch
step): add Lagos, Kano, Abuja. Invite a branch-scoped user into one branch
and confirm they can't see another branch's data.

**Test E — Duplicate submission.** Double-click *Create Account* on
`/register`, or refresh mid-submit, or open the verification link twice.
Confirm exactly one organization/owner exists each time, and the second
verification attempt shows the generic "invalid or expired" message rather
than erroring or re-processing.

**Test F — Subscription limit.** On a small-limit plan (or lower Trial's
`max_users` temporarily via Plans & Pricing / `platform_settings`), invite up
to the limit, then try one more — expect "You have reached your plan's user
limit" with Upgrade Plan / Contact Sales, both in the Users page banner and
as a hard 403 from `invite-user`/`create-user`/`accept-invite`.

**Test G — Platform Admin.** Sign in as `platform_admin` → Organizations
shows the new org automatically (Self-Service origin badge, Active Trial
status) with no manual step. Confirm View, Subscription & Usage panel,
Suspend, Reactivate, and Extend Trial all work from there and from
Subscriptions.

## 6. What changed under the hood (for your own review)

- **Migrations 062–066**: `organizations.status`/`origin` lifecycle,
  `departments` (org-scoped, label-only — never read by RLS/RBAC),
  `email_verification_tokens` (hash-only, zero SELECT policies),
  `consent_records`, `platform_settings` (singleton, trial length/plan/
  self-service kill switch), `rate_limit_hits` + `check_rate_limit()`,
  `provision_organization()` (one transaction: org + Head Office branch +
  departments + owner + trial + consent + audit log), plan-based
  `org_user_count`/`org_user_limit` now enforced in `create-user`,
  `invite-user`, and `accept-invite`.
- **Migration 066 fixes a real privilege-escalation gap**, including in two
  *pre-existing* functions unrelated to this feature:
  `permanently_delete_organization_data()` and
  `admin_force_delete_customer()` had no internal auth check and no
  `REVOKE`, so — by Postgres's default of granting `EXECUTE` to `PUBLIC` —
  *any* authenticated caller, or even an unauthenticated one, could call
  them directly via `supabase.rpc()` for any organization/customer id and
  permanently wipe its data, bypassing `delete-organization`'s/
  `admin-delete-record`'s own platform-admin checks entirely. Found while
  auditing my own new functions for the same class of gap. Please treat
  this one as the most important thing to verify actually deployed.
- **New edge functions**: `register-organization`, `verify-email`,
  `resend-verification`, `update-organization-profile` — all public/
  unauthenticated where required, rate-limited, token-hash-only, generic
  error messages (no enumeration), same CORS/compensation patterns as the
  existing `invite-user`/`create-user`.
- **Frontend**: `/register`, `/verify-email`, `/terms`, `/privacy`,
  `/onboarding`, `/upgrade`; landing page CTA, login redirect/resend,
  Users page usage banner + department picker, Settings → Departments tab,
  dashboard trial banner, Platform Admin status/origin badges + Extend
  Trial + Subscription & Usage panel + Platform Configuration section.

## 7. Deliberately out of scope (flagging, not hiding)

- **Feature-flag enforcement** is per-organization override *storage* only
  (org detail page) — not wired into the ~20 existing modules to actually
  gate access. That's a separate project.
- **"View Usage"** covers users-vs-limit only. Storage-per-organization
  isn't reliably attributable today (`storage.objects` carries no
  `organization_id`), so it's not implemented, not faked.
- **"Support Organization"** is a read-only deep link to that org's detail/
  usage/audit log, not session impersonation.
- **Rate limiting** is real for `register-organization`/`verify-email`/
  `resend-verification`, keyed by IP and email. The IP side depends on
  `X-Forwarded-For` being set correctly by the edge platform — the email
  side is the more reliable backstop against a targeted attack. For
  stronger abuse protection, consider also enabling a CAPTCHA
  (`auth.captcha` — hCaptcha/Turnstile) on `/register` at the platform
  level.
- **Trial expiry** is computed at display/enforcement time
  (`status='active_trial' AND trial_ends_at < now()`), not flipped by a
  cron job. Nothing auto-blocks access on an expired trial — Platform Admin
  suspends manually, per the spec.

## 8. Not run this session

I could not exercise this end-to-end myself (Docker Desktop became
unresponsive partway through pulling images and never recovered). Everything
above is based on careful code review, not a live test run — please treat
Test A–G as genuinely unverified until you've gone through them.
