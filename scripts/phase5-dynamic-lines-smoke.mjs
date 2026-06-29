import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const [html, main] = await Promise.all([
  readFile(path.join(root, "app", "index.html"), "utf8"),
  readFile(path.join(root, "app", "main.js"), "utf8")
]);

const labels = ["脚膝髋力线", "肩肘腕线", "辅助手线", "发力链线", "躯干线"];
const angleLabels = ["膝角", "髋角", "肘角", "躯干角"];

assertIncludes(html, 'id="shotVideo"', "shot video element missing");
assertIncludes(html, 'id="poseCanvas"', "pose canvas element missing");
assertIncludes(html, 'id="keyframes"', "keyframes element missing");
assertIncludes(html, 'id="dominantHand"', "dominant hand selector missing");
assertIncludes(html, 'id="exportFrameButton"', "annotated frame export button missing");
assertIncludes(html, 'id="frameExportStatus"', "annotated frame export status missing");
assertIncludes(html, 'id="annotatedFrameReview"', "annotated frame review panel missing");
assertIncludes(html, "Overlay Diagnostics", "overlay diagnostics card missing");
assertIncludes(html, 'id="overlayDiagnosticsStatus"', "overlay diagnostics status missing");
assertIncludes(html, 'id="overlayDiagnostics"', "overlay diagnostics body missing");
assertIncludes(html, "最近 3 张标注帧预览", "annotated frame review local preview copy missing");
assertIncludes(html, 'src="/main.js"', "frontend script binding missing");

assertIncludes(main, "phaseKeyframes: []", "phase keyframe state missing");
assertIncludes(main, "renderDefaultKeyframes();", "default keyframe render call missing");
assertIncludes(main, "renderKeyframes([", "default keyframe data missing");
assertIncludes(main, "{ phaseOverlay: false }", "default keyframes must not seed phase overlay");
assertIncludes(main, "renderKeyframes(seriesToKeyframes(evidence.metric_series, evidence.release_motion), evidence.session.fps, { phaseOverlay: true })", "evidence keyframes must seed phase overlay");
assertIncludes(main, "state.phaseKeyframes = options.phaseOverlay", "phase overlay gate missing");
assertIncludes(main, "time_ms: Math.round((Number(item.frame || 0) / Math.max(1, Number(fps || 60))) * 1000)", "frame-to-time phase mapping missing");

assertIncludes(main, "drawBrowserCoachLines(ctx, result.landmarks[0], canvas)", "MediaPipe coach-line path missing");
assertIncludes(main, "drawPhaseLabel(ctx, canvas, video.currentTime * 1000)", "browser phase-label path missing");
assertIncludes(main, "drawPrecisionCoachLines(ctx, frame.keypoints, scaleX, scaleY)", "precision pose coach-line path missing");
assertIncludes(main, "drawPhaseLabel(ctx, canvas, timeMs)", "precision phase-label path missing");

for (const name of [
  "function drawBrowserCoachLines",
  "function drawPrecisionCoachLines",
  "function exportAnnotatedFrame",
  "function drawCoachLines",
  "function normalizedPoint",
  "function pixelPoint",
  "function drawAngleArc",
  "function drawPhaseLabel",
  "function nearestPhaseKeyframe",
  "function addAnnotatedFrameReview",
  "function renderAnnotatedFrameReview",
  "function clearAnnotatedFrameReview",
  "function overlayReadabilityStatus",
  "function renderOverlayDiagnostics"
]) {
  assertIncludes(main, name, `${name} missing`);
}
assertIncludes(main, "function renderReadabilityChecklist", "readability checklist renderer missing");

for (const label of labels) {
  assertIncludes(main, `label: "${label}"`, `coach line label missing: ${label}`);
}
for (const label of angleLabels) {
  assertIncludes(main, `label: "${label}"`, `angle label missing: ${label}`);
}

assertIncludes(main, "drawPolyline(ctx, valid, line.color)", "coach lines must draw from assembled keypoints");
assertIncludes(main, "drawLineLabel(ctx, line.label, valid.at(-1), line.color)", "coach line labels missing");
assertIncludes(main, "drawAngleArc(ctx, angle.points[0], angle.points[1], angle.points[2], angle.label, angle.color)", "angle arcs must use current-frame points");
assertIncludes(main, "schema_version: \"annotated_frame_export.v1\"", "annotated frame export schema missing");
assertIncludes(main, "source_contract: \"local_browser_png_current_frame_no_video_export\"", "annotated frame export boundary missing");
assertIncludes(main, "includes_overlay_canvas: true", "annotated frame export must include overlay canvas");
assertIncludes(main, "state.annotatedFrameReviews", "annotated frame review state missing");
assertIncludes(main, "].slice(0, 3)", "annotated frame review must keep a bounded local list");
assertIncludes(main, "仅保存在当前浏览器内存", "annotated frame review local-memory boundary copy missing");
assertIncludes(main, "addAnnotatedFrameReview", "annotated frame review test hook/binding missing");
assertIncludes(main, "const visibility = point.visibility ?? point.presence ?? 1", "MediaPipe visibility guard missing");
assertIncludes(main, "visibility < 0.5", "MediaPipe low-visibility skip missing");
assertIncludes(main, "const score = point[2] ?? 1", "precision pose score guard missing");
assertMatches(main, /score\s*<\s*0\.2/, "precision pose low-score skip missing");
assertIncludes(main, "Number.isFinite(point.x)", "normalized point finite-coordinate guard missing");
assertIncludes(main, "Number.isFinite(point[0])", "precision point finite-coordinate guard missing");
assertIncludes(main, "coach_overlay_diagnostics.v1", "overlay diagnostics schema missing");
assertIncludes(main, "source_check_only_not_real_sample_readability", "overlay diagnostics source boundary missing");
assertIncludes(main, "not_real_sample_readability", "overlay diagnostics real-sample boundary missing");
assertIncludes(main, "real_authorized_sample_readability_checklist.v1", "real-authorized readability checklist schema missing");
assertIncludes(main, "真实/授权样例可读性 checklist", "readability checklist UI title missing");
assertIncludes(main, "不证明真实样例诊断质量", "readability checklist diagnosis boundary missing");
assertIncludes(main, "data-readability-status", "structured readability status missing");
assertIncludes(main, "synthetic_overlay_visible_not_real_readability", "synthetic readability boundary status missing");
assertIncludes(main, "partial_overlay_seek_another_frame", "partial-overlay readability guard status missing");
assertIncludes(main, "authorized_manual_readability_review_candidate", "authorized manual-review readability status missing");
assertIncludes(main, "no_pose_evidence_for_readability", "no-pose readability guard status missing");
assertIncludes(main, "manual_review_gate_not_quality_claim", "readability quality-claim guard missing");
assertIncludes(main, "phase_source=evidence_keyframes_not_classifier", "overlay phase classifier boundary missing");
assertIncludes(main, "human_pose_motion_slice_only_no_airborne_ball_tracking", "overlay release-motion boundary missing");
assertIncludes(main, "local_browser_png_current_frame_no_video_export", "overlay export boundary missing");
assertIncludes(main, "renderOverlayDiagnostics({", "overlay diagnostics update calls missing");

for (const forbidden of ["staticCoachLine", "fakeCoachLine", "mockCoachLine"]) {
  assert(!main.includes(forbidden), `forbidden static/fake overlay hook found: ${forbidden}`);
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "phase5_dynamic_lines_smoke.v1",
  source_contract: "source_check_only_not_visual_browser_verification",
  frontend_surface: {
    shot_video: true,
    pose_canvas: true,
    keyframes: true,
    dominant_hand_selector: true,
    annotated_frame_export: true,
    annotated_frame_review: true
  },
  bindings: {
    browser_pose: true,
    precision_pose: true,
    phase_labels: true,
    evidence_keyframes: true
  },
  coach_lines: labels,
  angle_arcs: angleLabels,
  guards: {
    mediapipe_visibility: "visibility < 0.5",
    precision_pose_score: "score < 0.2",
    finite_coordinates: true
  },
  overlay_diagnostics: {
    schema_version: "coach_overlay_diagnostics.v1",
    source_contract: "source_check_only_not_real_sample_readability",
    phase_source: "evidence_keyframes_not_classifier",
    release_motion_overlay: "human_pose_motion_slice_only_no_airborne_ball_tracking",
    export_boundary: "local_browser_png_current_frame_no_video_export",
    readability_checklist: "real_authorized_sample_readability_checklist.v1",
    readability_status: "manual_review_gate_not_quality_claim",
    readability_statuses: [
      "synthetic_overlay_visible_not_real_readability",
      "partial_overlay_seek_another_frame",
      "no_pose_evidence_for_readability"
    ]
  },
  remaining_gap: [
    "not_a_browser_visual_verification",
    "not_a_real_sample_readability_verification",
    "not_a_validated_action_phase_classifier"
  ],
  local_export: {
    schema_version: "annotated_frame_export.v1",
    source_contract: "local_browser_png_current_frame_no_video_export",
    not_exported_annotated_video: true,
    local_review_preview: "browser_memory_recent_3_png_data_urls"
  }
}, null, 2));

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertMatches(source, pattern, message) {
  assert(pattern.test(source), message);
}

function assert(condition, message) {
  if (!condition) throw new Error(`phase5 dynamic lines smoke failed: ${message}`);
}
