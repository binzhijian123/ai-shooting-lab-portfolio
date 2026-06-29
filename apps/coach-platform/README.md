# Arc Lab Coach Platform

This directory is the Next.js target scaffold for the future Supabase-backed mobile-first PWA.

Current local MVP status:

- The runnable local platform shell is served from `app/arc-lab.html`.
- This folder now contains a minimal Next.js App Router shape: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.mjs`, and `tsconfig.json`.
- Dependencies are locked with pnpm in `pnpm-lock.yaml`; `pnpm-workspace.yaml` explicitly approves the `sharp` build script required by the local Next dependency graph.
- The local Next build smoke is `scripts/arc-lab-next-platform-runtime-smoke.mjs`. It runs `pnpm install --frozen-lockfile` and `next build` with telemetry disabled, then checks `.next/standalone` and `.next/static`.
- The local Next mobile browser smoke is `scripts/arc-lab-next-platform-browser-smoke.mjs`. It starts `next dev`, renders the App Router page at `390x844`, checks no horizontal overflow, verifies the mobile panel layout, and confirms coach-led/student-final boundary copy remains visible.
- `lib/supabase-boundary.ts` lists the Supabase, SMS, and Storage environment contract while keeping `liveSupabaseProjectVerified`, `liveSmsAuthVerified`, and `liveStorageVerified` false.
- The server-side platform blueprint is in `server/arcLabPlatform.mjs`.
- The static scaffold validator is in `server/arcLabNextPlatformScaffold.mjs`, with smoke coverage in `scripts/arc-lab-next-platform-smoke.mjs`.
- The Supabase schema draft is in `supabase/migrations/0001_arc_lab_mvp_schema.sql`.
- The production readiness gate is in `server/arcLabDeploymentReadiness.mjs`; it checks env shape and static SQL only, not a live Supabase deployment, SMS auth implementation, or cloud Storage upload path.
- Reusable analysis logic is exposed through `packages/analysis-engine`.

Boundary: this is local Next build and local Next dev-browser evidence, not a live Supabase deployment, not a production Next server, not SMS login, and not production cloud video storage. The current repository keeps `AI 投篮实验室` as the active analysis lab while Arc Lab grows around it.
