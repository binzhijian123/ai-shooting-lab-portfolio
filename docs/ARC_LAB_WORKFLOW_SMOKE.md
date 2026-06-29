# Arc Lab Workflow Smoke

Updated: 2026-06-26

## Scope

`scripts/arc-lab-workflow-smoke.mjs` verifies the first local Coach OS workflow contract. It is not a login, Supabase, cloud storage, or production UI implementation.

The smoke checks:

- `coach_lesson` upload metadata requires an initial standard problem tag, camera view, and shot type.
- `athlete_homework` upload metadata keeps linked task, requested view, actual view, and shot type separate.
- Coach confirmation requires exactly one standard primary problem tag and allows at most two secondary tags.
- AI can generate a three-step training plan draft only.
- The AI draft is not student-visible.
- Publishing requires coach-confirmed tags and produces a student-visible final plan with `coach_feedback` as source of truth.
- Student output hides AI draft JSON, coach edit diff JSON, and rejected problem tags.
- Wrong-view homework is saved as a supplemental record, does not count as completing the requested homework view, and can still enter its actual camera-view trend track.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-workflow-smoke.mjs
```

`server/index.mjs --check` also includes `arc_lab_workflow_contract`.

## Boundaries

- No poster, poster-to-lab transition, or lab masthead transition files are touched by this slice.
- This does not implement phone login, invite links, Supabase RLS, cloud deletion, or production PWA screens.
- This does not expose AI drafts to students.
- This does not claim automatic AI final diagnosis.
- This does not merge lesson/homework, camera view, shot type, or problem tag trend tracks.
