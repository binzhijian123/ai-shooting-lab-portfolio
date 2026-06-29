# Phase 5 Dynamic Lines Smoke

Updated: 2026-06-27

## Scope

This smoke test verifies the first frontend slice for coach-style dynamic lines:

- Browser MediaPipe import and initialization.
- Existing pose canvas remains available.
- Dynamic line renderer is wired to real current-frame keypoints.
- Minimal angle arcs are wired to real current-frame keypoints.
- Minimal phase labels are derived from evidence keyframes when an evidence packet is loaded.
- Missing or low-confidence keypoints skip line drawing.
- Local current-frame PNG export combines the current video frame and current overlay canvas.
- Local annotated-frame review preview shows recent exported PNG frames in browser memory only.
- Overlay Diagnostics shows the active overlay contract, pose source, line count, phase-label source, candidate ball overlay count, guard policy, structured readability status, and export boundary.

This does not verify a real action-phase classifier, exported annotated video, or high-confidence behavior on real shooting footage.

## Implementation Checked

`app/main.js` now includes:

- MediaPipe landmark mapping.
- COCO/RTMPose keypoint mapping.
- `drawBrowserCoachLines()` for browser MediaPipe frames.
- `drawPrecisionCoachLines()` for RTMPose frames.
- `drawPhaseLabel()` for evidence-keyframe labels such as prepare, dip, lift, release, and landing.
- `exportAnnotatedFrame()` for local current-frame PNG export. It is not annotated video export.
- `addAnnotatedFrameReview()` and `renderAnnotatedFrameReview()` for the local browser-memory review strip.
- `renderOverlayDiagnostics()` for `coach_overlay_diagnostics.v1`; it explains the current overlay source, structured readability gate, and boundaries without claiming real-sample readability.
- `overlayReadabilityStatus()` for a conservative manual-review gate: no pose evidence, partial overlay, synthetic overlay visible but not real readability, or authorized manual readability review candidate.
- Shared `drawCoachLines()` helper for:
  - foot-knee-hip force line;
  - shoulder-elbow-wrist shooting arm line;
  - off-hand support line;
  - trunk line;
  - lower-to-upper kinetic-chain line;
  - knee, hip, elbow, and trunk angle arcs.

All lines are derived from the current frame. If a required point is missing, below visibility threshold, or below score threshold, that line is not drawn.

Phase labels are derived only from `evidence.metric_series` keyframes and nearest-frame matching. They are visual context labels, not independently detected action phases.

Overlay Diagnostics uses `source_check_only_not_real_sample_readability`, `phase_source=evidence_keyframes_not_classifier`, `human_pose_motion_slice_only_no_airborne_ball_tracking`, `manual_review_gate_not_quality_claim`, and `local_browser_png_current_frame_no_video_export` to keep the UI aligned with current verified capability.

## Command Context

Repeatable source-contract smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-dynamic-lines-smoke.mjs
```

Latest script result:

```json
{
  "ok": true,
  "schema_version": "phase5_dynamic_lines_smoke.v1",
  "source_contract": "source_check_only_not_visual_browser_verification",
  "bindings": {
    "browser_pose": true,
    "precision_pose": true,
    "phase_labels": true,
    "evidence_keyframes": true
  },
  "local_export": {
    "schema_version": "annotated_frame_export.v1",
    "source_contract": "local_browser_png_current_frame_no_video_export",
    "not_exported_annotated_video": true,
    "local_review_preview": "browser_memory_recent_3_png_data_urls"
  },
  "guards": {
    "mediapipe_visibility": "visibility < 0.5",
    "precision_pose_score": "score < 0.2",
    "finite_coordinates": true
  },
  "overlay_diagnostics": {
    "schema_version": "coach_overlay_diagnostics.v1",
    "source_contract": "source_check_only_not_real_sample_readability",
    "phase_source": "evidence_keyframes_not_classifier",
    "release_motion_overlay": "human_pose_motion_slice_only_no_airborne_ball_tracking",
    "export_boundary": "local_browser_png_current_frame_no_video_export",
    "readability_status": "manual_review_gate_not_quality_claim",
    "readability_statuses": [
      "synthetic_overlay_visible_not_real_readability",
      "partial_overlay_seek_another_frame",
      "no_pose_evidence_for_readability"
    ]
  }
}
```

Historical browser load smoke commands and observations:

```bash
PORT=4183 DEEPSEEK_API_KEY= YOLO_COMMAND= RTMPOSE_COMMAND= node server/index.mjs
```

Browser smoke at `http://localhost:4183`:

```json
{
  "title": "AI 投篮实验室",
  "poseCanvas": true,
  "poseStatus": "MediaPipe 快速层已就绪；上传视频播放时会尝试绘制真实人体关键点。",
  "pairedVideoInput": true,
  "multiAngleCard": true,
  "favicon": true,
  "mainScript": [
    "http://localhost:4183/main.js",
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.js"
  ],
  "blocking_events": []
}
```

Follow-up browser smoke after adding angle arcs, at `http://localhost:4186`:

```json
{
  "poseCanvas": true,
  "poseStatus": "MediaPipe 快速层已就绪；上传视频播放时会尝试绘制真实人体关键点。",
  "privacyStatus": "local only",
  "memoryDetails": true,
  "blocking_events": []
}
```

Follow-up browser smoke after adding evidence-keyframe phase labels, at `http://localhost:4192`:

```json
{
  "poseCanvas": true,
  "keyframes": ["准备", "下蹲最低点", "举球到位", "出手点", "落地"],
  "cleanupControls": true,
  "privacyStatus": "local only",
  "mainScriptLoaded": true,
  "blocking_events": []
}
```

Browser check after adding the authorized sample loader, at `http://localhost:4197`:

```json
{
  "poseStatus": "未采集到人体关键点；本次不会把骨架当作证据。",
  "sampleStatus": "synthetic_ball 已加载；not_for_player_diagnosis",
  "videoWidth": 640,
  "videoHeight": 360,
  "duration": 2.4,
  "memoryStatus": "short_term_review",
  "reportMode": "evidence_insufficient_fallback · 本地降级",
  "blocking_errors": []
}
```

## Interpretation

- The repeatable script confirms the dynamic-line source contract is present.
- The historical browser load smoke showed the page could load the dynamic-line code path without blocking errors in that run.
- MediaPipe `@mediapipe/tasks-vision@0.10.35` initializes in the browser.
- The dynamic lines and angle arcs are connected to real pose frames, not static overlay artwork.
- Phase labels are available when an evidence packet has metric-series keyframes.
- Local PNG export is available for the current annotated frame only.
- The page shows up to 3 recent annotated-frame thumbnails in browser memory only; they disappear on refresh and are not written to SQLite, `data/uploads`, cloud storage, or video files.
- Overlay Diagnostics is visible as an explanatory contract panel for pose source, line count, candidate ball overlay, guard policy, and local PNG/export boundary.
- Overlay Diagnostics now exposes a stable `data-readability-status` gate. Synthetic smoke frames with visible full overlay report `synthetic_overlay_visible_not_real_readability`; partial overlay frames report `partial_overlay_seek_another_frame`; low-score frames report `no_pose_evidence_for_readability`.
- The current browser sample confirms the page does not draw static fake skeletons when the synthetic sample has no detectable human pose.

## Remaining Phase 5 Gap

- The repeatable smoke is a source-contract check, not browser visual verification.
- Browser validation still does not prove real-human dynamic coach-line readability.
- Phase labels do not yet come from a validated action-phase classifier.
- The kinetic-chain line does not yet use phase-specific diagnosis or timing colors.
- Real or representative authorized shooting samples are still needed to validate visual readability.
- The app cannot export an annotated video.
