# Arc Lab Contract Smoke

Updated: 2026-06-26

## Scope

`scripts/arc-lab-contract-smoke.mjs` verifies the first Arc Lab MVP domain contract slice. It is a static contract smoke, not a claim that login, Supabase, cloud storage, or a production Coach OS UI already exists.

The smoke checks:

- AI remains draft/evidence support, not final diagnosis.
- Student-facing final source remains `coach_feedback`.
- MVP video sources include `coach_lesson` and `athlete_homework`.
- Camera tracks include `side`, `front`, and `back`.
- Shot types include Spot-up, Catch-and-shoot, Pull-up after dribble, Stop-jump, and Free throw.
- Built-in problem tags stay within the PRD range of 15-20 tags.
- The 9 confirmed Obsidian training nodes are present as drill seeds.
- Training plan default steps are `correction`, `transfer`, and `retest`.
- Trend keys separate source type, camera view, shot type, and problem tag.
- Homework wrong-view policy saves supplemental records without counting the requested homework as complete.
- Student knowledge assistant cannot diagnose personal videos.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-contract-smoke.mjs
```

`server/index.mjs --check` also includes the Arc Lab contract validation summary.

## Boundaries

- No poster, poster-to-lab transition, or lab masthead transition files are touched by this slice.
- This does not implement phone login, invite links, Supabase RLS, cloud deletion, or production PWA screens.
- This does not expose AI drafts to students.
- This does not merge lesson/homework, camera view, shot type, or problem tag trend tracks.
