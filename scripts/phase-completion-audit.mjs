import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const files = new Map();

const phaseContracts = [
  {
    phase: 1,
    goal: "验收基线和样例视频闭环",
    artifacts: [
      "data/sample_manifest.json",
      "data/fixtures/authorized-sample-readiness-fixtures.json",
      "data/synthetic_ball.mp4",
      "server/sampleReadinessPolicy.mjs",
      "scripts/authorized-sample-readiness-smoke.mjs",
      "scripts/authorized-sample-readiness-ui-smoke.mjs",
      "scripts/phase1-sample-smoke.mjs",
      "scripts/phase1-sample-ui-smoke.mjs",
      "docs/AUTHORIZED_SAMPLE_READINESS.md",
      "docs/PHASE1_SMOKE_REPORT.md"
    ],
    package_scripts: ["smoke:sample-readiness", "smoke:sample-readiness-ui", "smoke:phase1", "smoke:phase1-ui"],
    acceptance_needles: ["## Phase 1 样例闭环验收", "authorized_sample_readiness_smoke.v1", "short_term_review"],
    handoff_needles: ["Phase 1 smoke assets exist", "Authorized sample readiness smoke exists"]
  },
  {
    phase: 2,
    goal: "报告合同落地到前端",
    artifacts: [
      "server/reportContracts.mjs",
      "scripts/phase2-report-contract-smoke.mjs",
      "scripts/phase2-report-ui-browser-smoke.mjs",
      "docs/PHASE2_REPORT_CONTRACT_SMOKE.md",
      "docs/PHASE2_REPORT_UI_SMOKE.md"
    ],
    package_scripts: ["smoke:phase2", "smoke:phase2-ui"],
    acceptance_needles: ["## Phase 2 报告 UI 验收", "player_report.v1", "Evidence Trace"],
    handoff_needles: ["Phase 2 report contract is implemented", "Phase 2 report UI browser smoke exists"]
  },
  {
    phase: 3,
    goal: "球轨迹模块独立化",
    artifacts: [
      "server/ballTrajectory.mjs",
      "data/fixtures/phase3-ball-trajectory-adapter-fixtures.json",
      "scripts/phase3-ball-trajectory-smoke.mjs",
      "scripts/phase3-ball-trajectory-ui-smoke.mjs",
      "docs/PHASE3_BALL_TRAJECTORY_SMOKE.md",
      "docs/PHASE3_BALL_TRAJECTORY_UI_SMOKE.md"
    ],
    package_scripts: ["smoke:phase3", "smoke:phase3-ui"],
    acceptance_needles: ["## Ball Trajectory 合同验收", "candidate_only_yolo_adapter_output_not_stable_tracking", "diagnosis_allowed=false"],
    handoff_needles: ["Phase 3 ball trajectory module is implemented", "Do not describe current YOLO as stable tracking"]
  },
  {
    phase: 4,
    goal: "多角度输入",
    artifacts: [
      "server/multiAngleEvidence.mjs",
      "scripts/phase4-multi-angle-smoke.mjs",
      "scripts/phase4-multi-angle-ui-smoke.mjs",
      "docs/PHASE4_MULTI_ANGLE_SMOKE.md",
      "docs/PHASE4_MULTI_ANGLE_UI_SMOKE.md"
    ],
    package_scripts: ["smoke:phase4", "smoke:phase4-ui"],
    acceptance_needles: ["## Multi-Angle 验收", "multi_angle_evidence_packet.v1", "not_frame_accurate"],
    handoff_needles: ["Phase 4 multi-angle endpoint exists", "not precise sync"]
  },
  {
    phase: 5,
    goal: "教练式动态画线",
    artifacts: [
      "scripts/phase5-dynamic-lines-smoke.mjs",
      "scripts/phase5-browser-visual-smoke.mjs",
      "docs/PHASE5_DYNAMIC_LINES_SMOKE.md",
      "docs/PHASE5_BROWSER_VISUAL_SMOKE.md"
    ],
    package_scripts: ["smoke:phase5", "smoke:phase5-browser"],
    acceptance_needles: ["## Phase 5 动态画线浏览器验收", "coach_overlay_diagnostics.v1", "local_browser_png_current_frame_no_video_export"],
    handoff_needles: ["Phase 5 dynamic overlay draws coach lines", "There is no validated action-phase classifier"]
  },
  {
    phase: 6,
    goal: "个人记忆系统产品化",
    artifacts: [
      "server/memoryStore.mjs",
      "scripts/phase6-memory-smoke.mjs",
      "scripts/phase6-memory-ui-smoke.mjs",
      "docs/PHASE6_MEMORY_PRODUCTIZATION_SMOKE.md"
    ],
    package_scripts: ["smoke:phase6", "smoke:phase6-ui"],
    acceptance_needles: ["## 个人记忆验收", "long_term_only", "local_sqlite_sessions_only"],
    handoff_needles: ["Phase 6 memory productization exposes local profile", "Phase 6 memory UI browser smoke exists"]
  },
  {
    phase: 7,
    goal: "登录、云端和隐私方案",
    artifacts: [
      "scripts/phase7-privacy-smoke.mjs",
      "scripts/phase7-privacy-ui-smoke.mjs",
      "docs/PHASE7_PRIVACY_BOUNDARY_SMOKE.md",
      "Privacy-And-Data-Policy-Draft.md"
    ],
    package_scripts: ["smoke:phase7", "smoke:phase7-ui"],
    acceptance_needles: ["## 隐私边界验收", "privacy_export.v1", "cloud_sync"],
    handoff_needles: ["Phase 7 privacy boundary exposes local-only policy", "No login, account, cloud sync"]
  }
];

const requiredBoundaryNeedles = [
  "No authorized real shooting sample has been validated end to end.",
  "No precise cross-camera synchronization.",
  "No validated action-phase classifier.",
  "No exported annotated video.",
  "No login, account, cloud sync",
  "No final scoring formula."
];

const requiredRunnerNeedles = [
  "scripts/phase-completion-audit.mjs",
  "phase completion audit"
];

const packageJson = JSON.parse(await readText("package.json"));
const goalBacklog = await readText("Goal-Backlog.md");
const acceptance = await readText("Acceptance-Baseline.md");
const handoff = await readText("docs/HANDOFF.md");
const runner = await readText("scripts/mvp-acceptance-smoke.mjs");

assertNoForbiddenPlaceholder(goalBacklog, "Goal-Backlog.md");
assertNoForbiddenPlaceholder(acceptance, "Acceptance-Baseline.md");
assertIncludes(acceptance, "## Phase 验收基线", "acceptance baseline must keep phase baseline section");
assertIncludes(handoff, "## Remaining Gaps", "handoff must keep remaining gaps section");
for (const needle of requiredBoundaryNeedles) {
  assertIncludes(handoff, needle, `handoff missing boundary gap: ${needle}`);
}
for (const needle of requiredRunnerNeedles) {
  assertIncludes(runner, needle, `MVP runner missing phase-completion audit binding: ${needle}`);
}

const phaseResults = [];
for (const contract of phaseContracts) {
  const artifactStatus = [];
  for (const artifact of contract.artifacts) {
    artifactStatus.push({ path: artifact, exists: await exists(artifact) });
  }
  const missingArtifacts = artifactStatus.filter((item) => !item.exists).map((item) => item.path);
  assert(missingArtifacts.length === 0, `phase ${contract.phase} missing artifacts: ${missingArtifacts.join(", ")}`);

  assertIncludes(goalBacklog, `## Phase ${contract.phase} Goal`, `Goal-Backlog missing Phase ${contract.phase}`);
  assertIncludes(goalBacklog, contract.goal, `Goal-Backlog missing Phase ${contract.phase} goal name`);
  assertPhaseGoalHasSections(goalBacklog, contract.phase);

  for (const scriptName of contract.package_scripts) {
    assert(packageJson.scripts?.[scriptName], `package.json missing script ${scriptName}`);
  }
  for (const needle of contract.acceptance_needles) {
    assertIncludes(acceptance, needle, `Acceptance-Baseline missing Phase ${contract.phase} needle: ${needle}`);
  }
  for (const needle of contract.handoff_needles) {
    assertIncludes(handoff, needle, `Handoff missing Phase ${contract.phase} needle: ${needle}`);
  }

  phaseResults.push({
    phase: contract.phase,
    goal: contract.goal,
    artifact_count: artifactStatus.length,
    package_scripts: contract.package_scripts,
    acceptance_needles: contract.acceptance_needles.length,
    handoff_needles: contract.handoff_needles.length
  });
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "phase_completion_audit.v1",
  source_contract: "static_phase_1_to_7_completion_evidence_audit",
  phases_checked: phaseResults.length,
  phase_results: phaseResults,
  checks: {
    goal_backlog_sections: true,
    artifacts_exist: true,
    package_scripts: true,
    acceptance_evidence: true,
    handoff_evidence: true,
    remaining_external_gaps_preserved: true,
    forbidden_placeholders_absent: true,
    mvp_runner_binding: true
  },
  external_gaps_not_resolved_by_local_smokes: [
    "authorized_real_or_representative_sample_validation",
    "precise_cross_camera_synchronization",
    "validated_action_phase_classifier",
    "exported_annotated_video",
    "login_account_cloud_sync",
    "final_scoring_formula"
  ]
}, null, 2));

async function readText(relativePath) {
  if (!files.has(relativePath)) {
    files.set(relativePath, await readFile(path.join(root, relativePath), "utf8"));
  }
  return files.get(relativePath);
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function assertPhaseGoalHasSections(source, phase) {
  const start = source.indexOf(`## Phase ${phase} Goal`);
  const next = source.indexOf(`## Phase ${phase + 1} Goal`, start + 1);
  const block = source.slice(start, next === -1 ? source.length : next);
  for (const section of ["目标：", "完成标准：", "验证方式：", "约束："]) {
    assertIncludes(block, section, `Phase ${phase} goal missing section ${section}`);
  }
}

function assertNoForbiddenPlaceholder(source, label) {
  const forbidden = ["以后再说", "待定"];
  for (const word of forbidden) {
    assert(!source.includes(word), `${label} contains forbidden placeholder: ${word}`);
  }
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assert(condition, message) {
  if (!condition) throw new Error(`phase completion audit failed: ${message}`);
}
