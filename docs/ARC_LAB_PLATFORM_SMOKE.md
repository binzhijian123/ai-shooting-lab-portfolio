# Arc Lab Platform Smoke

Updated: 2026-06-28

## Purpose

This smoke test verifies the local MVP platform blueprint derived from `docs/ARC_LAB_MVP_PRD.md`.

It covers the PRD-wide shell without replacing the existing `AI 投篮实验室`:

- coach-led north-star loop
- coach phone-login/default-organization/invite-link direction
- runnable local coach phone login, default organization, add-athlete, invite link, and student phone-binding APIs
- runnable local coach lesson upload with problem tag, camera view, shot type, video asset, evidence packet, and coach-only AI draft
- runnable local coach review publish flow with primary/secondary confirmation, coach feedback, 3-step task, and hidden AI draft
- runnable local student feedback lookup after invite phone-binding, with coach feedback as source of truth and AI draft/diff hidden
- runnable local homework/retest upload with wrong-view supplemental policy and coach per-drill effectiveness review
- runnable local live trends from coach-confirmed metric snapshots, with lesson/homework/view/shot-type separation and coach-confirmed student explanations
- runnable local separate audited soft-delete actions for video assets, sessions, and athlete data
- deployment readiness gate for Supabase, SMS auth, and private Storage environment groups without live external service contact
- opt-in Supabase live read-only verification gate for Auth/REST/Storage surface checks without migration apply, database mutation, Storage upload, SMS contact, or RLS policy-effect claims
- opt-in staging RLS role probe for coach access, student draft isolation, published-only feedback/tasks, and cross-organization denial
- opt-in staging Storage role probe for own-visible, own-hidden, sibling-athlete, and cross-organization object reads
- strong opt-in staging Storage lifecycle probe for a test-object upload, one-byte range read, delete, and read-after-delete check
- Next.js App Router target scaffold for `apps/coach-platform`, with pnpm lockfile, local build smoke, local Next dev mobile browser smoke, and explicit not-deployed/live-service boundaries
- local mobile-first PWA shell with manifest and static shell service worker
- coach review queue and AI draft publish gate
- coach review tab plus student home/training video areas embed the full original `AI 投篮实验室` workbench for primary/supplemental upload, browser video replay, evidence/report generation, annotated-frame export, and keyframes
- student invite/phone-binding direction
- student feedback result, 3-step plan, simplified trend, knowledge assistant boundaries, and daily usage counter
- lesson/homework, camera view, shot type, and problem tag separation
- wrong-view homework supplemental-record policy
- 26-table Supabase schema draft
- `packages/analysis-engine` bridge that preserves the existing analysis lab

## Files

- `server/arcLabPlatform.mjs`
- `server/arcLabNextPlatformScaffold.mjs`
- `server/arcLabIdentityStore.mjs`
- `server/arcLabDeploymentReadiness.mjs`
- `server/arcLabSupabaseRlsLiveVerification.mjs`
- `server/arcLabSupabaseStorageLiveVerification.mjs`
- `server/arcLabSupabaseStorageLifecycleVerification.mjs`
- `app/arc-lab.html`
- `app/arc-lab.css`
- `app/arc-lab.js`
- `app/arc-lab.webmanifest`
- `app/arc-lab-sw.js`
- `apps/coach-platform/README.md`
- `apps/coach-platform/package.json`
- `apps/coach-platform/pnpm-lock.yaml`
- `apps/coach-platform/pnpm-workspace.yaml`
- `apps/coach-platform/next.config.mjs`
- `apps/coach-platform/tsconfig.json`
- `apps/coach-platform/app/layout.tsx`
- `apps/coach-platform/app/page.tsx`
- `apps/coach-platform/app/globals.css`
- `apps/coach-platform/lib/supabase-boundary.ts`
- `apps/analysis-lab/README.md`
- `packages/analysis-engine/index.mjs`
- `packages/analysis-engine/README.md`
- `supabase/migrations/0001_arc_lab_mvp_schema.sql`
- `scripts/arc-lab-platform-smoke.mjs`
- `scripts/arc-lab-next-platform-smoke.mjs`
- `scripts/arc-lab-next-platform-runtime-smoke.mjs`
- `scripts/arc-lab-next-platform-browser-smoke.mjs`
- `scripts/arc-lab-pwa-smoke.mjs`
- `scripts/arc-lab-deployment-readiness-smoke.mjs`
- `scripts/arc-lab-live-trend-smoke.mjs`
- `scripts/arc-lab-audited-deletion-smoke.mjs`
- `scripts/arc-lab-supabase-production-smoke.mjs`
- `scripts/arc-lab-supabase-sql-sanity-smoke.mjs`
- `scripts/arc-lab-supabase-live-verification-smoke.mjs`
- `scripts/arc-lab-supabase-rls-live-verification-smoke.mjs`
- `scripts/arc-lab-supabase-storage-live-verification-smoke.mjs`
- `scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs`

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-platform-smoke.mjs
```

Live trend contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-live-trend-smoke.mjs
```

PWA shell smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-pwa-smoke.mjs
```

Audited deletion smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-audited-deletion-smoke.mjs
```

Deployment readiness smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-deployment-readiness-smoke.mjs
```

Supabase static SQL sanity smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-sql-sanity-smoke.mjs
```

Supabase production contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-production-smoke.mjs
```

Supabase live verification smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-live-verification-smoke.mjs
```

Supabase RLS live role verification smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-rls-live-verification-smoke.mjs
```

Supabase Storage live role verification smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-storage-live-verification-smoke.mjs
```

Supabase Storage lifecycle verification smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs
```

Next platform scaffold smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-next-platform-smoke.mjs
```

Next platform runtime smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-next-platform-runtime-smoke.mjs
```

Next platform browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-next-platform-browser-smoke.mjs
```

## Latest Result

Passed on 2026-06-28.

Latest output included:

- `schema_version=arc_lab_platform_smoke.v1`
- `source_contract=coach_platform_student_platform_local_blueprint`
- platform validation: `true`
- API endpoint: `true`
- static page: `true`
- identity invite API: `true`
- coach lesson upload API: `true`
- coach review publish API: `true`
- student feedback API: `true`
- student homework upload API: `true`
- coach homework review API: `true`
- student knowledge usage API: `true`
- student knowledge directory API: `true`
- audited deletion API: `true`
- deployment readiness API: `true`
- PWA shell: `true`
- Next platform scaffold: `true`
- Next platform runtime build: `true`
- Next platform local dev mobile browser: `true`
- live trend metric snapshots and student explanation confirmation: `true`
- Supabase production contract: `true`
- Supabase static SQL sanity: `true`
- Supabase live verification default-safe gate: `true`
- Supabase RLS live verification default-safe gate: `true`
- Supabase Storage live verification default-safe gate: `true`
- Supabase Storage lifecycle verification default-safe gate: `true`
- Supabase schema draft: `true`
- analysis-engine bridge: `true`
- data model tables: `26`

## Boundaries

This is not yet a production Next.js deployment, live Supabase project, SMS login implementation, or cloud storage implementation. The `apps/coach-platform` files now have local Next build evidence through pnpm frozen-lockfile install and `next build`, plus local `next dev` browser evidence at a 390x844 mobile viewport, but no production server, hosted deployment, live Supabase project, SMS provider, or cloud Storage write path has been verified. The identity flow is a local mock phone-login and invite-binding contract, not real SMS auth. The lesson upload flow records a local video asset contract and evidence summary; it does not yet upload real video bytes to cloud storage. Live trends use explicitly entered local metrics, labeled by source as coach-recorded for lessons or athlete-submitted for homework; they do not claim automatic metric extraction from the filename-only upload contract. The PWA shell is local static installability scaffolding; it does not certify native app behavior or production offline data sync. The local audited deletion flow is a soft-delete and access-boundary contract; it does not claim physical deletion from cloud Storage or a live Supabase project. The deployment readiness gate checks env shape and static SQL only; it does not contact or verify live external services. The Supabase surface, database RLS, and Storage role gates are opt-in and read-only. The Storage lifecycle gate is opt-in and writes/deletes only a staging test object after an exact confirmation phrase and `codex-storage-lifecycle` object-key segment are present. Their mock behavior is verified, but no live role probe or live lifecycle write/delete probe has run in this workspace.

The Supabase migration now carries a productionization contract for all 26 MVP tables: RLS enabled on every table, organization-scoped helper functions, coach-only AI draft/task draft policies, published-only student feedback/tasks/plan steps, a private `arc-lab-videos` bucket, Storage object keys scoped by organization plus athlete, student reads tied to non-deleted visible sessions, and three separate audited soft-delete RPCs. Static SQL sanity checks cover those boundaries plus Security Definer/search_path safety, coach-confirmed trend explanations, and non-storage of student knowledge assistant questions. This contract has not been applied to a live Supabase project yet.

It is the runnable local platform blueprint and verification layer that lets the current project move toward the PRD while preserving the analysis lab and hard privacy boundaries.
