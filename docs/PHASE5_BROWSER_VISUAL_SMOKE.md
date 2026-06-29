# Phase 5 Browser Visual Smoke

Updated: 2026-06-26

## Scope

This smoke test verifies that the coach-line overlay and release-motion overlay draw visible pixels in the same browser canvas when deterministic synthetic RTMPose keypoints are injected. It also verifies local current-frame PNG export of the video frame plus overlay canvas, plus a browser-memory-only annotated-frame review thumbnail.

It also verifies the browser-visible Overlay Diagnostics panel. That panel reports `coach_overlay_diagnostics.v1`, the pose source, release-motion/no-airborne-ball boundary, evidence-keyframe phase source, low-confidence guard policy, and local PNG export boundary.

It does not certify real-player readability, a validated action-phase classifier, or exported annotated video.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-browser-visual-smoke.mjs
```

## Checked Contract

- Starts a temporary local server with DeepSeek, YOLO, and RTMPose disabled.
- Opens headless Chrome at a 390x844 viewport.
- Loads the local authorized `synthetic_ball` sample.
- Injects deterministic synthetic precision-pose keypoints, metric series, and release-motion evidence through localhost-only test hooks.
- Verifies `#poseCanvas` is nonblank and contains coach-line color pixels.
- Verifies release-motion pixels are visible in the same canvas and pose status reports the overlaid release slice points.
- Verifies local current-frame PNG export returns `annotated_frame_export.v1` with `local_browser_png_current_frame_no_video_export`.
- Verifies the annotated-frame review strip renders a decoded PNG thumbnail and keeps the boundary as browser memory only.
- Verifies seek changes the phase label.
- Verifies low-score keypoints reduce coach-line pixels and show the no-coach-line guard copy.
- Verifies `#overlayDiagnostics` displays `coach_overlay_diagnostics.v1`, `source_check_only_not_real_sample_readability`, `phase_source=evidence_keyframes_not_classifier`, `human_pose_motion_slice_only_no_airborne_ball_tracking`, and `local_browser_png_current_frame_no_video_export`.

## Latest Result

```json
{
  "ok": true,
  "schema_version": "phase5_browser_visual_smoke.v1",
  "source_contract": "browser_canvas_visual_check_synthetic_keypoints_and_release_motion",
  "canvas": {
    "width": 364,
    "height": 205
  },
  "good_frame": {
    "non_transparent_pixels": 25434,
    "coach_color_pixels": 2393,
    "release_motion_color_pixels": 675,
    "pose_status": "已显示 RTMPose 骨架和 9 条教练线；全部来自后端关键点，阶段：投篮窗口开始；叠加 2 个出手切片点。",
    "overlay_diagnostics_status": "rtmpose_precision_pose",
    "overlay_diagnostics_contract": "coach_overlay_diagnostics.v1"
  },
  "frame_export": {
    "schema_version": "annotated_frame_export.v1",
    "source_contract": "local_browser_png_current_frame_no_video_export",
    "width": 364,
    "height": 205,
    "data_url_length": 78994,
    "includes_video_frame": true,
    "includes_overlay_canvas": true
  },
  "annotated_frame_review": {
    "thumb_count": 1,
    "has_png_thumb": true,
    "image_width": 364,
    "image_height": 205,
    "storage_boundary": "browser_memory_only"
  },
  "seek_frame": {
    "coach_color_pixels": 2497,
    "release_motion_color_pixels": 629,
    "pose_status": "已显示 RTMPose 骨架和 9 条教练线；全部来自后端关键点，阶段：出手点；叠加 2 个出手切片点。"
  },
  "low_score_frame": {
    "non_transparent_pixels": 6830,
    "coach_color_pixels": 349,
    "pose_status": "已显示 RTMPose 骨架；关键点不足时不绘制教练线。",
    "overlay_diagnostics_status": "rtmpose_precision_pose"
  }
}
```

## Remaining Gap

This is a browser visual contract smoke with synthetic keypoints and release-motion evidence only. Overlay Diagnostics explains the current source and boundaries; it is not proof of readability on authorized real shooting footage. The PNG export and review preview are local current-frame/browser-memory features only; they still do not prove independent action-phase classification, stable ball tracking, or export of annotated video.
