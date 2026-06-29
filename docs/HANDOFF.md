# Handoff

Updated: 2026-06-28

## Current Objective

Continue optimizing the Shooting Lab project from the Phase 0.5 documents. Phase 1 baseline has priority first; after the baseline is verified, continue through the MVP phases with small, visible, verifiable slices.

## Current Verified State

- Arc Lab MVP PRD exists at `docs/ARC_LAB_MVP_PRD.md`, with execution loop guidance at `docs/ARC_LAB_EXECUTION_LOOP_PROMPT.md`.
- Arc Lab domain contract exists at `server/arcLabContracts.mjs` with `arc_lab_mvp_contract.v1`. It defines coach-led AI boundaries, `coach_lesson`/`athlete_homework`, side/front/back view tracks, five shot types, 18 built-in problem tags, the three-step training plan structure, 9 Obsidian drill seeds, trend-key separation, knowledge assistant guardrails, and privacy boundaries.
- Arc Lab contract smoke exists at `scripts/arc-lab-contract-smoke.mjs`; `server/index.mjs --check` includes `arc_lab_mvp_contract`.
- Arc Lab workflow contract exists at `server/arcLabWorkflow.mjs` with `arc_lab_workflow_contract.v1`. It validates lesson/homework upload metadata, coach-confirmed problem tags, AI draft-only training plans, coach publish gating, student-visible final plan boundaries, and wrong-view homework policy.
- Arc Lab workflow smoke exists at `scripts/arc-lab-workflow-smoke.mjs`; `server/index.mjs --check` includes `arc_lab_workflow_contract`, and `scripts/mvp-acceptance-smoke.mjs` runs it in the aggregate.
- Arc Lab trend contract exists at `server/arcLabTrends.mjs` with `arc_lab_trend_contract.v1`. It keeps lesson/homework, camera view, shot type, and coach-confirmed problem tag tracks separate; exposes recent 3-session comparison; creates a coach trend view with transfer context; and keeps student trend explanations hidden until coach confirmation.
- Arc Lab trend smoke exists at `scripts/arc-lab-trend-smoke.mjs`; `server/index.mjs --check` includes `arc_lab_trend_contract`, and `scripts/mvp-acceptance-smoke.mjs` runs it in the aggregate.
- Arc Lab knowledge assistant contract exists at `server/arcLabKnowledgeAssistant.mjs` with `arc_lab_knowledge_assistant_contract.v1`. It classifies student questions, allows general training and filming questions, refuses personal video diagnosis, keeps search/question logging off, keeps MVP chat history off, hides student question logs from coaches, cleans student-visible knowledge references, and enforces the default 20-answer daily AI limit.
- Arc Lab knowledge assistant usage flow now exists in `server/arcLabIdentityStore.mjs`: bound students can call `POST /api/arc-lab/student-knowledge-assistant`, successful general AI explanations increment `knowledge_assistant_usage`, personal-diagnosis refusals and over-limit replies do not store question text, and the local UI exposes the counter in `app/arc-lab.html`.
- Arc Lab knowledge assistant smoke exists at `scripts/arc-lab-knowledge-assistant-smoke.mjs`; `server/index.mjs --check` includes both `arc_lab_knowledge_assistant_contract` and `arc_lab_student_knowledge_usage_flow`, and `scripts/mvp-acceptance-smoke.mjs` runs it in the aggregate.
- Arc Lab student knowledge directory now exists in `server/arcLabIdentityStore.mjs` and `app/arc-lab.html`: only a phone-bound invite can call `GET /api/arc-lab/student-knowledge-directory`; the student sees the complete cleaned training directory, while raw source cards, source URLs, diagnosis rules, question storage, chat history, and personal video diagnosis remain unavailable.
- Arc Lab knowledge directory smoke exists at `scripts/arc-lab-knowledge-directory-smoke.mjs`; `server/index.mjs --check` includes `arc_lab_student_knowledge_directory_flow`, and `scripts/mvp-acceptance-smoke.mjs` runs it in the aggregate.
- Arc Lab platform blueprint exists at `server/arcLabPlatform.mjs` with `arc_lab_platform_mvp_blueprint.v1`. It combines the PRD-wide coach/student/admin page map, identity direction, coach home review queue, coach publish gate, student feedback result, homework policy, separated trends, knowledge assistant boundaries, 26-table data model, privacy boundaries, and analysis-lab preservation into one local contract.
- Arc Lab local platform shell exists at `app/arc-lab.html`, `app/arc-lab.css`, and `app/arc-lab.js`; it renders the coach queue, publish gate, student 3-step plan, knowledge assistant boundary, simplified trend, and privacy boundaries from `GET /api/arc-lab-platform`. The visible top is now a standalone Shooting Lab-style poster portal with only `教练端` and `学生端` entry buttons; after either entry is clicked, the poster is removed from the visible page and the chosen workbench starts at the top. The developer navigation is hidden, the one-click local demo flow has been removed, and the coach/student workbenches now use a dark poster-matched app shell with fixed bottom tab bars: coach `首页 / 复盘 / 学生 / 趋势`, student `首页 / 训练 / 知识 / 进步`. The coach `复盘` tab, student `首页` published-video area, and student `训练` homework/retest upload area now embed the complete original `AI 投篮实验室` workbench via `/?embedded=arc-lab-review`, preserving primary/supplemental video upload, browser playback, MediaPipe preview, evidence packet generation, coach report generation, annotated-frame export, and keyframes. Manual trend-metric entry fields stay hidden from coach/student forms while keeping local default values, the knowledge assistant appears only after a bound invite token opens the knowledge area, and product/production boundary cards render only as hidden backend panels.
- Arc Lab now has a local PWA shell: `app/arc-lab.webmanifest`, `app/arc-lab-sw.js`, and service-worker registration in `app/arc-lab.js`. The service worker caches only Arc Lab static shell assets and intentionally does not cache `/api/arc-lab` payloads.
- Target architecture scaffolds exist at `apps/coach-platform/`, `apps/analysis-lab/`, `packages/analysis-engine/`, and `supabase/migrations/0001_arc_lab_mvp_schema.sql`. `apps/coach-platform` now has a Next.js App Router scaffold with `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.mjs`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, and `lib/supabase-boundary.ts`; dependencies are locked with pnpm, local `next build` is verified by `scripts/arc-lab-next-platform-runtime-smoke.mjs`, and local Next dev mobile rendering is verified by `scripts/arc-lab-next-platform-browser-smoke.mjs`. The Supabase file is a schema/RLS draft, not a connected production database.
- Arc Lab platform smoke exists at `scripts/arc-lab-platform-smoke.mjs`; `server/index.mjs --check` includes `arc_lab_platform_mvp_blueprint`, and `scripts/mvp-acceptance-smoke.mjs` runs it in the aggregate.
- Arc Lab Next platform scaffold smoke exists at `scripts/arc-lab-next-platform-smoke.mjs`; `server/index.mjs --check` includes `arc_lab_next_platform_scaffold`, and the aggregate runner syntax-checks `server/arcLabNextPlatformScaffold.mjs`, `scripts/arc-lab-next-platform-smoke.mjs`, `scripts/arc-lab-next-platform-runtime-smoke.mjs`, and `scripts/arc-lab-next-platform-browser-smoke.mjs`. Runtime build and browser verification are focused smokes, not part of the default aggregate functional list because the runtime smoke may need npm registry access on a clean machine.
- Arc Lab Next platform runtime smoke exists at `scripts/arc-lab-next-platform-runtime-smoke.mjs`; it runs `pnpm install --frozen-lockfile` and `next build` with telemetry disabled, then verifies `.next/standalone` and `.next/static`. This is local build evidence only: no production deployment, live Supabase, SMS auth, or Storage path has been verified.
- Arc Lab Next platform browser smoke exists at `scripts/arc-lab-next-platform-browser-smoke.mjs`; it starts local `next dev`, renders the App Router page in headless Chrome at `390x844`, verifies no horizontal overflow, mobile single-column panels, coach/student/final-source boundary copy, hidden AI draft copy, local fallback link, and zero browser errors. This is local dev-browser evidence only, not a hosted production server.
- Arc Lab review experience exists in the local Coach OS: `GET /api/arc-lab/coach-review` and `GET /api/arc-lab/student-review` return an organization-scoped review payload with a square player, four default stages, current-problem overlay scope, and a current-plus-two-previous-session comparison. `GET /api/arc-lab/coach-videos` and `GET /api/arc-lab/student-videos` stream only locally attached video bytes after the corresponding mock identity boundary passes. Student payloads expose published lesson sessions only and exclude AI drafts and coach edit diffs.
- Arc Lab review smoke exists at `scripts/arc-lab-review-smoke.mjs`; it uploads the authorized synthetic video, verifies coach and student playback, normal/suffix/open-ended/invalid byte-range support including invalid `accept-ranges: bytes`, four stages, three-session comparison, AI draft exclusion, and cross-organization denial. The aggregate acceptance runner includes it.
- Arc Lab Coach Home now uses the local workflow store rather than the static platform blueprint after coach login. `GET /api/arc-lab/coach-home` returns an organization-scoped urgency queue and in-app notifications; `POST /api/arc-lab/coach-athlete-flags/priority` lets only the assigned coach set a private priority flag. Queue cards keep pre-confirmation main problems hidden while sorting retests first, then repeated unresolved work, waiting age, and priority status.
- Arc Lab Coach Home smoke exists at `scripts/arc-lab-coach-home-smoke.mjs`; it verifies queue ordering, private priority flags, pre-confirmation tag hiding, in-app notification levels, priority audit events, and cross-organization denial. The aggregate acceptance runner includes it.
- Arc Lab local Coach OS now has separate audited deletion actions for video assets, sessions, and athlete data. `POST /api/arc-lab/videos/delete`, `POST /api/arc-lab/sessions/delete`, and `POST /api/arc-lab/athlete-data/delete` are organization-scoped soft-delete contracts that write distinct `audit_events.action` values without claiming cloud or physical raw-video deletion.
- Arc Lab audited deletion smoke exists at `scripts/arc-lab-audited-deletion-smoke.mjs`; it verifies cross-organization denial, video deletion making review playback unavailable without deleting the session, session deletion hiding student/coach records without using the video-delete action, athlete data deletion blocking student access, and UI control presence. The aggregate acceptance runner includes it.
- Arc Lab deployment readiness gate exists at `server/arcLabDeploymentReadiness.mjs` and `GET /api/arc-lab-deployment-readiness`. It checks the static Supabase SQL contract plus required environment-variable groups for Supabase project access, migration apply, SMS auth, and private video Storage without contacting live external services or exposing secret values.
- Arc Lab deployment readiness smoke exists at `scripts/arc-lab-deployment-readiness-smoke.mjs`; it verifies the default blocked state when production env vars are missing, a fake complete-env path that only reaches `ready_for_manual_live_verification`, and the hard boundary that live Supabase/SMS/Storage remain unverified until a real external apply/probe is run.
- Arc Lab Supabase live verification gate exists at `server/arcLabSupabaseLiveVerification.mjs`, `GET /api/arc-lab-supabase-live-verification`, and `scripts/arc-lab-supabase-live-verification-smoke.mjs`. It defaults to `skipped_not_requested` with no external contact; only `ARC_LAB_LIVE_SUPABASE_VERIFY=1` plus Supabase URL/anon/service role/Storage bucket env vars can run read-only Auth/REST/Storage surface probes. It never applies migrations, writes database rows, uploads Storage objects, verifies SMS, or claims RLS policy-effect verification.
- The Supabase migration now requires `published_at is not null` before a bound student can select `coach_feedback`, `training_tasks`, or related `training_plan_steps`; deleted lesson sessions also stop authorizing student feedback reads. Static SQL sanity fails if these publish gates are removed.
- Arc Lab RLS live role verification gate exists at `server/arcLabSupabaseRlsLiveVerification.mjs`, `GET /api/arc-lab-supabase-rls-live-verification`, and `scripts/arc-lab-supabase-rls-live-verification-smoke.mjs`. It defaults to `skipped_not_requested`; an explicit staging-only opt-in plus coach/student JWTs and eight service-preflighted fixture rows can run 16 exact-ID read-only role probes for coach access, student draft isolation, published-only student results, and cross-organization denial. Tokens, origins, and fixture IDs are excluded from output.
- Supabase Storage object keys now use `organization_id/athlete_id/...`. `video_assets` and `storage.objects` student reads require a matching, non-deleted, student-visible session and the bound athlete; the old organization-member-wide Storage read policy was removed. Coach mutation paths must resolve to a real athlete inside the coach's organization.
- Arc Lab Storage live role verification gate exists at `server/arcLabSupabaseStorageLiveVerification.mjs`, `GET /api/arc-lab-supabase-storage-live-verification`, and `scripts/arc-lab-supabase-storage-live-verification-smoke.mjs`. It defaults to no external contact and, when explicitly enabled for staging, uses one-byte range reads to verify coach access plus own-visible, hidden, sibling-athlete, and cross-organization student boundaries without writing or deleting objects.
- Arc Lab Storage lifecycle verification gate exists at `server/arcLabSupabaseStorageLifecycleVerification.mjs`, `GET /api/arc-lab-supabase-storage-lifecycle-verification`, and `scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs`. It defaults to no external contact and only runs a controlled service-role test-object `upload -> one-byte range read -> delete -> read-after-delete` probe when a staging operator provides the exact write/delete confirmation and an object key under `organization_id/athlete_id/.../codex-storage-lifecycle/...`.
- Arc Lab package scripts now expose the live trend and Supabase production checks directly as `check:arc-lab-live-trend`, `check:arc-lab-supabase-production`, `check:arc-lab-supabase-live`, `check:arc-lab-supabase-rls-live`, `check:arc-lab-supabase-storage-live`, and `check:arc-lab-supabase-storage-lifecycle`, so the standalone verification entrypoints match the aggregate MVP runner.
- Phase 0.5 planning documents exist at the repository root.
- `server/index.mjs --check` validates the knowledge base, core documents, strict sample manifest policy, adapter config, and privacy boundary.
- The knowledge base is readable at `distillation/douyin-shooting-coach/outputs/knowledge_base.json` with `source_count=203`.
- Phase 1 smoke assets exist: `data/sample_manifest.json`, `data/synthetic_ball.mp4`, `scripts/phase1-sample-smoke.mjs`, and `docs/PHASE1_SMOKE_REPORT.md`.
- Phase 1 now has a browser-playable synthetic sample baseline: `data/synthetic_ball.mp4` is generated by `scripts/generate-synthetic-sample.swift` and is tracked in `data/sample_manifest.json` as 640x360, 30fps, 2.4s.
- Phase 1 sample UI smoke exists at `scripts/phase1-sample-ui-smoke.mjs`; it verifies `/api/samples`, normal, suffix, and open-ended byte-range sample video streaming, invalid range `416` with `accept-ranges: bytes`, `sample_id` analysis without copying into `data/uploads`, report contracts, frontend sample-loader bindings, and the upload-panel input contract warnings for view/fps/duration degradation.
- Authorized sample readiness smoke exists at `scripts/authorized-sample-readiness-smoke.mjs`; it verifies a metadata-only gate for future real or representative samples, requiring local analysis/local acceptance authorization, documented subject authorization, local-only retention, forbidden public/cloud/training uses, and readiness-safe diagnosis confidence. It does not read, stat, upload, decode, or analyze real video files.
- Authorized sample readiness API/UI smoke exists at `scripts/authorized-sample-readiness-ui-smoke.mjs`; it verifies `GET /api/authorized-sample-readiness`, the upload-panel `样例授权门禁` card, `sampleReadinessStatus`, `sampleReadiness`, candidate/ready counts, and metadata-only boundary copy.
- Authorized Alpha local analysis exists at `POST /api/authorized-alpha-analysis` with `authorized_alpha_analysis.v1`; it requires an existing local upload, `tester_agreement_id`, local analysis/local acceptance authorization, and forbidden public/external/cloud/training uses. It forces `review_only`, `not_for_player_diagnosis`, `short_term_review`, and low confidence. It is a local workflow gate, not proof of real player diagnosis quality.
- Authorized Alpha smoke exists at `scripts/authorized-alpha-analysis-smoke.mjs`; it uses the synthetic sample as a local upload surrogate, verifies rejected missing agreement ID, accepted local-only authorization, `authorized_alpha_test.v1` evidence boundary, player/lab report contracts, `short_term_review` save, privacy export raw-video exclusion, and frontend Alpha card bindings.
- Authorized real-folder smoke exists at `scripts/authorized-real-folder-smoke.mjs`; it is a manual local-only harness for user-provided authorized videos such as `测试用例/`, supports `--single-only` and `--files`, and is not part of the default functional aggregate because it depends on private local videos. The aggregate runner syntax-checks it only.
- Authorized real sample report exists at `docs/AUTHORIZED_REAL_SAMPLE_TEST_REPORT.md`; representative `front`/`side`/`side_back_candidate` videos from `测试用例/` were tested locally. RTMPose `.MOV` timeout was fixed by bounded frame sampling, YOLO remains candidate-only, side-back correctly degrades, and multi-angle now supports evidence packet reuse to avoid repeated adapter runs.
- The local upload UI now surfaces input contract warnings before analysis: non-`front`/`side` views, fps below 30, fps below the 60fps timing preference, videos shorter than 1500ms, and sub-640x360 metadata are shown as degradation or retake guidance. These warnings are advisory and do not claim real image quality or diagnosis quality.
- Sample manifest policy exists at `server/sampleManifestPolicy.mjs` and is used by both `server/index.mjs --check` and `scripts/sample-manifest-smoke.mjs`; it verifies authorized local synthetic samples only, local acceptance scope, forbidden uses, not-for-player-diagnosis boundary, file existence, and browser-video metadata.
- Mobile layout smoke exists at `scripts/mobile-layout-smoke.mjs`; it verifies viewport meta, 900px single-column layout, side-rail reset, video aspect ratio, multi-angle row wrapping, and 560px keyframe collapse.
- Mobile browser smoke exists at `scripts/mobile-browser-smoke.mjs`; it starts a temporary local server and headless Chrome, sets a 390x844 viewport, and verifies no horizontal overflow, no browser errors, and single-column computed layout for workspace, evidence panel, and keyframes. The legacy `.side-rail` check is optional because the current lab DOM uses `.evidence-panel` instead of a side rail.
- Phase 2 report contract is implemented through `server/reportContracts.mjs`; `/api/coach-report` returns legacy report, `player_report.v1`, and `lab_report.v1`.
- Phase 2 report contract smoke exists at `scripts/phase2-report-contract-smoke.mjs`; it verifies legacy/player/lab reports, evidence traceability, missing_evidence fallback, and frontend report section plus Evidence Trace bindings.
- Phase 2 report UI browser smoke exists at `scripts/phase2-report-ui-browser-smoke.mjs`; it uses the authorized synthetic sample through the page UI, verifies browser-visible player/lab report sections, schema versions, Evidence Trace, `signal_id`, `metric_id`, `rule_id`, missing evidence, model status, adapter fallback, and deletes the smoke-created SQLite session.
- Headless Chrome smokes now preallocate an available DevTools port before launching Chrome. This avoids relying on Chrome printing a `ws://` URL for `--remote-debugging-port=0`, which was not stable under the aggregate runner.
- Phase 3 ball trajectory module is implemented at `server/ballTrajectory.mjs`; it emits `ball_trajectory.v1` with `source_contract=candidate_only_yolo_adapter_output_not_stable_tracking`, `interpretation_policy=candidate_visualization_only_not_diagnosis`, and `diagnosis_allowed=false`.
- Phase 3 frontend no longer renders an airborne ball trajectory card or candidate ball-path overlay. The backend `ball_trajectory.v1` module remains available as an evidence contract, while the browser UI verifies `release_motion.v1` and `human_pose_motion_slice_only_no_airborne_ball_tracking`.
- Phase 3 ball trajectory contract smoke exists at `scripts/phase3-ball-trajectory-smoke.mjs`; it replays 14 synthetic adapter output fixtures from `data/fixtures/phase3-ball-trajectory-adapter-fixtures.json` to cover safe failure, adapter error, unsuitable view, low-resolution/motion-blur, occlusion, rim-out-of-frame, multiple-ball-candidate, invalid-ball-point filtering, invalid-rim-reference filtering, candidate, tracked, and low-confidence event contracts, checks direct module output, verifies the frontend release-motion/no-airborne-ball source contract, and now checks `README.md` plus `docs/PHASE3_BALL_TRAJECTORY_SMOKE.md` for stale frontend Ball Trajectory Card/candidate overlay claims.
- Phase 3 ball trajectory UI browser smoke exists at `scripts/phase3-ball-trajectory-ui-smoke.mjs`; it loads the local authorized synthetic sample, injects synthetic evidence into the page, and verifies the release-motion card and canvas overlay while confirming the UI does not show airborne trajectory preview or candidate ball-path copy.
- Phase 4 multi-angle endpoint exists at `POST /api/analyze-multi-angle` with `multi_angle_evidence_packet.v1`; it includes `sync_assessment.v1` with `precision=not_frame_accurate`, `risk_factors`, `risk_level`, and `retake_guidance`, and remains approximate grouping, not precise sync. It also includes `view_quality_assessment.v1` with `source_contract=metadata_and_evidence_context_only_not_real_frame_quality`; this is metadata/evidence-context gating, not real frame-quality analysis.
- Phase 4 multi-angle inputs may include a precomputed `evidence_packet.v1` per video; when present, the server reuses it instead of rerunning YOLO/RTMPose, but now rejects camera-view mismatches with `evidence_packet_camera_view_mismatch` and malformed or privacy-risk precomputed packet schemas with `evidence_packet_schema_invalid`. This is important for real `.MOV` samples where adapter inference dominates runtime, without allowing a side packet to be silently used as front evidence or an invalid/private-field packet to be silently accepted.
- Phase 4 frontend multi-angle flow now passes the just-generated primary `evidence_packet.v1` into `/api/analyze-multi-angle` when a paired view is uploaded, so the primary video evidence is reused instead of rebuilt during the same user analysis. The paired view still runs through the normal local analysis path, and this does not claim precise sync or real-sample diagnostic quality.
- Phase 4 multi-angle report contract is wired through `/api/coach-report`: multi-angle packets are normalized for report generation while `lab_report.multi_angle_context` preserves present/missing views, sync policy, `sync_assessment.v1`, `view_quality_assessment.v1`, `precision=not_frame_accurate`, sync risk evidence, and view-quality degradation. Side-only player reports now request the missing `front` view before fallback text parsing.
- Phase 4 multi-angle contract smoke exists at `scripts/phase4-multi-angle-smoke.mjs`; it verifies side-only, front-only, and front+side present/missing views plus metric/signal/rule provenance, `sync_assessment.v1`, `view_quality_assessment.v1`, sync risk factors, retake guidance, multi-angle report contracts, and frontend audit UI source binding.
- Phase 4 frontend Multi Angle card now shows sync assessment, sync risks, view quality assessment, retake guidance, view evidence rows, key metric source views, missing-view impact, rule views, and explicit approximate sync policy copy.
- Phase 4 multi-angle UI browser smoke exists at `scripts/phase4-multi-angle-ui-smoke.mjs`; it uploads the authorized synthetic sample twice, calls `/api/analyze-multi-angle`, and verifies front+side plus side-only packets render visible sync/audit/view-quality/risk rows in a 390x844 browser DOM.
- Phase 5 dynamic overlay draws coach lines and angle arcs from current-frame MediaPipe landmarks or RTMPose keypoints. Evidence-keyframe phase labels are available, Overlay Diagnostics explains the active overlay source and boundaries, and includes `real_authorized_sample_readability_checklist.v1` plus a structured `data-readability-status` manual-review gate. The page can export a local current-frame PNG combining video frame plus overlay canvas; the page also shows up to 3 recent annotated-frame thumbnails in browser memory only. There is no validated action-phase classifier.
- Phase 5 source-contract smoke exists at `scripts/phase5-dynamic-lines-smoke.mjs`; it verifies frontend surface, browser/precision pose bindings, coach-line labels, angle-arc labels, phase-label binding, Overlay Diagnostics, the readability checklist contract, structured readability statuses, low-confidence point guards, local annotated-frame PNG export contract, and local annotated-frame review strip contract. It is not browser visual verification.
- Phase 5 browser visual smoke exists at `scripts/phase5-browser-visual-smoke.mjs`; it loads the local authorized synthetic sample, injects deterministic synthetic RTMPose keypoints plus release-motion evidence, and verifies canvas pixels, coach-line/release-motion same-canvas overlay, Overlay Diagnostics, readability checklist boundary copy, `synthetic_overlay_visible_not_real_readability`, `partial_overlay_seek_another_frame`, `no_pose_evidence_for_readability`, local PNG frame export, browser-memory review thumbnail decode, seek phase changes, partial-overlay readability downgrade, and low-score coach-line guards. It is not real-sample readability, independent action-phase classification, stable ball tracking, or annotated video export.
- Phase 6 memory productization exposes local profile, training goals, recurring signals, confidence policy, recent sessions, and local session deletion.
- Phase 6 memory smoke exists at `scripts/phase6-memory-smoke.mjs`; it verifies long-term-only trend filtering, recurring signals from long-term sessions, and test session cleanup.
- Phase 6 memory UI browser smoke exists at `scripts/phase6-memory-ui-smoke.mjs`; it creates an isolated local SQLite test user, renders memory summary in a 390x844 browser DOM, verifies profile/trend/goals/signals/trend bars, and deletes all synthetic sessions.
- Phase 7 privacy boundary exposes local-only policy, upload inventory, local-user SQLite sessions batch deletion, per-file deletion, missing-file non-deletion reporting, non-managed local-file deletion guards, and dry-run/manual retention cleanup for controlled upload files.
- Phase 7 local JSON export exists at `GET /api/privacy-export`; it includes SQLite sessions, memory summary, and upload inventory metadata, but excludes raw video bytes and recursively redacts session fields that could expose embedded video data or local filesystem paths.
- Phase 7 privacy smoke exists at `scripts/phase7-privacy-smoke.mjs`; it verifies local-only boundary, privacy export redaction for leak-shaped session fields, local-user SQLite session deletion, current upload deletion, controlled historical upload deletion, missing managed upload deletion returning `404` with `deleted=false`, non-managed local upload-dir files staying hidden and undeleted, retention cleanup, and frontend bindings.
- Phase 7 privacy UI browser smoke exists at `scripts/phase7-privacy-ui-smoke.mjs`; it verifies the browser-visible privacy card, local-only boundary, JSON export exclusion/redaction copy, local-user SQLite session deletion controls, upload-file delete controls, and dry-run cleanup controls in a 390x844 viewport.
- Boundary claims smoke exists at `scripts/boundary-claims-smoke.mjs`; it scans docs/UI/server text for false completed claims around login/cloud, stable ball trajectory, final scoring formula, and real school-team video uses, while requiring key boundary copy to remain present.
- Phase completion audit exists at `scripts/phase-completion-audit.mjs`; it verifies Phase 1-7 Goal Backlog sections, required artifacts, package scripts, Acceptance Baseline evidence, Handoff evidence, preserved external gaps, forbidden placeholder absence, and aggregate runner binding. It is static evidence-chain validation, not a replacement for functional/browser smokes.
- Full MVP acceptance runner exists at `scripts/mvp-acceptance-smoke.mjs`; it runs `server/index.mjs --check`, syntax checks, boundary claims smoke, phase completion audit, sample manifest smoke, authorized Alpha smoke, mobile smokes, and Phase 1-7 contract/browser smokes in sequence with local-only environment variables. It retries only infrastructure startup flakes such as Chrome DevTools/server readiness, not assertion failures.

## Latest Validation

Last verified on 2026-06-27:

- Arc Lab workflow smoke passed with `schema_version=arc_lab_workflow_smoke.v1`, `source_contract=coach_review_publish_workflow_local_contract`, `draft.student_visible=false`, `published.student_visible=true`, `source_of_truth=coach_feedback`, three final plan steps, AI draft/diff hidden from students, and wrong-view homework saved as `supplemental_wrong_view_record` without counting as requested homework completion.
- Arc Lab trend smoke passed with `schema_version=arc_lab_trend_smoke.v1`, `source_contract=coach_confirmed_trend_tracks_local_contract`, 4 separated tracks, latest 3 lesson-side sessions, student current tag `hand_leads_before_lower_body`, one core metric `ball_lift_delay_ms`, hidden interpretive explanation before coach confirmation, and lesson/homework transfer state `lesson_improved_homework_improved`.
- Arc Lab knowledge assistant smoke passed with `schema_version=arc_lab_knowledge_assistant_smoke.v1`, `source_contract=student_knowledge_assistant_general_training_only`, 12 cleaned student-facing articles, personal video diagnosis refusal, general training explanation draft, no student question storage, no chat history, no coach-visible student question log, no raw source cards, the 20-answer daily AI limit, and local `knowledge_assistant_usage` counter validation without storing question text.
- Arc Lab knowledge directory smoke passed with `schema_version=arc_lab_knowledge_directory_smoke.v1`, `source_contract=bound_student_full_clean_knowledge_directory_without_raw_sources_or_question_log`, phone binding required, full cleaned directory visible, raw source cards hidden, no student question storage, and no personal video diagnosis.
- Arc Lab platform smoke passed with `schema_version=arc_lab_platform_smoke.v1`, `source_contract=coach_platform_student_platform_local_blueprint`, platform validation, API endpoint, static page, Next platform scaffold, Supabase schema draft, analysis-engine bridge, and 26 data-model tables.
- Arc Lab Next platform scaffold smoke passed with `schema_version=arc_lab_next_platform_smoke.v1`, `source_contract=nextjs_coach_platform_scaffold_with_separate_runtime_smoke`, App Router files `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`, declared dependencies `next`, `react`, `react-dom`, and `@supabase/supabase-js`, `pnpm-lock.yaml`, runtime/browser smoke bindings, local shell fallback `/arc-lab.html`, and live Supabase/SMS/Storage all still false.
- Arc Lab Next platform runtime smoke passed with `schema_version=arc_lab_next_platform_runtime_smoke.v1`, `source_contract=local_nextjs_build_verified_not_live_supabase_or_sms_storage`, `pnpm_frozen_lockfile_install=true`, `next_build=true`, `standalone_output_exists=true`, `static_assets_exist=true`, and `telemetry_disabled=true`.
- Arc Lab Next platform browser smoke passed with `schema_version=arc_lab_next_platform_browser_smoke.v1`, `source_contract=local_nextjs_dev_mobile_browser_smoke_not_production_deployment`, viewport `390x844`, `client_width=390`, `scroll_width=390`, `horizontal_overflow=false`, `next_dev_server_started=true`, `mobile_grid_collapsed=true`, `panel_count=3`, `browser_errors=0`, visible coach/student/final-source/runtime/local-fallback boundaries, and production deployment/live Supabase/SMS/Storage all still false.
- `server/index.mjs --check` includes `arc_lab_mvp_contract`, `arc_lab_workflow_contract`, `arc_lab_trend_contract`, `arc_lab_knowledge_assistant_contract`, `arc_lab_student_knowledge_directory_flow`, `arc_lab_platform_mvp_blueprint`, and `arc_lab_next_platform_scaffold`.
- Full MVP acceptance runner includes `server/arcLabWorkflow.mjs`, `server/arcLabTrends.mjs`, `server/arcLabKnowledgeAssistant.mjs`, `server/arcLabPlatform.mjs`, `server/arcLabNextPlatformScaffold.mjs`, `server/arcLabDeploymentReadiness.mjs`, the Supabase live verification modules including Storage lifecycle, `packages/analysis-engine/index.mjs`, the corresponding Arc Lab workflow/platform/Supabase smokes, and the existing Phase 1-7 checks. All four default-safe Supabase live gates are in the functional step list.
- Arc Lab PWA smoke exists at `scripts/arc-lab-pwa-smoke.mjs`; it verifies manifest metadata, theme color, service worker static shell allowlist, served manifest content type, and the no-API-cache boundary.
- Arc Lab mobile browser smoke reuses `scripts/mobile-browser-smoke.mjs --arc-lab`; it renders `/arc-lab.html` at `390x844`, verifies the standalone poster portal, hidden developer topbar, removed one-click demo entry, `教练端` / `学生端` poster buttons, fixed bottom tab bars for both roles, hidden manual metric fields, hidden initial knowledge assistant, hidden backend boundary cards, the coach review tab plus student home/training tabs' full original analysis-lab iframes with primary upload, supplemental upload, video replay, report generation, annotated-frame export, and keyframes, no horizontal overflow, single-column coach/student/trend layouts after tab entry, and zero browser errors.
- Arc Lab review smoke passed with `schema_version=arc_lab_review_smoke.v1`, local uploaded-video playback for coach and bound student, HTTP byte-range responses `normal=206`, `suffix=206`, `open_ended=206`, invalid range `416`, invalid range `accept-ranges=bytes`, four default stages, three-session comparison, hidden student AI draft/diff fields, and cross-organization denial.
- Arc Lab Coach Home smoke passed with `schema_version=arc_lab_coach_home_smoke.v1`, retest-first ordering, repeated-unresolved and priority queue signals, no pre-confirmation main problem, important retest/ineffective-plan notifications, audited priority changes, and cross-organization denial.
- Arc Lab audited deletion smoke passed with `schema_version=arc_lab_audited_deletion_smoke.v1`, separate `video_deleted` / `session_deleted` / `athlete_data_deleted` soft-delete actions, cross-organization denial, deleted video playback unavailable, deleted session hidden from coach and student results, deleted athlete access blocked, and no physical/cloud deletion claim.
- Arc Lab deployment readiness smoke passed with `schema_version=arc_lab_deployment_readiness_smoke.v1`, `readiness_status=blocked_missing_environment_or_sql_contract`, required env groups `supabase_project`, `supabase_migration_apply`, `sms_auth`, and `storage_boundary`, `missing_required_variable_count=9`, `live_external_services_contacted=false`, `live_supabase_project_connected=false`, and `secret_values_exposed=false`.
- Arc Lab Supabase live verification smoke passed with `schema_version=arc_lab_supabase_live_verification_smoke.v1`, default `skipped_not_requested`, explicit missing-env `blocked_missing_environment`, mock live `live_read_only_surface_verified_rls_effect_unverified`, endpoint `skipped_not_requested`, 26 table probes in the mock path, no default external contact, no secret-value exposure, no database mutation, no Storage upload, no SMS provider contact, and no RLS policy-effect claim.
- Arc Lab Supabase RLS live verification smoke passed with `schema_version=arc_lab_supabase_rls_live_verification_smoke.v1`, default `skipped_not_requested`, explicit missing-env `blocked_missing_environment`, mock role success `live_rls_role_behavior_verified`, intentional unpublished-feedback leak `live_rls_role_behavior_failed`, 8 fixture preflight probes, 16 coach/student role probes, no default external contact, and no token/origin/fixture-ID exposure.
- Arc Lab Supabase Storage live verification smoke passed with `schema_version=arc_lab_supabase_storage_live_verification_smoke.v1`, default `skipped_not_requested`, explicit missing-env `blocked_missing_environment`, mock role success `live_storage_read_policy_verified`, intentional sibling-athlete leak `live_storage_read_policy_failed`, 4 service preflight probes, 8 coach/student role probes, one-byte range-read boundary, no default external contact, and no token/origin/object-key exposure.
- Arc Lab Supabase Storage lifecycle verification smoke passed with `schema_version=arc_lab_supabase_storage_lifecycle_verification_smoke.v1`, default `skipped_not_requested`, explicit missing-env `blocked_missing_environment`, invalid object-key block `blocked_invalid_environment`, mock success `live_storage_lifecycle_verified`, upload-failure and cleanup-failure paths, 4 mock operations, no default external contact, and no URL/service-role/object-key exposure.

- Syntax check passed for the aggregate runner's 75 JavaScript/MJS files, including the Supabase live verification modules and smokes.
- Bundled Node acceptance check passed with `ok=true`; knowledge base was readable with `source_count=203`.
- Boundary claims smoke passed with `schema_version=boundary_claims_smoke.v1`, `source_contract=no_false_completed_claims_for_mvp_boundaries`, `checked_files=41`, and 5 required boundary text groups.
- Strict sample manifest policy passed through both `server/index.mjs --check` and `scripts/sample-manifest-smoke.mjs`; latest sample summary includes `sample_count=1`, `contains_real_school_team_video=false`, `local_acceptance_test` scope, `bytes=36433`, and `diagnosis_confidence=not_for_player_diagnosis`.
- Authorized sample readiness smoke passed with `schema_version=authorized_sample_readiness_smoke.v1`, `source_contract=metadata_only_no_real_video_file_access`, current manifest `status=waiting_for_authorized_samples`, `candidate_sample_count=0`, `ready_sample_count=0`, valid fixture `status=ready_for_local_authorized_sample_validation`, and invalid fixtures covering missing subject authorization, forbidden cloud scope, missing retention review date, public showcase permission, and over-strong diagnosis confidence.
- Authorized sample readiness UI/API smoke passed with `schema_version=authorized_sample_readiness_ui_smoke.v1`, `source_contract=api_and_frontend_binding_metadata_only`, endpoint `authorized_sample_readiness_audit.v1`, `status=waiting_for_authorized_samples`, `candidate_sample_count=0`, `ready_sample_count=0`, frontend `样例授权门禁` card bindings, and metadata-only boundary copy.
- Authorized Alpha analysis smoke passed with `schema_version=authorized_alpha_analysis_smoke.v1`, `source_contract=local_authorized_alpha_test_not_diagnosis`, rejected missing agreement ID, accepted `review_only` local authorization, `authorized_alpha_test.v1`, `diagnosis_allowed=false`, `max_report_confidence=low`, `short_term_review`, `long_term_written=false`, `raw_video_bytes=excluded`, `cloud_sync=not_implemented`, and frontend Alpha card bindings.
- Phase completion audit passed with `schema_version=phase_completion_audit.v1`, `source_contract=static_phase_1_to_7_completion_evidence_audit`, `phases_checked=7`, `artifacts_exist=true`, `package_scripts=true`, `acceptance_evidence=true`, `handoff_evidence=true`, `remaining_external_gaps_preserved=true`, `forbidden_placeholders_absent=true`, and `mvp_runner_binding=true`.
- Full MVP acceptance runner passed with `schema_version=mvp_acceptance_smoke.v1`, `source_contract=phase_1_to_7_local_acceptance_runner`, `command_count=121`, `syntax_files=75`, `smoke_steps=44`, `audit_steps=1`, `boundary_claims=true`, `phase_completion_audit=true`, `sample_manifest=true`, `authorized_sample_readiness=true`, `infrastructure_retries=0`, `retried_steps=[]`, and `elapsed_seconds=34.5`.
- `GET /api/privacy-export` returned `schema_version=privacy_export.v1`, `scope=local_json_export_no_raw_video_bytes`, `storage.raw_video_bytes=excluded`, `storage.cloud_sync=not_implemented`, and `upload_inventory.schema_version=upload_file_inventory.v1`.
- Static frontend resource check confirmed `main.js` includes `downloadPrivacyExport`, `fetchPrivacyExport`, and `/api/privacy-export`.
- Browser check on `http://localhost:4197` confirmed page load, MediaPipe `@mediapipe/tasks-vision@0.10.35` initialization, no console errors, authorized sample loader visibility, sample playback metadata `640x360 / 2.4s`, `memoryStatus=short_term_review`, low-confidence fallback report, `ballTrajectoryStatus=not_available`, and no static fake skeleton when no human pose is detected.
- Phase 1 sample smoke passed with `scripts/phase1-sample-smoke.mjs`: temporary server startup, authorized sample check, upload, `evidence_packet.v1`, fallback coach report, `player_report.v1`, `lab_report.v1`, `short_term_review` save, `long_term_written=false`, memory summary, session cleanup, and upload cleanup. Latest upload byte count was `36433`, with `review_sessions_excluded=29`.
- Phase 1 sample UI smoke passed with `scripts/phase1-sample-ui-smoke.mjs`: `sample_list.v1`, range video status `206`, suffix range status `206`, open-ended range status `206`, invalid range status `416`, invalid range `accept-ranges=bytes`, sample metadata `640x360 / 30fps / 2400ms`, evidence `video_layer=local_authorized_sample_ready`, `sample_id=synthetic_ball`, player/lab report contracts, and frontend `inputContractWarnings` bindings.
- Mobile layout smoke passed with `schema_version=mobile_layout_smoke.v1`, `source_contract=mobile_first_local_web_prototype`, and breakpoints `max-width: 900px` / `max-width: 560px`.
- Mobile browser smoke passed with `schema_version=mobile_browser_smoke.v1`, `source_contract=chrome_headless_390x844_layout_baseline`, viewport `390x844`, `client_width=390`, `scroll_width=390`, `horizontal_overflow=false`, and `browser_errors=0`.
- Phase 2 report contract smoke passed with `scripts/phase2-report-contract-smoke.mjs`: legacy report, `player_report.v1`, `lab_report.v1`, player missing_evidence uncertainties, lab metrics/signals/rules/missing evidence, and frontend Evidence Trace bindings.
- Phase 2 report UI browser smoke passed with `scripts/phase2-report-ui-browser-smoke.mjs`: `schema_version=phase2_report_ui_browser_smoke.v1`, source contract `browser_dom_report_split_player_lab`, visible `player_report.v1`, `lab_report.v1`, `Evidence Trace`, `signal_id`, `metric_id`, `rule_id`, `missing_evidence`, model status, adapter fallback, and cleanup deleted 1 smoke-created session.
- Latest smoke output had `analysis_mode=fallback_contract`, `max_report_confidence=low`, `object_detection_layer=adapter_not_configured`, `precision_layer=adapter_not_configured`, and `trend_source=long_term_only`.
- Phase 3 ball trajectory smoke passed with `fixture_schema_version=phase3_ball_trajectory_adapter_fixtures.v1`, `source_contract=synthetic_adapter_output_replay_no_real_video`, and 14 synthetic adapter fixture scenarios: `adapter_not_configured`, `adapter_error`, `ball_missing`, `rim_missing`, `sparse_candidate`, `camera_view_not_suitable`, `low_resolution_or_motion_blur`, `ball_occluded_by_body`, `rim_out_of_frame`, `multiple_ball_candidates`, `invalid_ball_points_filtered`, `invalid_rim_reference_filtered`, `tracked_candidate_make`, and `low_confidence_event_candidate`; latest output included direct `server/ballTrajectory.mjs` module checks, invalid adapter point filtering with `valid_ball_points=2` and `invalid_ball_points=2`, invalid adapter rim filtering with `missing_evidence.reason=invalid_rim_reference`, `frontend_overlay.source_contract=frontend_airborne_ball_path_removed_release_motion_active`, `documentation_contract.source_contract=docs_match_frontend_no_airborne_ball_overlay`, and `diagnosis_allowed=false`.
- Phase 3 ball trajectory UI browser smoke passed with `schema_version=phase3_ball_trajectory_ui_smoke.v1`, `source_contract=browser_dom_release_motion_card_and_canvas_no_airborne_ball_overlay`, viewport `390x844`, visible release-motion cards, release-motion overlay pixels, `human_pose_motion_slice_only_no_airborne_ball_tracking`, and “不直接支撑动作诊断”, while confirming the frontend does not show airborne trajectory preview or candidate ball-path copy.
- Phase 4 multi-angle smoke passed with side-only, front-only, and front+side synthetic inputs; `sync_policy=approximate_session_grouping_no_manual_keyframe_sync`, `sync_assessment.v1`, `precision=not_frame_accurate`, `risk_level=high`, sync `risk_factors`, `retake_guidance`, metric `source_view`, signal `source_view`, rule `source_views`, and `view_quality_assessment.v1` were preserved. Latest output included `report_contracts.side_only.player_next_view=front`, `lab_evidence_packet_version=multi_angle_evidence_packet.v1`, `lab_analysis_mode=multi_angle_approximate_grouping`, `sync_risk_evidence_count=4`, `view_quality_status=insufficient` for side-only, `view_quality_status=metadata_ready` for front+side, `frontend_audit.source_contract=multi_angle_audit_ui_candidate_only`, reused primary `session_id` preservation, mismatched precomputed evidence rejection via `evidence_packet_camera_view_mismatch`, malformed precomputed schema rejection via `evidence_packet_schema_invalid`, and privacy-risk precomputed field rejection via `evidence_packet_schema_invalid`.
- Phase 4 multi-angle UI browser smoke passed with `schema_version=phase4_multi_angle_ui_smoke.v1`, `source_contract=browser_dom_multi_angle_audit_visibility`, viewport `390x844`, front+side `row_count=26`, side-only `row_count=20`, both kept `sync_policy=approximate_session_grouping_no_manual_keyframe_sync`, both rendered `sync_assessment.v1` with `precision=not_frame_accurate`, `risk_level=high`, sync risks, retake guidance, and both rendered `view_quality_assessment.v1`; front+side showed `view_quality_front_side_metadata_ready`, side-only showed `view_quality_missing_front`, the reused primary evidence packet preserved its original `session_id`, and the boundary list included `view_quality_metadata_only` plus `primary_evidence_packet_reuse_no_duplicate_primary_adapter_run`.
- Phase 5 dynamic lines source-contract smoke passed with `schema_version=phase5_dynamic_lines_smoke.v1`, `source_contract=source_check_only_not_visual_browser_verification`, browser pose binding, precision pose binding, phase labels, coach-line labels, angle arcs, `coach_overlay_diagnostics.v1`, `real_authorized_sample_readability_checklist.v1`, `phase_source=evidence_keyframes_not_classifier`, `human_pose_motion_slice_only_no_airborne_ball_tracking`, `manual_review_gate_not_quality_claim`, `partial_overlay_seek_another_frame`, `annotated_frame_export.v1`, `local_review_preview=browser_memory_recent_3_png_data_urls`, `visibility < 0.5`, `score < 0.2`, and finite-coordinate guards.
- Phase 5 browser visual smoke passed with `schema_version=phase5_browser_visual_smoke.v1`, `source_contract=browser_canvas_visual_check_synthetic_keypoints_and_release_motion`, canvas `314x240`, good-frame `coach_color_pixels=2496`, `release_motion_color_pixels=675`, `overlay_diagnostics_status=rtmpose_precision_pose`, `overlay_diagnostics_contract=coach_overlay_diagnostics.v1`, and `readability_status=synthetic_overlay_visible_not_real_readability`, local frame export `annotated_frame_export.v1` with `data_url_length=53950`, annotated-frame review `thumb_count=1`, decoded image `314x240`, `storage_boundary=browser_memory_only`, seek-frame phase changed to `出手点` while retaining release-motion pixels, partial-overlay frame downgraded to `readability_status=partial_overlay_seek_another_frame`, low-score frame showed reduced coach-line pixels with `readability_status=no_pose_evidence_for_readability` and `score<0.2` overlay guard, and the boundary list includes `real_authorized_readability_checklist_only`.
- Phase 6 memory smoke passed with an isolated test user: 2 long-term sessions, 1 short-term review session, trend values `[220, 120]`, `review_sessions_excluded=1`, recurring signal count `2`, and cleanup left `session_count=0`.
- Phase 6 memory UI browser smoke passed with `schema_version=phase6_memory_ui_smoke.v1`, `source_contract=browser_dom_memory_card_local_sqlite_visibility`, viewport `390x844`, `chart_bar_count=2`, `pill_count=2`, `count_text=2 long-term / 1 review`, and cleanup left `after_delete_session_count=0`.
- Phase 7 privacy smoke passed: local-only boundary, `privacy_export.v1` with raw video bytes excluded and `local_file_paths=redacted`, leak-shaped session redaction removing 10 private fields, local-user SQLite deletion of 3 isolated sessions with `scope=local_sqlite_sessions_only` and `raw_video_deleted=false`, current upload delete, controlled file delete, missing managed upload delete returning `status=404`, `deleted=false`, `error=upload_file_not_found`, non-managed local upload-dir file returning `status=400` and staying undeleted, retention cleanup dry-run/run, and frontend privacy bindings.
- Phase 7 privacy UI browser smoke passed with `schema_version=phase7_privacy_ui_smoke.v1`, `source_contract=browser_dom_privacy_boundary_export_upload_cleanup`, viewport `390x844`, local-only/raw-video/SQLite/cloud-sync/forbidden-use copy visible, `privacy_export.v1` excluding raw video bytes with `local_file_paths=redacted`, UI local-user SQLite deletion leaving `sessions_after_delete=0`, UI file delete removing a controlled upload, and dry-run cleanup keeping its candidate file.
- Residue checks found no latest Phase 1/7 upload files, no Phase 7 UI temp upload files, and no `phase6_smoke_%` rows in `training_sessions`. Four `synthetic_ball.mp4` short-term review sessions remain from 2026-06-13 and were not created by the latest Phase 2 UI browser smoke.
- Boundary scan found only negative/constraint statements for login/cloud, stable ball trajectory, precise cross-camera sync, final scoring formula, and forbidden privacy uses; no false completed claims were found.
- Current shell has no `npm`; use the bundled Node command for `server/index.mjs --check` and smoke scripts.
- In-app Browser viewport automation was attempted for the mobile layout check but failed with `native pipe closed before response`; use `scripts/mobile-browser-smoke.mjs` as the current reproducible browser-width mobile check.

## Verification Commands

Current bundled runtime has `node` but no `npm`, so use `node server/index.mjs --check` directly when the shell cannot find `npm`:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/index.mjs --check
```

Full MVP local acceptance:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mvp-acceptance-smoke.mjs
```

Arc Lab workflow smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-workflow-smoke.mjs
```

Arc Lab trend smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-trend-smoke.mjs
```

Arc Lab knowledge directory smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-knowledge-directory-smoke.mjs
```

Arc Lab review smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-review-smoke.mjs
```

Arc Lab Coach Home smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-coach-home-smoke.mjs
```

Arc Lab audited deletion smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-audited-deletion-smoke.mjs
```

Arc Lab deployment readiness smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-deployment-readiness-smoke.mjs
```

Arc Lab live trend smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-live-trend-smoke.mjs
```

Arc Lab Supabase production contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-production-smoke.mjs
```

Arc Lab Supabase Storage lifecycle verification smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs
```

Boundary claims smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/boundary-claims-smoke.mjs
```

Phase completion audit:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase-completion-audit.mjs
```

Sample manifest smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sample-manifest-smoke.mjs
```

Authorized sample readiness smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-ui-smoke.mjs
```

Authorized Alpha local analysis smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-alpha-analysis-smoke.mjs
```

Focused syntax check:

```bash
NODE=/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
for f in app/main.js server/index.mjs server/uploadStore.mjs server/memoryStore.mjs server/ballTrajectory.mjs server/visionPipeline.mjs server/multiAngleEvidence.mjs server/reportContracts.mjs server/alphaTestPolicy.mjs server/sampleManifestPolicy.mjs server/sampleReadinessPolicy.mjs scripts/mobile-layout-smoke.mjs scripts/mobile-browser-smoke.mjs scripts/boundary-claims-smoke.mjs scripts/phase-completion-audit.mjs scripts/sample-manifest-smoke.mjs scripts/authorized-sample-readiness-smoke.mjs scripts/authorized-sample-readiness-ui-smoke.mjs scripts/authorized-alpha-analysis-smoke.mjs scripts/authorized-real-folder-smoke.mjs scripts/phase1-sample-smoke.mjs scripts/phase1-sample-ui-smoke.mjs scripts/phase2-report-contract-smoke.mjs scripts/phase2-report-ui-browser-smoke.mjs scripts/phase3-ball-trajectory-smoke.mjs scripts/phase3-ball-trajectory-ui-smoke.mjs scripts/phase4-multi-angle-smoke.mjs scripts/phase4-multi-angle-ui-smoke.mjs scripts/phase5-dynamic-lines-smoke.mjs scripts/phase5-browser-visual-smoke.mjs scripts/phase6-memory-smoke.mjs scripts/phase6-memory-ui-smoke.mjs scripts/phase7-privacy-smoke.mjs scripts/phase7-privacy-ui-smoke.mjs scripts/mvp-acceptance-smoke.mjs; do
  "$NODE" --check "$f" || exit 1
done
```

Phase 1 sample smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-smoke.mjs
```

Phase 1 sample UI smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-ui-smoke.mjs
```

Mobile layout smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-layout-smoke.mjs
```

Mobile browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-browser-smoke.mjs
```

Arc Lab mobile browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-browser-smoke.mjs --arc-lab
```

Regenerate the synthetic browser-playable sample:

```bash
swift scripts/generate-synthetic-sample.swift data/synthetic_ball.mp4
```

Phase 2 report contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-contract-smoke.mjs
```

Phase 2 report UI browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-ui-browser-smoke.mjs
```

Phase 3 ball trajectory contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-smoke.mjs
```

Phase 3 ball trajectory UI browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-ui-smoke.mjs
```

Phase 4 multi-angle contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase4-multi-angle-smoke.mjs
```

Phase 4 multi-angle UI browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase4-multi-angle-ui-smoke.mjs
```

Phase 5 dynamic lines source-contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-dynamic-lines-smoke.mjs
```

Phase 5 browser visual smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-browser-visual-smoke.mjs
```

Phase 6 memory contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase6-memory-smoke.mjs
```

Phase 6 memory UI browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase6-memory-ui-smoke.mjs
```

Phase 7 privacy contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase7-privacy-smoke.mjs
```

Phase 7 privacy UI browser smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase7-privacy-ui-smoke.mjs
```

Local server smoke:

```bash
PORT=4173 DEEPSEEK_API_KEY= YOLO_COMMAND= RTMPOSE_COMMAND= "$NODE" server/index.mjs
```

Then open `http://localhost:4173`.

## Hard Boundaries

- Do not upload, read, or redistribute real school-team video unless the user explicitly provides and authorizes it.
- Do not introduce a paid API, cloud service, login system, external training loop, or model-hosted storage as a hard dependency without user confirmation.
- Do not describe login/cloud sync, stable ball trajectory, validated dynamic coach lines, or final scoring formula as completed facts.
- Keep raw uploads, SQLite memory, and cleanup behavior local-first unless a future phase explicitly changes the architecture.

## Next Work

1. Keep `docs/HANDOFF.md` updated before any context-heavy continuation.
2. Continue local verification after each slice with `npm run check` when `npm` exists, otherwise use bundled `node server/index.mjs --check`.
3. User-confirmed wrap-up mode is active: do not automatically open new slices; after the current Phase 5 partial-overlay closure, default to focused smokes only. Run full MVP acceptance only when the user explicitly asks, or after 3-5 additional small slices.
4. Add only small, visible, reversible improvements that map to Phase 1-7 acceptance criteria.
5. Use `ponytail` discipline for this project: the smallest working slice, no speculative abstractions, and one focused runnable check for non-trivial logic.
6. Use `deepseek-sidecar-router` for bounded, low-risk, read-only or easily verified worker tasks when the local DeepSeek sidecar is available; Codex remains owner for planning, code, risk, and final verification.
7. Prefer high-risk modules first: sample-video closure, ball trajectory failure modes, paired-view evidence reuse/readability, dynamic overlay readability, and privacy deletion/export boundaries.
8. Phase 5 next deeper slice: when an explicitly authorized real/representative sample is provided, use the existing readability checklist plus local annotated-frame review to do human readability review; no cloud/video export and no diagnosis-quality claim.
9. Phase 3 next deeper slice: use an explicitly authorized representative sample when available; adapter-output replay now covers occlusion, rim-out-of-frame, and multiple-ball-candidate failure modes. Do not describe current YOLO as stable tracking.
10. Record any code-document conflict in the relevant Phase smoke doc instead of silently widening the product promise.
11. Latest sidecar check for this continuation failed before worker output: DeepSeek proxy was not running at `http://127.0.0.1:12359/v1`, and `codex doctor -c profile=deepseek --json --summary` reported config load and provider reachability failures. Treat sidecar evidence as unavailable until the local DeepSeek profile/proxy is fixed.

## Remaining Gaps

- No authorized real shooting sample has been validated end to end.
- No precise cross-camera synchronization.
- No validated action-phase classifier.
- No exported annotated video.
- No login, account, cloud sync, organization permission, authorization withdrawal, cloud export, cloud deletion workflow, or raw video export.
- No final scoring formula. This is a legacy scoring-research boundary, not a current Arc Lab MVP requirement unless the user explicitly reopens scoring.

## Arc Lab Live Trend Slice

Last verified on 2026-06-28:

- `server/arcLabIdentityStore.mjs` now writes local `athlete_metric_snapshots` only after the lesson primary tag is coach confirmed, or for homework inheriting a published task's coach-confirmed primary tag.
- `GET /api/arc-lab/coach-trends` is organization-scoped and shows separated lesson/homework, side/front/back, shot-type, and primary-tag tracks. `GET /api/arc-lab/student-trends` returns only the current simplified trend.
- `POST /api/arc-lab/coach-trends/explanation` persists a coach-confirmed `trend_explanation_drafts` record. Student explanations stay hidden until that confirmation and do not expose draft JSON.
- `scripts/arc-lab-live-trend-smoke.mjs` verifies metric snapshots, wrong-view front-track retention, lesson-to-homework transfer, student explanation gating, and cross-organization denial.
- The local upload UI asks for a manually recorded metric value. Lesson values are coach-recorded and homework values athlete-submitted; neither is automatic video metric extraction and neither must be presented as such.

## Arc Lab Supabase/RLS Productionization Slice

Last verified on 2026-06-28:

- `supabase/migrations/0001_arc_lab_mvp_schema.sql` now includes RLS enablement for all 26 MVP tables, organization-scoped helper functions, coach-only AI draft/task draft access, and a private `arc-lab-videos` Storage bucket contract scoped by organization plus athlete object-key prefixes.
- The same migration defines separate audited soft-delete RPCs: `arc_lab_mark_video_deleted`, `arc_lab_mark_session_deleted`, and `arc_lab_mark_athlete_data_deleted`; each writes a distinct `audit_events.action`.
- `server/arcLabSupabaseProduction.mjs` validates the SQL contract without requiring a live Supabase project.
- `scripts/arc-lab-supabase-production-smoke.mjs` verifies table coverage, RLS coverage, Storage privacy, and the three audited deletion actions.
- `scripts/arc-lab-supabase-sql-sanity-smoke.mjs` adds static SQL sanity checks for duplicate policies, Security Definer/search_path boundaries, student-hidden AI drafts, published-only student feedback/tasks/plan steps, session-visible own-athlete Storage access, coach-confirmed trend explanations, and the non-storage of student knowledge assistant questions. This is still not a live Supabase apply.
- `server/arcLabDeploymentReadiness.mjs` and `scripts/arc-lab-deployment-readiness-smoke.mjs` now provide a production readiness gate for Supabase URL/keys, migration apply credentials, SMS provider credentials, and private Storage bucket naming. The gate intentionally does not contact live external services and never exposes secret values.
- `server/arcLabSupabaseLiveVerification.mjs` and `scripts/arc-lab-supabase-live-verification-smoke.mjs` now provide an opt-in, read-only live Supabase surface probe. It can verify Auth/REST table surface/Storage bucket reachability when explicitly enabled with local env vars, while keeping RLS role behavior, SMS auth, migration apply, and Storage object upload as separate manual/live gates.
- `server/arcLabSupabaseRlsLiveVerification.mjs` and `scripts/arc-lab-supabase-rls-live-verification-smoke.mjs` provide a staging-only, read-only coach/student role probe with service-role fixture preflight. The mock success and intentional leak paths are verified, but no live role tokens or fixture IDs are configured in this workspace.
- `server/arcLabSupabaseStorageLiveVerification.mjs` and `scripts/arc-lab-supabase-storage-live-verification-smoke.mjs` provide a staging-only, read-only Storage role probe covering own-visible, own-hidden, same-organization sibling-athlete, and cross-organization objects. The mock success and intentional sibling leak paths are verified; no live object keys are configured here.
- `server/arcLabSupabaseStorageLifecycleVerification.mjs` and `scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs` provide a staging-only controlled Storage object lifecycle probe. The mock success, upload-failure, and cleanup-failure paths are verified; no live lifecycle write/delete probe has run in this workspace.
- This remains a migration/contract/readiness/live-probe slice. It has not been applied to a live Supabase project in this workspace, live database or Storage role behavior has not run against staging, the controlled Storage lifecycle write/delete probe has not run against staging, SMS auth is not configured, and local uploads still do not send user video bytes to cloud Storage.
