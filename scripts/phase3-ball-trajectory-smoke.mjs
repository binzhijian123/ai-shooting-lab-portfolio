import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBallTrajectoryModule } from "../server/ballTrajectory.mjs";
import { buildEvidencePacket } from "../server/visionPipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const knowledgeBase = JSON.parse(await readFile(
  path.join(root, "distillation", "douyin-shooting-coach", "outputs", "knowledge_base.json"),
  "utf8"
));
const fixture = JSON.parse(await readFile(
  path.join(root, "data", "fixtures", "phase3-ball-trajectory-adapter-fixtures.json"),
  "utf8"
));
const mainJs = await readFile(path.join(root, "app", "main.js"), "utf8");
const readme = await readFile(path.join(root, "README.md"), "utf8");
const phase3Doc = await readFile(path.join(root, "docs", "PHASE3_BALL_TRAJECTORY_SMOKE.md"), "utf8");

assert(fixture.schema_version === "phase3_ball_trajectory_adapter_fixtures.v1", "fixture schema mismatch");
assert(fixture.source_contract === "synthetic_adapter_output_replay_no_real_video", "fixture source contract mismatch");
assert(Array.isArray(fixture.scenarios) && fixture.scenarios.length >= 12, "fixture scenarios missing");
assertUniqueScenarioNames(fixture.scenarios);

const results = fixture.scenarios.map((scenario) => {
  const evidence = buildEvidencePacket({
    shot_type: fixture.default_video.shot_type,
    camera_view: fixture.default_video.camera_view,
    fps: fixture.default_video.fps,
    video_duration_ms: fixture.default_video.video_duration_ms,
    file_name: `${scenario.name}.mp4`,
    model_adapter_outputs: {
      object_detection: scenario.object_detection,
      precision_pose: { status: "adapter_not_configured" }
    },
    model_health: {
      yolo: { configured: false, status: "adapter_not_configured" },
      rtmpose: { configured: false, status: "adapter_not_configured" }
    }
  }, knowledgeBase);
  const ball = evidence.ball_trajectory;
  const directBall = buildBallTrajectoryModule(scenario.object_detection);
  const reasons = (ball.missing_evidence || []).map((item) => item.reason);
  assert(scenario.name, "fixture scenario missing name");
  assert(scenario.object_detection?.status, `${scenario.name}: object_detection.status missing`);
  assert(ball.schema_version === "ball_trajectory.v1", `${scenario.name}: schema mismatch`);
  assert(directBall.schema_version === "ball_trajectory.v1", `${scenario.name}: direct module schema mismatch`);
  assert(directBall.status === ball.status, `${scenario.name}: direct module status mismatch`);
  assert(ball.source_contract === "candidate_only_yolo_adapter_output_not_stable_tracking", `${scenario.name}: source contract mismatch`);
  assert(ball.interpretation_policy === "candidate_visualization_only_not_diagnosis", `${scenario.name}: interpretation policy mismatch`);
  assert(ball.diagnosis_allowed === false, `${scenario.name}: ball trajectory must not directly allow diagnosis`);
  assert(ball.valid_ball_points === (ball.trajectory_points || []).length, `${scenario.name}: valid_ball_points mismatch`);
  assert(Number(ball.invalid_ball_points || 0) >= 0, `${scenario.name}: invalid_ball_points missing`);
  assert(ball.rim_detected === Boolean(ball.rim_reference), `${scenario.name}: rim_detected mismatch`);
  assert(ball.status === scenario.expect.status, `${scenario.name}: expected status ${scenario.expect.status}, got ${ball.status}`);
  if (Number.isInteger(scenario.expect.valid_ball_points)) {
    assert(ball.valid_ball_points === scenario.expect.valid_ball_points, `${scenario.name}: expected valid_ball_points ${scenario.expect.valid_ball_points}, got ${ball.valid_ball_points}`);
  }
  if (Number.isInteger(scenario.expect.invalid_ball_points)) {
    assert(ball.invalid_ball_points === scenario.expect.invalid_ball_points, `${scenario.name}: expected invalid_ball_points ${scenario.expect.invalid_ball_points}, got ${ball.invalid_ball_points}`);
  }
  if (typeof scenario.expect.rim_detected === "boolean") {
    assert(ball.rim_detected === scenario.expect.rim_detected, `${scenario.name}: expected rim_detected ${scenario.expect.rim_detected}, got ${ball.rim_detected}`);
  }
  for (const reason of scenario.expect.reasons) {
    assert(reasons.includes(reason), `${scenario.name}: missing reason ${reason}`);
  }
  if (scenario.expect.event_status) {
    assert(ball.events?.[0]?.status === scenario.expect.event_status, `${scenario.name}: event status mismatch`);
  }
  if (scenario.expect.judgement) {
    assert(ball.events?.[0]?.judgement === scenario.expect.judgement, `${scenario.name}: judgement mismatch`);
  }
  assert(["tracked", "candidate", "insufficient_evidence", "not_available"].includes(ball.status), `${scenario.name}: unsupported status ${ball.status}`);
  for (const event of ball.events || []) {
    assert(!["made", "missed"].includes(event.judgement), `${scenario.name}: judgement must remain candidate-prefixed or unknown`);
  }
  for (const point of ball.trajectory_points || []) {
    for (const field of ["frame", "x", "y", "confidence"]) {
      assert(Number.isFinite(Number(point[field])), `${scenario.name}: invalid trajectory point ${field}`);
    }
  }
  return {
    name: scenario.name,
    status: ball.status,
    confidence: ball.confidence,
    valid_ball_points: ball.valid_ball_points,
    invalid_ball_points: ball.invalid_ball_points,
    rim_detected: ball.rim_detected,
    missing_reasons: reasons,
    event_status: ball.events?.[0]?.status || null,
    judgement: ball.events?.[0]?.judgement || null
  };
});

const frontendContract = assertFrontendOverlayContract(mainJs);
const documentationContract = assertDocumentationContract({ readme, phase3Doc });

console.log(JSON.stringify({
  ok: true,
  schema_version: "phase3_ball_trajectory_smoke.v1",
  fixture_schema_version: fixture.schema_version,
  source_contract: fixture.source_contract,
  scenario_count: results.length,
  statuses: Object.fromEntries(results.map((item) => [item.name, item.status])),
  frontend_overlay: frontendContract,
  documentation_contract: documentationContract,
  results
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(`phase3 ball trajectory smoke failed: ${message}`);
}

function assertUniqueScenarioNames(scenarios) {
  const names = new Set();
  for (const scenario of scenarios) {
    assert(scenario.name, "fixture scenario missing name");
    assert(!names.has(scenario.name), `duplicate fixture scenario: ${scenario.name}`);
    names.add(scenario.name);
  }
}

function assertFrontendOverlayContract(source) {
  const required = [
    "releaseMotion: null",
    "state.releaseMotion = evidence.release_motion || null",
    "function renderReleaseMotion",
    "function drawReleaseMotionOverlay",
    "pose_keypoint_release_motion_not_ball_flight",
    "human_pose_motion_slice_only_no_airborne_ball_tracking",
    "不追踪空中球路",
    "只画起球到出手手腕路径和 release 标记"
  ];
  for (const needle of required) {
    assert(source.includes(needle), `frontend release-motion contract missing: ${needle}`);
  }
  for (const forbidden of [
    "ballTrajectoryStatus",
    "ballTrajectoryCard",
    "state.ballTrajectory",
    "drawBallTrajectoryOverlay",
    "renderBallTrajectory",
    "renderTrajectoryPreview",
    "Ball Overlay",
    "候选球路点"
  ]) {
    assert(!source.includes(forbidden), `frontend must not expose airborne ball trajectory path: ${forbidden}`);
  }
  return {
    source_contract: "frontend_airborne_ball_path_removed_release_motion_active",
    backend_module: "server/ballTrajectory.mjs",
    backend_candidate_module_retained: true,
    frontend_ball_card_removed: !source.includes("ballTrajectoryCard"),
    frontend_ball_overlay_removed: !source.includes("drawBallTrajectoryOverlay"),
    release_motion_card_active: source.includes("renderReleaseMotion"),
    release_motion_overlay_active: source.includes("drawReleaseMotionOverlay")
  };
}

function assertDocumentationContract({ readme, phase3Doc }) {
  const required = [
    {
      label: "README Phase 3 boundary",
      source: readme,
      needles: [
        "前端不再展示空中球路卡片或候选球路 overlay",
        "release_motion.v1",
        "不代表真实视频稳定 2D 球轨迹能力"
      ]
    },
    {
      label: "Phase 3 smoke doc boundary",
      source: phase3Doc,
      needles: [
        "frontend no longer renders an airborne ball-trajectory card",
        "release_motion.v1",
        "human_pose_motion_slice_only_no_airborne_ball_tracking",
        "not real 2D tracking quality"
      ]
    }
  ];
  for (const item of required) {
    for (const needle of item.needles) {
      assert(item.source.includes(needle), `${item.label} missing: ${needle}`);
    }
  }
  for (const stale of [
    "frontend Ball Trajectory Card",
    "dedicated Ball Trajectory Card and candidate video overlay",
    "candidate video overlay source contract",
    "browser_dom_card_and_canvas_candidate_overlay"
  ]) {
    assert(!phase3Doc.includes(stale), `Phase 3 smoke doc has stale frontend claim: ${stale}`);
  }
  return {
    source_contract: "docs_match_frontend_no_airborne_ball_overlay",
    readme_phase3_updated: true,
    phase3_smoke_doc_updated: true
  };
}
