import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const [mainJs, stylesCss] = await Promise.all([
  readFile(path.join(root, "app", "main.js"), "utf8"),
  readFile(path.join(root, "app", "styles.css"), "utf8")
]);

const manifest = JSON.parse(await readFile(path.join(root, "data", "sample_manifest.json"), "utf8"));
const sampleId = readArg("--sample-id") || "synthetic_ball";
const sample = manifest.samples?.find((item) => item.id === sampleId);
if (!sample) fail(`sample not found in data/sample_manifest.json: ${sampleId}`);
if (sample.authorization?.status !== "authorized") fail(`sample is not authorized: ${sampleId}`);
if (!sample.authorization?.scope?.includes("local_acceptance_test")) {
  fail(`sample is not authorized for local_acceptance_test: ${sampleId}`);
}

const port = Number(readArg("--port")) || await freePort();
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");
let serverProcess = null;
const uploadIds = [];
const cleanupErrors = [];

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const sideUpload = await uploadSample(baseUrl, sample);
  const frontUpload = await uploadSample(baseUrl, sample);
  uploadIds.push(sideUpload.upload_id, frontUpload.upload_id);

  const sideOnly = await analyzeMultiAngle(baseUrl, sample, [
    videoInput(sideUpload.upload_id, "side", sample)
  ]);
  const frontOnly = await analyzeMultiAngle(baseUrl, sample, [
    videoInput(frontUpload.upload_id, "front", sample)
  ]);
  const both = await analyzeMultiAngle(baseUrl, sample, [
    videoInput(sideUpload.upload_id, "side", sample),
    videoInput(frontUpload.upload_id, "front", sample)
  ]);
  const reusableSideEvidence = await analyzeSingleAngle(baseUrl, sample, videoInput(sideUpload.upload_id, "side", sample));
  const reusedPrimary = await analyzeMultiAngle(baseUrl, sample, [
    {
      ...videoInput(sideUpload.upload_id, "side", sample),
      evidence_packet: reusableSideEvidence
    },
    videoInput(frontUpload.upload_id, "front", sample)
  ]);
  const mismatchReuse = await postJsonExpectStatus(`${baseUrl}/api/analyze-multi-angle`, {
    session_group_id: `phase4_smoke_mismatch_${Date.now()}`,
    shot_type: sample.shot_type,
    videos: [
      {
        ...videoInput(sideUpload.upload_id, "front", sample),
        evidence_packet: reusableSideEvidence
      }
    ]
  }, 400);
  const invalidSchemaReuse = await postJsonExpectStatus(`${baseUrl}/api/analyze-multi-angle`, {
    session_group_id: `phase4_smoke_invalid_schema_${Date.now()}`,
    shot_type: sample.shot_type,
    videos: [
      {
        ...videoInput(sideUpload.upload_id, "side", sample),
        evidence_packet: {
          schema_version: "multi_angle_evidence_packet.v1",
          session: { camera_view: "side" }
        }
      }
    ]
  }, 400);
  const privateFieldReuse = await postJsonExpectStatus(`${baseUrl}/api/analyze-multi-angle`, {
    session_group_id: `phase4_smoke_private_field_${Date.now()}`,
    shot_type: sample.shot_type,
    videos: [
      {
        ...videoInput(sideUpload.upload_id, "side", sample),
        evidence_packet: {
          ...reusableSideEvidence,
          video_path: "/private/local/sample.mov",
          video_context: {
            ...reusableSideEvidence.video_context,
            file_path: "/private/local/sample.mov"
          }
        }
      }
    ]
  }, 400);

  assertSingleView(sideOnly, "side", "front");
  assertSingleView(frontOnly, "front", "side");
  assertBothViews(both);
  assert(
    reusedPrimary.views?.side?.session_id === reusableSideEvidence.session_id,
    "reused primary evidence packet session_id was not preserved"
  );
  assert(mismatchReuse.error === "evidence_packet_camera_view_mismatch", "mismatched reused evidence should be rejected");
  assert(invalidSchemaReuse.error === "evidence_packet_schema_invalid", "invalid evidence packet schema should be rejected");
  assert(privateFieldReuse.error === "evidence_packet_schema_invalid", "private-field reused evidence should be rejected");
  assert(
    (privateFieldReuse.validation_errors || []).some((error) => error.includes("video_path") && error.includes("file_path")),
    "private-field reused evidence should report forbidden field paths"
  );
  const sideOnlyReport = await postJson(`${baseUrl}/api/coach-report`, sideOnly);
  const bothReport = await postJson(`${baseUrl}/api/coach-report`, both);
  assertMultiAngleReport(sideOnlyReport, sideOnly, "side_only", "front");
  assertMultiAngleReport(bothReport, both, "both", null);
  const frontendAudit = assertFrontendAuditContract(mainJs, stylesCss);

  const summary = {
    ok: true,
    schema_version: "phase4_multi_angle_smoke.v1",
    sample_id: sample.id,
    frontend_audit: frontendAudit,
    report_contracts: {
      side_only: summarizeReport(sideOnlyReport),
      both: summarizeReport(bothReport)
    },
    evidence_reuse: {
      preserved_session_id: reusedPrimary.views?.side?.session_id === reusableSideEvidence.session_id,
      mismatch_rejected: mismatchReuse.error,
      invalid_schema_rejected: invalidSchemaReuse.error,
      private_fields_rejected: privateFieldReuse.error
    },
    side_only: summarizePacket(sideOnly),
    front_only: summarizePacket(frontOnly),
    both: summarizePacket(both)
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  for (const uploadId of uploadIds) {
    if (!uploadId) continue;
    await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" })
      .then((response) => response.ok || cleanupErrors.push(`upload cleanup status ${response.status}: ${uploadId}`))
      .catch((error) => cleanupErrors.push(`upload cleanup failed ${uploadId}: ${error.message}`));
  }
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  if (cleanupErrors.length) {
    console.error(`cleanup warnings: ${cleanupErrors.join("; ")}`);
    process.exitCode = process.exitCode || 1;
  }
}

function assertMultiAngleReport(response, packet, label, expectedMissingView) {
  assert(response.player_report?.schema_version === "player_report.v1", `${label}: player_report missing`);
  assert(response.lab_report?.schema_version === "lab_report.v1", `${label}: lab_report missing`);
  assert(response.lab_report.evidence_packet_version === "multi_angle_evidence_packet.v1", `${label}: evidence packet version mismatch`);
  assert(response.lab_report.input_context?.analysis_mode === "multi_angle_approximate_grouping", `${label}: analysis mode missing`);
  assert(response.lab_report.multi_angle_context?.schema_version === "multi_angle_evidence_packet.v1", `${label}: multi_angle_context missing`);
  assert(response.lab_report.multi_angle_context?.sync_assessment?.schema_version === "sync_assessment.v1", `${label}: sync assessment missing in lab report`);
  assert(response.lab_report.multi_angle_context?.sync_assessment?.precision === "not_frame_accurate", `${label}: sync precision mismatch in lab report`);
  assert(response.lab_report.multi_angle_context?.view_quality_assessment?.schema_version === "view_quality_assessment.v1", `${label}: view quality assessment missing in lab report`);
  assert(response.lab_report.model_status?.multi_angle === "multi_angle_evidence_packet.v1", `${label}: multi-angle model status missing`);
  assert(response.lab_report.model_status?.sync === "not_frame_accurate", `${label}: sync model status missing`);
  assert((response.lab_report.missing_evidence || []).some((item) => item.type === "sync_risk" && item.value === "no_frame_accurate_sync"), `${label}: sync risk missing evidence not carried into report`);
  assert((response.player_report.uncertainties || []).some((item) => item.missing_evidence?.includes("sync_risk")), `${label}: player report should cite sync risk uncertainty`);
  if (expectedMissingView) {
    assert((response.lab_report.multi_angle_context?.missing_views || []).includes(expectedMissingView), `${label}: expected missing view not carried`);
    assert((response.player_report.uncertainties || []).some((item) => item.missing_evidence === `view:${expectedMissingView}`), `${label}: player report missing view uncertainty`);
    assert(response.player_report.next_video_request?.view === expectedMissingView, `${label}: next view request mismatch`);
  } else {
    assert((response.lab_report.multi_angle_context?.missing_views || []).length === 0, `${label}: should not carry missing views`);
    assert(response.player_report.next_video_request?.view === "front_and_side" || response.player_report.next_video_request?.view === "side", `${label}: next view should remain retake-oriented`);
  }
  assert(packet.sync_policy === response.lab_report.multi_angle_context.sync_policy, `${label}: sync policy not preserved`);
}

async function analyzeMultiAngle(baseUrl, sample, videos) {
  return postJson(`${baseUrl}/api/analyze-multi-angle`, {
    session_group_id: `phase4_smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    shot_type: sample.shot_type,
    videos
  });
}

async function analyzeSingleAngle(baseUrl, sample, video) {
  return postJson(`${baseUrl}/api/analyze-video`, {
    ...video,
    user_id: "local_user_001",
    dominant_hand: "right",
    video_duration_ms: sample.duration_ms || 2400,
    observed_fps: sample.fps || 30,
    upload_metadata: {
      width: sample.width || 640,
      height: sample.height || 360,
      fps: sample.fps || 30,
      duration_ms: sample.duration_ms || 2400
    }
  });
}

function videoInput(uploadId, cameraView, sample) {
  return {
    upload_id: uploadId,
    file_name: `${cameraView}_${path.basename(sample.file_path)}`,
    camera_view: cameraView,
    shot_type: sample.shot_type,
    fps: sample.fps || 60,
    training_goal: "Phase 4 multi-angle contract smoke"
  };
}

function assertSingleView(packet, presentView, missingView) {
  assert(packet.schema_version === "multi_angle_evidence_packet.v1", `${presentView}: schema mismatch`);
  assert(packet.sync_policy === "approximate_session_grouping_no_manual_keyframe_sync", `${presentView}: sync policy changed`);
  assertSyncAssessment(packet, `${presentView}`, "missing_required_view", missingView);
  assertViewQuality(packet, `${presentView}`, "insufficient", [`view_quality_missing_${missingView}`]);
  assert(packet.present_views?.length === 1 && packet.present_views.includes(presentView), `${presentView}: present view mismatch`);
  assert(packet.missing_views?.length === 1 && packet.missing_views.includes(missingView), `${presentView}: missing view mismatch`);
  assert(hasMissingViewEvidence(packet, missingView), `${presentView}: missing view evidence missing`);
  assertMergedSources(packet, [presentView], `${presentView}: merged source mismatch`);
}

function assertBothViews(packet) {
  assert(packet.schema_version === "multi_angle_evidence_packet.v1", "both: schema mismatch");
  assert(packet.sync_policy === "approximate_session_grouping_no_manual_keyframe_sync", "both: sync policy changed");
  assertSyncAssessment(packet, "both", "approximate_only", null);
  assertViewQuality(packet, "both", "metadata_ready", ["view_quality_front_side_metadata_ready"]);
  assert(packet.present_views?.includes("front") && packet.present_views?.includes("side"), "both: present views mismatch");
  assert(Array.isArray(packet.missing_views) && packet.missing_views.length === 0, "both: missing views must be empty");
  assert(!hasMissingViewEvidence(packet, "front") && !hasMissingViewEvidence(packet, "side"), "both: should not include missing view evidence");
  assertMergedSources(packet, ["front", "side"], "both: merged source mismatch");
}

function assertFrontendAuditContract(mainSource, styleSource) {
  const requiredMain = [
    "function renderMultiAngleViewTable",
    "function renderMultiAngleMetricAudit",
    "function renderMultiAngleMissingEvidence",
    "function renderMultiAngleSyncAssessment",
    "function renderMultiAngleSyncRisks",
    "function renderMultiAngleViewQuality",
    "const reportEvidence = state.multiAngleEvidence || evidence",
    "multi_angle_context",
    "多角度",
    "同步风险",
    "同步评估",
    "视角质量评估",
    "view_quality_assessment.v1",
    "metadata_and_evidence_context_only_not_real_frame_quality",
    "同步风险",
    "not_frame_accurate",
    "risk_factors",
    "视角证据清单",
    "关键指标来源",
    "视角缺失影响",
    "approximate session grouping",
    "没有精确关键帧同步",
    "source_views"
  ];
  for (const needle of requiredMain) {
    assert(mainSource.includes(needle), `frontend audit binding missing: ${needle}`);
  }
  for (const needle of [".multi-angle-table", ".multi-angle-row"]) {
    assert(styleSource.includes(needle), `frontend audit style missing: ${needle}`);
  }
  for (const forbidden of ["precise_sync_complete", "stable_cross_camera_sync", "manual_keyframe_sync_complete"]) {
    assert(!mainSource.includes(forbidden), `frontend must not claim precise sync: ${forbidden}`);
  }
  return {
    source_contract: "multi_angle_audit_ui_candidate_only",
    view_evidence_table: true,
    metric_source_audit: true,
    missing_view_impact: true,
    view_quality_assessment: true,
    sync_assessment: true,
    sync_policy_copy: "approximate_session_grouping_no_manual_keyframe_sync"
  };
}

function assertViewQuality(packet, label, expectedStatus, expectedFactorIds) {
  const quality = packet.view_quality_assessment || {};
  assert(quality.schema_version === "view_quality_assessment.v1", `${label}: view quality schema missing`);
  assert(quality.source_contract === "metadata_and_evidence_context_only_not_real_frame_quality", `${label}: view quality source contract mismatch`);
  assert(quality.status === expectedStatus, `${label}: view quality status mismatch: ${quality.status}`);
  assert(Array.isArray(quality.view_results) && quality.view_results.length > 0, `${label}: view quality results missing`);
  const factorIds = (quality.risk_factors || []).map((item) => item.factor_id);
  for (const factorId of expectedFactorIds) {
    assert(factorIds.includes(factorId), `${label}: view quality factor missing ${factorId}`);
  }
  assert(quality.retake_guidance && quality.retake_guidance.length > 0, `${label}: view quality retake guidance missing`);
}

function assertSyncAssessment(packet, label, expectedStatus, expectedMissingView) {
  const sync = packet.sync_assessment || {};
  assert(sync.schema_version === "sync_assessment.v1", `${label}: sync assessment schema missing`);
  assert(sync.status === expectedStatus, `${label}: sync assessment status mismatch`);
  assert(sync.policy === "approximate_session_grouping_no_manual_keyframe_sync", `${label}: sync assessment policy mismatch`);
  assert(sync.precision === "not_frame_accurate", `${label}: sync assessment precision mismatch`);
  const reasons = (sync.reasons || []).map((item) => item.reason);
  for (const reason of ["approximate_session_grouping", "no_shared_clock", "no_manual_keyframe_sync"]) {
    assert(reasons.includes(reason), `${label}: sync assessment missing reason ${reason}`);
  }
  assert(reasons.includes("no_sync_marker"), `${label}: sync assessment missing no_sync_marker reason`);
  if (expectedMissingView) {
    assert(reasons.includes(`missing_${expectedMissingView}_view`), `${label}: sync assessment missing view reason`);
  }
  assert(["high", "medium", "low"].includes(sync.risk_level), `${label}: sync risk_level missing`);
  assert(Array.isArray(sync.risk_factors) && sync.risk_factors.length >= 3, `${label}: sync risk factors missing`);
  const factorIds = sync.risk_factors.map((item) => item.factor_id);
  for (const factorId of ["no_frame_accurate_sync", "no_shared_clock", "no_sync_marker"]) {
    assert(factorIds.includes(factorId), `${label}: sync risk factor missing ${factorId}`);
  }
  assert(sync.retake_guidance && sync.retake_guidance.includes("下一次"), `${label}: sync retake guidance missing`);
}

function assertMergedSources(packet, expectedViews, label) {
  const metrics = packet.merged?.metrics || [];
  assert(metrics.length > 0, `${label}: merged metrics missing`);
  const metricViews = new Set(metrics.map((metric) => metric.source_view).filter(Boolean));
  for (const view of expectedViews) {
    assert(metricViews.has(view), `${label}: metric source_view missing ${view}`);
  }
  for (const metric of metrics.slice(0, 10)) {
    assert(metric.metric_id, `${label}: metric_id missing`);
    assert(metric.packet_session_id, `${label}: packet_session_id missing`);
    assert(metric.source_view, `${label}: source_view missing`);
  }

  const signals = packet.merged?.matched_signals || [];
  for (const signal of signals.slice(0, 10)) {
    assert(signal.source_view, `${label}: signal source_view missing`);
    assert(signal.packet_session_id, `${label}: signal packet_session_id missing`);
  }

  const rules = packet.merged?.matched_rules || [];
  for (const rule of rules.slice(0, 10)) {
    assert(Array.isArray(rule.source_views), `${label}: rule source_views missing`);
    assert(rule.packet_session_id, `${label}: rule packet_session_id missing`);
  }
}

function hasMissingViewEvidence(packet, view) {
  return (packet.merged?.missing_evidence || []).some((item) => item.type === "view" && item.value === view);
}

function summarizePacket(packet) {
  const metrics = packet.merged?.metrics || [];
  const signals = packet.merged?.matched_signals || [];
  const rules = packet.merged?.matched_rules || [];
  return {
    schema: packet.schema_version,
    present_views: packet.present_views,
    missing_views: packet.missing_views,
    sync_policy: packet.sync_policy,
    metric_count: metrics.length,
    metric_source_views: [...new Set(metrics.map((metric) => metric.source_view).filter(Boolean))].sort(),
    signal_source_views: [...new Set(signals.map((signal) => signal.source_view).filter(Boolean))].sort(),
    rule_source_views: [...new Set(rules.flatMap((rule) => rule.source_views || []))].sort(),
    missing_view_evidence: (packet.merged?.missing_evidence || [])
      .filter((item) => item.type === "view")
      .map((item) => item.value)
      .sort(),
    sync_assessment: {
      schema_version: packet.sync_assessment?.schema_version,
      status: packet.sync_assessment?.status,
      precision: packet.sync_assessment?.precision,
      reason_count: packet.sync_assessment?.reasons?.length || 0,
      risk_level: packet.sync_assessment?.risk_level,
      risk_factor_count: packet.sync_assessment?.risk_factors?.length || 0
    },
    view_quality_assessment: {
      schema_version: packet.view_quality_assessment?.schema_version,
      status: packet.view_quality_assessment?.status,
      risk_factor_count: packet.view_quality_assessment?.risk_factors?.length || 0
    },
    confidence: packet.merged?.confidence?.max_report_confidence
  };
}

function summarizeReport(response) {
  return {
    mode: response.mode,
    player_status: response.player_report?.analysis_status,
    player_next_view: response.player_report?.next_video_request?.view,
    lab_evidence_packet_version: response.lab_report?.evidence_packet_version,
    lab_analysis_mode: response.lab_report?.input_context?.analysis_mode,
    lab_present_views: response.lab_report?.multi_angle_context?.present_views || [],
    lab_missing_views: response.lab_report?.multi_angle_context?.missing_views || [],
    sync_precision: response.lab_report?.multi_angle_context?.sync_assessment?.precision,
    view_quality_status: response.lab_report?.multi_angle_context?.view_quality_assessment?.status,
    sync_risk_evidence_count: (response.lab_report?.missing_evidence || []).filter((item) => item.type === "sync_risk").length
  };
}

async function startServer(port) {
  const child = spawn(nodeBin, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DEEPSEEK_API_KEY: "",
      YOLO_COMMAND: "",
      RTMPOSE_COMMAND: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code && code !== 130 && code !== 1) {
      console.error(`server exited with code ${code}: ${stderr.slice(-1000)}`);
    }
  });
  try {
    await waitForServer(`http://localhost:${port}`);
    return child;
  } catch (error) {
    child.kill("SIGINT");
    await new Promise((resolve) => child.once("exit", resolve));
    throw error;
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/privacy-boundary`);
      if (response.ok) return;
    } catch {
      // Retry until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`server did not become ready: ${baseUrl}`);
}

async function uploadSample(baseUrl, sample) {
  const filePath = path.join(root, sample.file_path);
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("video", new Blob([bytes], { type: "video/mp4" }), path.basename(sample.file_path));
  const response = await fetch(`${baseUrl}/api/upload-video`, {
    method: "POST",
    body: form
  });
  if (!response.ok) fail(`upload failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJsonExpectStatus(url, body, expectedStatus) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== expectedStatus) {
    fail(`request status mismatch: ${url} expected ${expectedStatus}, got ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase4 multi-angle smoke failed: ${message}`);
}
