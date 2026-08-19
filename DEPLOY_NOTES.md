# Deploy notes

Redeploy trigger: forcing a fresh Vercel build after confirming the
computePlanningMilestones fix (81a2c5f) is present in this branch's
history but an earlier Vercel deployment attempt still showed the
pre-fix error — pinned to a stale commit via a "Redeploy" click rather
than pulling the branch's current HEAD.
