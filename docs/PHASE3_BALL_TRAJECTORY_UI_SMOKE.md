# Phase 3 Ball Trajectory UI Smoke

Updated: 2026-06-26

## Scope

This smoke test verifies the current browser-visible Phase 3 boundary: the backend `ball_trajectory.v1` module is retained for evidence contracts, but the frontend no longer renders an airborne ball-trajectory card or candidate ball-path overlay. The browser UI instead verifies the `release_motion.v1` card and canvas overlay.

It does not validate stable 2D ball tracking, real-sample trajectory quality, confirmed make/miss judgement, or YOLO model accuracy.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-ui-smoke.mjs
```

## Latest Result

```json
{
  "ok": true,
  "schema_version": "phase3_ball_trajectory_ui_smoke.v1",
  "source_contract": "browser_dom_release_motion_card_and_canvas_no_airborne_ball_overlay",
  "viewport": { "width": 390, "height": 844 },
  "boundaries": [
    "frontend_airborne_ball_path_removed",
    "release_motion_overlay_active",
    "human_pose_motion_slice_only_no_airborne_ball_tracking",
    "diagnosis_allowed_false",
    "synthetic_evidence_only_no_real_video_readability"
  ]
}
```

## Verified UI Contract

- The local authorized synthetic sample loads before evidence injection so the video canvas has real dimensions.
- `#releaseMotionStatus` and `#releaseMotionCard` render in a mobile browser viewport.
- The card shows release-motion timing, wrist-path count, and the no-airborne-ball boundary.
- The card includes `human_pose_motion_slice_only_no_airborne_ball_tracking` and “不直接支撑动作诊断”.
- The canvas renders release-motion overlay pixels from synthetic evidence.
- The UI does not render `.trajectory-preview` or “候选球路点”.
- Browser errors are absent.
