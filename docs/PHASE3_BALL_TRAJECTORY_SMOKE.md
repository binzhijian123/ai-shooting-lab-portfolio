# Phase 3 Ball Trajectory Smoke

Updated: 2026-06-27

## Scope

This smoke test verifies the independent `server/ballTrajectory.mjs` module and the `ball_trajectory.v1` contract. The frontend no longer renders an airborne ball-trajectory card or candidate ball-path overlay; browser checks now verify the `release_motion.v1` card and no-airborne-ball boundary.

It does not validate stable 2D tracking, make/miss judgment, or real shooting diagnosis.

## API Result

The first smoke test used `data/synthetic_ball.mp4` with YOLO and RTMPose disabled.

```json
{
  "evidence_schema": "evidence_packet.v1",
  "ball_schema": "ball_trajectory.v1",
  "ball_status": "not_available",
  "ball_confidence": 0,
  "missing_reasons": [
    "adapter_not_configured",
    "ball_not_detected",
    "rim_not_detected"
  ],
  "object_detection_layer": "adapter_not_configured"
}
```

The repeatable contract smoke is:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-smoke.mjs
```

The contract smoke replays adapter output from `data/fixtures/phase3-ball-trajectory-adapter-fixtures.json`. The fixture contract is `phase3_ball_trajectory_adapter_fixtures.v1` and `synthetic_adapter_output_replay_no_real_video`; it does not contain or require real school-team video.

Latest contract result:

```json
{
  "schema_version": "phase3_ball_trajectory_smoke.v1",
  "fixture_schema_version": "phase3_ball_trajectory_adapter_fixtures.v1",
  "source_contract": "synthetic_adapter_output_replay_no_real_video",
  "scenario_count": 14,
  "frontend_overlay": {
    "source_contract": "frontend_airborne_ball_path_removed_release_motion_active",
    "backend_module": "server/ballTrajectory.mjs",
    "backend_candidate_module_retained": true,
    "frontend_ball_card_removed": true,
    "frontend_ball_overlay_removed": true,
    "release_motion_card_active": true,
    "release_motion_overlay_active": true
  },
  "statuses": {
    "adapter_not_configured": "not_available",
    "adapter_error": "not_available",
    "ball_missing": "insufficient_evidence",
    "rim_missing": "insufficient_evidence",
    "sparse_candidate": "candidate",
    "camera_view_not_suitable": "candidate",
    "low_resolution_or_motion_blur": "candidate",
    "ball_occluded_by_body": "candidate",
    "rim_out_of_frame": "insufficient_evidence",
    "multiple_ball_candidates": "candidate",
    "invalid_ball_points_filtered": "candidate",
    "invalid_rim_reference_filtered": "insufficient_evidence",
    "tracked_candidate_make": "tracked",
    "low_confidence_event_candidate": "candidate"
  }
}
```

## Browser Result

The local page renders:

- `#releaseMotionCard`
- Default no-airborne-ball boundary copy.
- Canvas source binding for the wrist path from gather to release, not ball flight.

No browser console errors were observed during the page-load check.

The repeatable browser UI smoke is:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-ui-smoke.mjs
```

Latest browser UI result:

```json
{
  "schema_version": "phase3_ball_trajectory_ui_smoke.v1",
  "source_contract": "browser_dom_release_motion_card_and_canvas_no_airborne_ball_overlay",
  "boundaries": [
    "frontend_airborne_ball_path_removed",
    "release_motion_card_active",
    "human_pose_motion_slice_only_no_airborne_ball_tracking"
  ]
}
```

The browser UI smoke verifies the release-motion card, canvas wrist-path overlay pixels, and absence of candidate airborne ball-path copy. It uses synthetic evidence only.

## Interpretation

- `evidence_packet.v1` now includes an independent `ball_trajectory.v1` field.
- `ball_trajectory.v1` is built by `server/ballTrajectory.mjs`, not inline inside the general evidence pipeline.
- The module emits `source_contract=candidate_only_yolo_adapter_output_not_stable_tracking`, `interpretation_policy=candidate_visualization_only_not_diagnosis`, and `diagnosis_allowed=false`.
- Adapter absence is shown as `not_available`, not as a stable trajectory.
- Missing ball and rim evidence are explicit.
- Synthetic adapter fixture replay now exercises `candidate`, `tracked`, and low-confidence event contracts, including occlusion, rim-out-of-frame, multiple-ball-candidate, invalid-ball-point filtering, and invalid-rim-reference filtering failure modes, without claiming real tracking quality.
- Invalid adapter ball points with non-finite `frame`, `x`, `y`, or `confidence` are filtered out before returning `trajectory_points`; the smoke verifies `invalid_ball_points_filtered` with `valid_ball_points=2`, `invalid_ball_points=2`, and `missing_evidence.reason=invalid_ball_points`.
- Invalid adapter rim references with non-finite `frame`, box values, or `confidence` are ignored before setting `rim_reference`; the smoke verifies `invalid_rim_reference_filtered` with `status=insufficient_evidence`, `rim_detected=false`, and `missing_evidence.reason=invalid_rim_reference`.
- The frontend no longer renders a dedicated airborne Ball Trajectory Card or candidate ball-path overlay.
- Browser UI smoke verifies `release_motion.v1`, `human_pose_motion_slice_only_no_airborne_ball_tracking`, and that candidate airborne ball-path copy is absent.
- The visible overlay draws human wrist-path release motion only; it does not invent ball-flight points when adapter evidence is missing or insufficient.

## Remaining Phase 3 Gap

Phase 3 is not complete until an authorized real or representative shooting sample exercises these states through real adapter output. The current smoke validates the data contract, backend safe failure paths, and frontend no-airborne-ball boundary, not real 2D tracking quality.
