# Arc Lab Trend Smoke

Updated: 2026-06-26

## Scope

`scripts/arc-lab-trend-smoke.mjs` verifies the first local Arc Lab trend contract. It is not a database migration, production trend UI, Supabase RLS implementation, or proof of real-athlete longitudinal analysis quality.

The smoke checks:

- Trend keys keep `source_type`, `camera_view`, `shot_type`, and `problem_tag_id` separate.
- `coach_lesson` and `athlete_homework` tracks do not mix.
- `side`, `front`, and other camera-view tracks do not mix.
- Different shot types do not mix.
- Each track exposes the latest 3 sessions for comparison.
- Trend sessions require coach-confirmed standard problem tags.
- The coach view keeps full tracks, evidence confidence detail, and lesson/homework transfer context.
- The student view is simplified to the current main problem tag, one current track, one core metric, and recent 3-session comparison.
- Interpretive student trend explanations are hidden until coach confirmation.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-trend-smoke.mjs
```

`server/index.mjs --check` also includes `arc_lab_trend_contract`.

## Boundaries

- No poster, poster-to-lab transition, or lab masthead transition files are touched by this slice.
- This does not implement phone login, invite links, Supabase tables, RLS, cloud storage, or production PWA trend screens.
- This does not claim AI final diagnosis.
- This does not expose AI trend explanation drafts to students.
- This does not merge lesson/homework, camera view, shot type, or problem tag trend tracks.
