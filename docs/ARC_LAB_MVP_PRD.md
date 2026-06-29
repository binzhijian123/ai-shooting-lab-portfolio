# Arc Lab MVP PRD and Technical Split

Updated: 2026-06-26

## Status

This document captures the product decisions confirmed in the Arc Lab planning conversation. It is a working MVP spec, not an implementation plan.

## Sources

- Existing local prototype: `AI 投篮实验室`
- Product docs: `PRODUCT.md`, `Product-Spec.md`, `README.md`
- Analysis modules: `server/metricsEngine.mjs`, `server/visionPipeline.mjs`, `server/index.mjs`, `server/memoryStore.mjs`
- Knowledge assets: `distillation/douyin-shooting-coach/outputs/knowledge_base.json`
- Obsidian graph: `obsidian/投篮规则知识图谱/`

Verified existing assets:

- The current project can produce action angle metrics, evidence packets, AI coach report drafts, local sessions, feedback, and memory summaries.
- The Obsidian graph contains a training family with 9 training nodes.
- The generated knowledge base contains repair actions and rule cards that can be used as a broader candidate pool.

## Product Positioning

Arc Lab is a coach-led basketball shooting teaching platform.

The system does not replace the coach. It extracts shooting evidence from videos, retrieves relevant knowledge, creates AI drafts, and helps the coach publish final feedback and training tasks to students.

Core positioning:

```text
Student video
-> action evidence
-> knowledge retrieval
-> AI draft
-> coach confirmation
-> student training plan
-> retest video
-> long-term progress trend
```

Primary value:

- Preserve a student's shooting development over time.
- Let coaches see whether training actually changes angle, timing, and repeated problem patterns.
- Connect offline coaching, homework practice, retest videos, and long-term progress.

Non-positioning:

- Not an AI automatic scoring tool.
- Not an AI final diagnosis tool.
- Not a chat app.
- Not a public SaaS marketplace in the first version.

## Existing Project Role

The existing `AI 投篮实验室` remains active and keeps its original name.

Its role becomes the analysis lab and evidence engine source:

```text
AI 投篮实验室
= analysis lab, action angle recognition, evidence packet, knowledge base, AI draft debugging

Arc Lab
= coach-student teaching platform, tasks, feedback, homework, trends
```

Technical direction:

- Create a new Next.js + Supabase platform.
- Extract reusable analysis logic into an internal `analysis-engine` package.
- Preserve as much useful existing functionality as possible.
- Remove or de-emphasize only redundant showcase/marketing UI that does not support coaching, evidence, trend, or analysis debugging.

## Architecture Direction

Target repo shape:

```text
apps/coach-platform
  Next.js Web App / mobile-first PWA

apps/analysis-lab
  Existing AI 投篮实验室, retained as lab/debugging UI

packages/analysis-engine
  metrics, evidence packet, knowledge retrieval, report contracts, prompt/report helpers

supabase
  Auth, Postgres, Storage, RLS, migrations, seeds
```

First client:

- Mobile-first Web App / PWA.
- Future client: mini program.
- The product is a platform; the mini program is only one future client.

## Roles

### Coach

Uses phone number login.

Primary jobs:

- Add students.
- Generate student invite links.
- Upload offline lesson videos.
- Review homework videos.
- Confirm main and secondary problem tags.
- Edit AI drafts.
- Publish feedback and training plans.
- Review trends.

### Student

Uses invite link.

First access:

- Opens coach invite link.
- Binds phone number.
- Later can access without complex login.

Primary jobs:

- Watch lesson videos.
- View coach feedback.
- Complete homework plans.
- Upload homework/retest videos.
- View simplified progress.

### Admin

First version has minimal admin needs.

Initial rule:

- When a coach first logs in, create a default organization automatically.
- Organization-level optimization can use internal organization data only.
- No cross-organization sharing in MVP.

## Identity and Access

Confirmed rules:

- Coach uses phone login.
- Student enters via invite link.
- Student invite link requires first-time phone binding.
- Future visits are lightweight and do not require a complex login flow.
- Coach first login creates a default organization.
- Coach first action is adding a student and generating an invite link.

Open implementation detail:

- Invite link validity duration still needs final confirmation.
- Default proposal: reusable invite link with a 30-day validity period; one-time links reserved for sensitive operations.

## Video Sources

Arc Lab has two distinct video sources.

### Lesson Video

Uploaded by coach after offline training.

Purpose:

- Record offline training effect.
- Provide a reliable baseline.
- Feed the main progress trend.
- Let students review class footage after training.

Rules:

- Default visible to the student.
- Still provide a visibility toggle for special cases.
- Runs through evidence packet and AI draft.
- Has higher trend weight than homework videos.
- Must choose a problem tag before upload.
- Must choose camera view.
- Must choose shot type.

### Homework Video

Uploaded by student after home practice.

Purpose:

- Show whether the student practiced.
- Retest whether the training plan transferred outside class.
- Feed auxiliary progress trends.

Rules:

- Follows the homework task's requested camera view.
- If the student uploads a wrong view, save it as a supplemental record.
- Wrong-view video does not count as completing that homework requirement.
- Wrong-view video can still enter the matching view's trend track.

## Camera View Rules

Any video can be uploaded, but each view only contributes to metrics observable from that view.

View tracks:

```text
side view -> side-view trend
front view -> front-view trend
back view -> back-view trend
```

Side view is the preferred main view.

Side view is best for:

- Ball lift and lower-body timing.
- Knee angle.
- Trunk lean.
- Release height.
- Release phase.
- Power-chain continuity.

Front view is best for:

- Elbow flare.
- Left-right ball path.
- Guide-hand interference.
- Shoulder-elbow-wrist alignment.
- Left-right body shift.

Back view is best for:

- Release line direction.
- Ball path direction.
- Stance direction.
- Shooting-line consistency.

First-version view recognition:

- Manual view selection is primary.
- System may show mismatch hints.
- System does not force automatic view classification.

## Shot Type

Every uploaded video must select a shot type.

Initial shot types:

- Spot-up shot.
- Catch-and-shoot.
- Pull-up after dribble.
- Stop-jump shot.
- Free throw.

Trend keys should be separated by:

```text
camera view + shot type + problem tag
```

## Problem Tags

Problem tags are the core coaching taxonomy.

MVP rule:

- No separate "training theme" concept.
- Lesson upload chooses a problem tag directly.
- That initial tag provides context only.
- Final trend uses coach-confirmed tags after review.

Problem confirmation:

- One required primary problem.
- Up to two secondary problems.
- Free-text coach note is allowed.

Search:

- Problem tags support search.
- Search returns standard problem tags, synonyms, related drills, and knowledge references.
- Final saved tags must be standard tags for clean trends.

Ordering:

```text
evidence-related tags first
then fixed category groups
then coach common tags, after enough history exists
```

Important wording:

- Evidence-related means "recommended for coach confirmation", not system diagnosis.

MVP tag size:

- 15-20 built-in problem tags.
- Shared system-wide in first version.
- No organization or coach custom tags in MVP.

## Training and Drill Library

The Obsidian training graph is the first high-quality drill source.

Verified training nodes:

- `伸髋带动起球`
- `低位到高位起球`
- `单手直线投篮`
- `压弹式起跳训练`
- `垫步触地即弹`
- `无球蹬地起球同步`
- `核心抗前冲定点投`
- `辅助手隔离训练`
- `近筐节奏投`

Knowledge base `repair_actions` can be used as a broader candidate pool.

Recommended drill retrieval:

```text
confirmed problem tag
-> related signals and knowledge terms
-> Obsidian training nodes
-> knowledge_base repair_actions
-> deduplicate and rank
-> AI synthesizes a draft training plan
-> coach edits and publishes
```

Do not show all repair actions directly to the student.

Productized drill fields:

- Slug.
- Name.
- Category.
- Purpose.
- Related problem tags.
- Related signals.
- Default dosage.
- Coaching cues.
- Success metric.
- Required view.
- Safety boundary.
- Source Obsidian path.
- Source rule cards.

## Paid Student Knowledge Assistant

Paid offline students get access to a training knowledge assistant.

This is an MVP module, but it must stay outside the core coaching judgment loop. Its job is to help students understand training knowledge, not diagnose their personal videos.

Positioning:

```text
training knowledge assistant
= searchable training library
+ AI explanation of organized knowledge
+ explanation of drills, shooting concepts, and filming requirements
- personal video diagnosis
- AI final coaching judgment
```

Student can use it to ask:

- How to do a drill.
- What a shooting concept means.
- Why a drill matters.
- How to film side/front/back view videos.
- What a common problem tag means in general.

Examples:

```text
How do I do no-ball lower-body and ball-lift sync?
What does hand leads before lower body mean?
How should I film a side-view shooting video?
Why do I need close-range rhythm shooting?
```

Student cannot use it for direct personal diagnosis:

```text
Is my video hand-leading?
What is wrong with my shot?
Should I change my form?
```

If a student asks for personal judgment, the assistant should respond that personal conclusions require coach-confirmed feedback and video review.

MVP content access:

- Students can browse the full organized knowledge directory.
- Student-facing content is cleaned and organized.
- Students do not see original Douyin sources.
- Students do not see source card IDs.
- Students do not see raw rule cards, evidence rules, or professional false-positive detail.
- Coach-side tools can expose source and rule detail when needed.

MVP assistant behavior:

- Search does not save student questions.
- No chat history in MVP.
- No student question log shown to coaches.
- Knowledge search can be unlimited.
- AI-generated answers should be lightly rate-limited.
- Default rate limit proposal: 20 AI answers per student per day.
- Only show boundary reminders when a question asks for personal judgment.

Future enhancement:

- The assistant may later use published coach feedback as context.
- This is not part of MVP.

## Training Plan

AI generates a draft only.

Coach edits and publishes the final version.

Default structure:

```text
1. Correction drill
2. Transfer drill
3. Retest task
```

Example:

```text
Problem: hand leads before lower body

Correction: no-ball lower-body and ball-lift sync
Transfer: close-range rhythm shooting
Retest: side-view spot-up shots, 10 attempts, 60fps
```

Candidate ranking:

```text
primary problem match
> current evidence association
> graph/knowledge relationship
> coach common usage, only after enough history
> organization-level adoption, later
```

Coach preference threshold:

- Coach history should not influence ranking until at least 10 published tasks exist.
- First version can use `coach_total_published_tasks >= 10`.

Organization optimization:

- Can use data inside the same organization.
- Must not cross organization boundaries in MVP.
- Organization recommendation labels are visible only to coaches/admins, not students.

## Coach Draft Edits

Record AI draft and coach edits for backend optimization.

Record:

- Original AI draft.
- Final published version.
- Deleted drills.
- Replaced drills.
- Changed dosage.
- Changed cues.
- Final selected problem tags.

Visibility:

- Student sees only the final published version.
- Student cannot see `ai_draft_json` or `diff_json`.
- Organization can use these records internally to improve recommendations.
- No cross-organization model training in MVP.

## Homework Completion and Effectiveness

Student completion flow:

```text
student sees training plan
-> student marks complete
-> student uploads retest video
-> coach reviews effectiveness
```

Task statuses:

- Assigned.
- Started.
- Completed by self-report.
- Retest uploaded.
- Coach reviewed.
- Effective.
- Ineffective.
- Watching.

Per-drill effectiveness:

- Coach marks each drill as effective, ineffective, watching, or unrated.
- Unrated does not block review completion.
- Per-drill data is recorded for future recommendation quality.
- It should not influence recommendation ranking until enough samples exist.

If a drill was ineffective last time:

- This is a local context reminder only.
- It is not a permanent negative label.
- The same drill can be effective later in a different context.

When a plan is ineffective:

- Do not automatically regenerate a plan.
- Open the related drill database and show recommended alternatives.
- Coach makes the final choice.

## Trends

Trends are a core selling point.

Trend philosophy:

```text
The product does not prove "AI was right".
It shows whether training evidence and coach-confirmed problems changed over time.
```

Trend dimensions:

- Problem tag trend.
- Angle/timing trend.
- Training drill trend.
- Lesson vs homework transfer trend.

Trend page default:

- Latest session is primary.
- Recent 3 sessions are available for comparison.
- Layout: one main session plus two supporting previous sessions.
- Compare problem tags and angle/timing together.

Student view:

- Starts with coach final conclusion.
- Then shows next training plan.
- Then shows video with angle annotations.
- Then shows recent 3-session comparison.
- Shows only current main tag and recent change.
- Shows direction plus one core number.
- Core metric is selected based on current main problem.

Coach view:

- Full trend history.
- All confirmed tags.
- Lesson/homework split.
- Evidence and confidence detail.
- Training drill effectiveness.
- AI draft vs coach final differences.

Trend tracks:

```text
side-view trend
front-view trend
back-view trend
lesson trend
homework trend
```

Lesson and homework:

- Lesson videos form the main trend.
- Homework videos form supporting trend.
- Both can appear in the same chart with different visual encoding.

Special trend insight:

```text
lesson improved + homework improved
-> technique is transferring

lesson improved + homework not improved
-> student can perform in class, but home practice is not stable yet

lesson not improved + homework improved
-> homework shows improvement; class training target may need review

lesson not improved + homework not improved
-> current plan may need adjustment
```

Student trend explanations:

- Basic charts can show automatically.
- Interpretive trend explanation must be coach-confirmed before the student sees it.
- Student sees simplified language.
- Coach sees full evidence explanation.

Trend explanation draft:

- System can generate it.
- Coach can one-click publish or edit before publishing.
- It may include candidate training effectiveness.
- It must not state unconfirmed final judgments to the student.

## Video Review Experience

The existing square video, angle annotation, and stage switching experience is a product asset and should be carried forward.

Student and coach review pages should support:

- Square video area.
- Full shot playback by default.
- Angle overlay.
- Stage labels.
- Keyframe switching.
- Recent 3-session comparison.

Keyframes:

- System generates default keyframes.
- Coach can add, delete, or rename stages.
- Default stages:
  - Ball lift.
  - Lower-body start.
  - Release.
  - Follow-through.

First version:

- Default to full playback.
- Allow keyframe/stage cards below the video.
- Show only the lines and angles relevant to the current main problem by default.

## Coach Home

Coach home includes:

- Review queue.
- Training plan draft box.

Review queue sorting:

- Urgency-based sorting.
- Retest videos first.
- Repeated unresolved problems higher.
- Videos waiting too long higher.
- Priority students higher.

Priority students:

- Coach can manually mark a student as priority.
- The flag is visible only to that coach in MVP.

Notifications:

- In-app notifications only in MVP.
- Notification levels: normal and important.
- Important examples:
  - Retest uploaded.
  - Priority student uploaded.
  - Repeated unresolved issue.
  - Ineffective plan needs new coach action.

Review card before coach confirmation:

- Show student name.
- Upload time.
- Evidence hints.
- Status: waiting for coach confirmation.
- Do not display a confirmed main problem before coach confirms it.

Evidence hints should be objective:

```text
Ball lift timing evidence available
Release height evidence available
```

Avoid:

```text
Main problem: hand leads before lower body
```

## Student Experience

Student first screen after feedback:

```text
1. Coach final conclusion
2. Next 3-step training plan
3. Video with angle annotations
4. Recent 3-session comparison
5. Evidence detail
```

Training plan cards should show:

- Drill name.
- Dosage.
- Short reason.
- Success target.
- Retest upload request.

Student-side reasons should be short:

```text
Used to improve ball lift and lower-body sync.
```

Student should not see:

- AI raw draft.
- Full evidence trace by default.
- Rejected tags.
- Coach edit diffs.
- Organization recommendation labels.

## Pages in MVP

Coach-side:

- Phone login.
- Default organization creation.
- Add student and generate invite link.
- Coach home: review queue and draft box.
- Lesson upload.
- Session review.
- Training plan edit and publish.
- Student profile: lesson records, homework records, trends.

Student-side:

- Invite link entry.
- Phone binding.
- Homework page.
- Upload homework/retest video.
- Feedback/result page.
- Simplified progress page.
- Paid training knowledge directory.
- Knowledge assistant search and AI explanation.

Admin-side:

- Minimal organization context.
- No full admin dashboard required in MVP unless needed by implementation.

## Data Model Draft

Core tables:

- `profiles`
- `organizations`
- `organization_members`
- `coach_athlete_relations`
- `athletes`
- `athlete_invites`
- `problem_tags`
- `drill_library`
- `training_sessions`
- `video_assets`
- `evidence_packets`
- `ai_report_drafts`
- `coach_feedback`
- `training_task_drafts`
- `training_tasks`
- `training_plan_steps`
- `training_plan_step_results`
- `session_problem_tags`
- `athlete_metric_snapshots`
- `trend_explanation_drafts`
- `knowledge_articles`
- `knowledge_assistant_usage`
- `notifications`
- `coach_athlete_flags`
- `audit_events`
- `consents`

Important fields:

`training_sessions`:

- `id`
- `organization_id`
- `athlete_id`
- `coach_id`
- `source_type`: `coach_lesson` or `athlete_homework`
- `uploaded_by_role`: `coach` or `athlete`
- `initial_problem_tag_id`
- `shot_type`
- `camera_view`
- `linked_task_id`
- `visibility_to_athlete`
- `status`
- `created_at`

`video_assets`:

- `id`
- `organization_id`
- `athlete_id`
- `session_id`
- `storage_provider`
- `object_key`
- `camera_view`
- `shot_type`
- `uploaded_by`
- `retention_until`
- `deleted_at`

`session_problem_tags`:

- `session_id`
- `problem_tag_id`
- `role`: `primary` or `secondary`
- `source`: `coach_confirmed`, `evidence_suggested`, `ai_search`
- `status`: `suggested`, `confirmed`, `rejected`
- `coach_note`

`training_task_drafts`:

- `session_id`
- `coach_id`
- `athlete_id`
- `ai_draft_json`
- `final_published_json`
- `diff_json`
- `source_candidate_ids`
- `status`

`training_plan_step_results`:

- `training_task_id`
- `drill_id`
- `step_type`: `correction`, `transfer`, `retest`
- `effectiveness_status`: `effective`, `ineffective`, `watching`, `unrated`
- `coach_note`

`knowledge_articles`:

- `id`
- `slug`
- `title`
- `category`
- `student_summary`
- `student_body`
- `related_problem_tag_ids`
- `related_drill_ids`
- `source_type`
- `source_path`
- `visible_to_students`

`knowledge_assistant_usage`:

- `id`
- `organization_id`
- `athlete_id`
- `usage_date`
- `ai_answer_count`
- `created_at`
- `updated_at`

## Privacy and Boundaries

MVP boundaries:

- AI drafts are not student-facing final decisions.
- Coach final feedback is the student-facing source of truth.
- LLMs should receive structured evidence, not raw video.
- Organization-level optimization stays inside the organization.
- No cross-organization sharing in MVP.
- No public showcase of student videos by default.
- Video deletion, session deletion, and athlete data deletion must be separate audited actions.
- Student knowledge assistant questions are not saved in MVP.
- Knowledge assistant must not provide personal video diagnosis.
- Student-facing knowledge hides raw source cards and original external source details.

## MVP Acceptance Criteria

Coach:

- Can log in by phone.
- Gets a default organization.
- Can add a student and generate invite link.
- Can upload a lesson video with problem tag, view, and shot type.
- Can review evidence and AI draft.
- Can confirm one primary problem and up to two secondary problems.
- Can edit and publish a 3-step training plan.
- Can review homework and mark drill effectiveness.

Student:

- Can enter by invite link and bind phone.
- Can view lesson video after coach upload.
- Can view coach-published feedback.
- Can see the next training plan.
- Can mark homework complete.
- Can upload retest video.
- Can see simplified progress and latest coach-confirmed explanation.
- Can browse organized paid training knowledge.
- Can search the knowledge assistant for drills, concepts, and filming requirements.
- Cannot use the assistant for personal video diagnosis.

Trend:

- Separates lesson and homework trends.
- Separates side/front/back view tracks.
- Shows latest session and recent 3-session comparison.
- Shows student simplified trend and coach detailed trend.
- Does not publish interpretive trend explanation to student until coach confirms it.

Engineering:

- Existing analysis engine behavior remains available.
- Existing analysis lab can still run during migration.
- `analysis-engine` exposes stable contracts for metrics, evidence, knowledge retrieval, and report drafts.

## Remaining Open Questions

- Invite link validity duration.
- Phone binding recovery and device switching.
- Video retention policy.
- Deletion and export policy.
- Final 15-20 built-in problem tags.
- Productized drill library fields and seed script.
- AI draft fallback behavior.
- Homework overdue reminders.
- First web/PWA visual layout.
- Supabase RLS policy details.
- Whether to write a separate implementation plan before coding.
- Exact knowledge assistant daily AI answer limit.
- Final student-facing knowledge article taxonomy.
