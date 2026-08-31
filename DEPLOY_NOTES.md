# Deploy notes

## Vite migration cutover (Phase 4)

The app moved from Next.js 13 (App Router, deployed as a Next server)
to Vite + React Router (a plain static SPA build). All of Phases 1-3
happened on the `vite-migration` branch, pushed only to `origin` —
`master` (and the `testing`/`production` remotes) were left completely
untouched throughout and are still the live, deployable Next.js app.

**What's ready in this repo** (done, on `vite-migration`):
- `vercel.json` — SPA-fallback rewrite (`/(.*) -> /index.html`, since
  this is now a client-side router with no server) + the same 5
  security headers `next.config.js` used to set (`X-Content-Type-
  Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security`). A Content-Security-Policy is still
  deliberately omitted, for the same reason the original config gave:
  this app uses inline styles throughout (landing page gradients,
  chart theming), and a CSP strict enough to matter but loose enough
  not to break those needs to be built against a live page, not
  guessed.
- `framework: "vite"`, `buildCommand: "npm run build"` (`tsc -b &&
  vite build`), `outputDirectory: "dist"` — verified locally: `npm
  run build` succeeds, and `vite preview` correctly serves a deep
  client-side route (e.g. `/customers`) with a 200, confirming the
  SPA-fallback shape is right.
- `.env.example` already uses the `VITE_*` prefix
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) instead of
  `NEXT_PUBLIC_*`.

**What still needs doing, outside this repo** (no Vercel/Netlify CLI
or credentials are available in this environment - these are manual
steps on vercel.com, or a deliberate follow-up session with Vercel
access):

1. In each Vercel project (preview, testing, production) tied to this
   repo: change the Framework Preset from Next.js to Vite (Vercel
   should auto-detect it from `vercel.json`'s `framework` field once
   the project is pointed at a build of the `vite-migration` branch,
   but it's worth confirming in the dashboard rather than assuming).
2. Rename every env var from `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` in each of those Vercel projects' env var
   settings (Preview, and separately Production, since Vercel scopes
   them per-environment).
3. Deploy `vite-migration` to a **preview** environment first, against
   the **testing** Supabase project, and verify end-to-end there
   (login, a few CRUD flows) before touching anything production-
   facing.
4. Only once that preview deploy is confirmed working: merge
   `vite-migration` into `master` (or repoint the production Vercel
   project's tracked branch), and only then update production's env
   vars and confirm a real deploy against the production Supabase
   project.
5. Keep the pre-migration Next.js `master` commit reachable (it
   already is - this migration never rewrote `master`'s history) as
   an instant rollback path until the new deploy has run cleanly in
   production for a while.
6. Once confidence is high, `netlify.toml` and `@netlify/plugin-
   nextjs` (present on `master`, not carried onto `vite-migration`)
   can be dropped for good if Netlify isn't also being kept as a
   second host - confirm which host(s) are actually in play before
   deleting anything on `master`.

None of steps 1-4 were performed as part of this session - they need
either direct Vercel dashboard access or explicit sign-off before
anything production-facing changes, per this migration's standing
safety rule (`master`/`testing`/`production` stay untouched until a
preview deploy is explicitly verified).

---

Redeploy trigger: forcing a fresh Vercel build after confirming the
computePlanningMilestones fix (81a2c5f) is present in this branch's
history but an earlier Vercel deployment attempt still showed the
pre-fix error — pinned to a stale commit via a "Redeploy" click rather
than pulling the branch's current HEAD.
