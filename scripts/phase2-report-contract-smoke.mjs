import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;

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
let uploadId = null;
const cleanupErrors = [];

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const upload = await uploadSample(baseUrl, sample);
  uploadId = upload.upload_id;

  const evidence = await postJson(`${baseUrl}/api/analyze-video`, {
    upload_id: upload.upload_id,
    file_name: upload.file_name,
    shot_type: sample.shot_type,
    camera_view: sample.camera_view,
    fps: sample.fps || 60,
    training_goal: "Phase 2 report contract smoke"
  });
  assert(evidence.schema_version === "evidence_packet.v1", "evidence schema mismatch");

  const response = await postJson(`${baseUrl}/api/coach-report`, evidence);
  assert(response.report?.primary_diagnosis, "legacy report missing");
  assert(response.player_report?.schema_version === "player_report.v1", "player_report.v1 missing");
  assert(response.lab_report?.schema_version === "lab_report.v1", "lab_report.v1 missing");

  const refs = evidenceReferenceSets(evidence);
  assertPlayerReport(response.player_report, response.report, evidence, refs);
  assertLabReport(response.lab_report, response, evidence, refs);
  await assertFrontendResource(baseUrl);

  const summary = {
    ok: true,
    schema_version: "phase2_report_contract_smoke.v1",
    mode: response.mode,
    legacy_report: Boolean(response.report),
    player_report_version: response.player_report.schema_version,
    player_status: response.player_report.analysis_status,
    player_evidence_refs: response.player_report.primary_issue?.evidence_refs?.length || 0,
    player_uncertainties: response.player_report.uncertainties?.length || 0,
    lab_report_version: response.lab_report.schema_version,
    lab_evidence_packet_version: response.lab_report.evidence_packet_version,
    lab_metric_count: response.lab_report.metrics?.length || 0,
    lab_signal_count: response.lab_report.signals?.length || 0,
    lab_rule_count: response.lab_report.matched_rules?.length || 0,
    lab_missing_evidence_count: response.lab_report.missing_evidence?.length || 0,
    validation_errors: response.validation_errors || []
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (uploadId) {
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

function assertPlayerReport(player, legacyReport, evidence, refs) {
  assert(player.session_id === evidence.session_id, "player session_id mismatch");
  assert(confidenceRank(player.confidence) <= confidenceRank(evidence.confidence?.max_report_confidence), "player confidence exceeds evidence max");
  assert(["diagnosable", "review_only", "not_analyzable"].includes(player.analysis_status), "invalid player analysis_status");
  assert(player.primary_issue?.title, "player primary_issue.title missing");
  assert(player.primary_issue?.why_it_matters, "player primary_issue.why_it_matters missing");
  const evidenceRefs = player.primary_issue?.evidence_refs || [];
  for (const item of evidenceRefs) assertEvidenceRef(item, refs, "player primary_issue");
  if (!evidenceRefs.length) {
    assert((player.uncertainties || []).some((item) => item.missing_evidence), "player low-evidence report must cite missing_evidence");
  }
  for (const drill of player.what_to_do_next || []) {
    assert(drill.drill && drill.dosage && drill.success_metric, "player drill fields missing");
    if (drill.rule_id) assert(refs.ruleIds.has(drill.rule_id), `player drill unknown rule_id: ${drill.rule_id}`);
  }
  assert(player.next_video_request?.view, "player next_video_request.view missing");
  assert(player.next_video_request?.reason, "player next_video_request.reason missing");
  assert(legacyReport.follow_up?.next_metric_to_watch, "legacy follow_up metric missing");
}

function assertLabReport(lab, response, evidence, refs) {
  assert(lab.session_id === evidence.session_id, "lab session_id mismatch");
  assert(lab.evidence_packet_version === evidence.schema_version, "lab evidence packet version mismatch");
  assert(lab.input_context?.analysis_mode === evidence.session?.analysis_mode, "lab input_context analysis_mode mismatch");
  assert(lab.model_status?.object_detection === evidence.pipeline_status?.object_detection_layer, "lab object_detection status mismatch");
  assert((lab.metrics || []).length === Object.keys(evidence.metrics || {}).length, "lab metric count mismatch");
  for (const metric of lab.metrics || []) {
    assert(refs.metricIds.has(metric.metric_id), `lab unknown metric_id: ${metric.metric_id}`);
    assert(metric.source === evidence.session?.analysis_mode, `lab metric source mismatch: ${metric.metric_id}`);
  }
  assert((lab.signals || []).length === (evidence.matched_signals || []).length, "lab signal count mismatch");
  assert((lab.matched_rules || []).length === (evidence.matched_rules || []).length, "lab rule count mismatch");
  assert((lab.missing_evidence || []).length === (evidence.missing_evidence || []).length, "lab missing_evidence count mismatch");
  for (const item of lab.diagnosis?.evidence_refs || []) assertEvidenceRef(item, refs, "lab diagnosis");
  if (!(lab.diagnosis?.evidence_refs || []).length) {
    assert((lab.missing_evidence || []).length > 0, "lab low-evidence report must carry missing_evidence");
  }
  assert(lab.debug_notes?.report_mode === response.mode, "lab debug report_mode mismatch");
}

async function assertFrontendResource(baseUrl) {
  const response = await fetch(`${baseUrl}/main.js`);
  if (!response.ok) fail(`main.js fetch failed: ${response.status}`);
  const source = await response.text();
  assert(source.includes("球员版报告"), "frontend player report section text missing");
  assert(source.includes("实验室版摘要"), "frontend lab report section text missing");
  assert(source.includes("function renderReportTracePanel"), "frontend evidence trace renderer missing");
  assert(source.includes("Evidence Trace"), "frontend evidence trace heading missing");
  assert(source.includes("signal_id"), "frontend signal_id trace binding missing");
  assert(source.includes("metric_id"), "frontend metric_id trace binding missing");
  assert(source.includes("rule_id"), "frontend rule_id trace binding missing");
  assert(source.includes("missing_evidence"), "frontend missing_evidence trace binding missing");
  assert(source.includes("player_report"), "frontend player_report binding missing");
  assert(source.includes("lab_report"), "frontend lab_report binding missing");
}

function assertEvidenceRef(item, refs, label) {
  const hasTrace = item.signal_id || item.metric_id || item.frame !== null || item.rule_id || item.missing_evidence;
  assert(hasTrace, `${label}: evidence ref has no traceable source`);
  if (item.signal_id) assert(refs.signalIds.has(item.signal_id), `${label}: unknown signal_id ${item.signal_id}`);
  if (item.metric_id) assert(refs.metricIds.has(item.metric_id), `${label}: unknown metric_id ${item.metric_id}`);
  if (typeof item.frame === "number") assert(refs.frames.has(item.frame), `${label}: unknown frame ${item.frame}`);
  if (item.rule_id) assert(refs.ruleIds.has(item.rule_id), `${label}: unknown rule_id ${item.rule_id}`);
}

function evidenceReferenceSets(evidence) {
  return {
    signalIds: new Set((evidence.matched_signals || []).map((signal) => signal.signal_id).filter(Boolean)),
    metricIds: new Set([
      ...Object.keys(evidence.metrics || {}),
      ...(evidence.metric_series || []).flatMap((row) => Object.keys(row).filter((key) => key !== "frame"))
    ]),
    frames: new Set([
      ...(evidence.matched_signals || []).map((signal) => signal.frame).filter((frame) => typeof frame === "number"),
      ...(evidence.metric_series || []).map((row) => row.frame).filter((frame) => typeof frame === "number")
    ]),
    ruleIds: new Set((evidence.matched_rules || []).filter((rule) => rule.diagnosis_allowed !== false).map((rule) => rule.rule_id).filter(Boolean))
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

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function confidenceRank(confidence) {
  return { low: 1, medium: 2, high: 3 }[confidence] || 0;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase2 report contract smoke failed: ${message}`);
}
