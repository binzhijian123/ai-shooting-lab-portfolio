import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const folder = path.resolve(root, readArg("--folder") || "测试用例");
const port = Number(readArg("--port")) || await freePort();
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");
const singleOnly = process.argv.includes("--single-only");

const viewAssignments = {
  "IMG_6316.MOV": "side",
  "IMG_6317.MOV": "side_back_candidate",
  "IMG_6318.MOV": "front",
  "IMG_6319.MOV": "side",
  "IMG_6320.MOV": "side_back_candidate",
  "IMG_6321.MOV": "front",
  "IMG_6322.MOV": "front",
  "IMG_6323.MOV": "side",
  "IMG_6325.MOV": "front",
  "IMG_6326.MOV": "side",
  "IMG_6327.MOV": "side_back_candidate",
  "IMG_6328.MOV": "side_back_candidate"
};

let serverProcess = null;
const uploadIds = [];
const sessionIds = [];
const cleanupErrors = [];
const evidenceByFile = new Map();

try {
  const requestedFiles = readArg("--files")
    ? new Set(readArg("--files").split(",").map((item) => item.trim()).filter(Boolean))
    : null;
  const files = (await readdir(folder))
    .filter((file) => /\.(mov|mp4|m4v|webm)$/i.test(file))
    .filter((file) => !requestedFiles || requestedFiles.has(file))
    .sort();
  if (!files.length) fail(`no videos found in ${folder}`);

  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const [knowledge, modelHealth, privacyBoundary] = await Promise.all([
    fetchJson(`${baseUrl}/api/knowledge-summary`),
    fetchJson(`${baseUrl}/api/model-health`),
    fetchJson(`${baseUrl}/api/privacy-boundary`)
  ]);

  const singleAngle = [];
  for (const file of files) {
    const cameraView = viewAssignments[file] || inferView(file);
    console.error(`[authorized-real-folder] upload ${file} as ${cameraView}`);
    const upload = await uploadFile(baseUrl, path.join(folder, file));
    uploadIds.push(upload.upload_id);
    console.error(`[authorized-real-folder] analyze ${file}`);
    const evidence = await postJson(`${baseUrl}/api/analyze-video`, {
      upload_id: upload.upload_id,
      file_name: upload.file_name,
      shot_type: "定点投篮",
      camera_view: cameraView,
      fps: upload.metadata?.fps || 30,
      training_goal: "授权真实样例本地验收",
      user_id: "authorized_real_folder_smoke"
    });
    evidenceByFile.set(file, evidence);
    console.error(`[authorized-real-folder] report ${file}`);
    const coach = await postJson(`${baseUrl}/api/coach-report`, evidence);
    singleAngle.push(summarizeSingle(file, cameraView, upload, evidence, coach));
  }

  let alpha = null;
  const multiAngle = {};
  if (!singleOnly) {
    const alphaTarget = singleAngle.find((item) => item.camera_view === "front" && item.duration_ms >= 1500)
      || singleAngle.find((item) => item.duration_ms >= 1500)
      || singleAngle[0];
    const alphaUpload = uploadIds[singleAngle.findIndex((item) => item.file === alphaTarget.file)];
    const alphaSessionId = `authorized_real_alpha_${Date.now()}`;
    sessionIds.push(alphaSessionId);
    alpha = await postJson(`${baseUrl}/api/authorized-alpha-analysis`, {
      upload_id: alphaUpload,
      session_id: alphaSessionId,
      tester_agreement_id: "local-user-provided-test-folder-2026-06-16",
      file_name: alphaTarget.file,
      camera_view: alphaTarget.camera_view,
      shot_type: "定点投篮",
      fps: alphaTarget.fps || 30,
      training_goal: "授权真实样例 Alpha 本地验收",
      user_id: "authorized_real_folder_smoke",
      authorization: {
        tester_agreement_id: "local-user-provided-test-folder-2026-06-16",
        local_analysis: true,
        local_acceptance_test: true,
        allow_public_showcase: false,
        allow_external_distribution: false,
        allow_cloud_storage: false,
        allow_model_training: false
      }
    });

    const front = singleAngle.find((item) => item.file === "IMG_6318.MOV")
      || singleAngle.find((item) => item.camera_view === "front" && item.duration_ms >= 1500);
    const side = singleAngle.find((item) => item.file === "IMG_6316.MOV")
      || singleAngle.find((item) => item.camera_view === "side" && item.duration_ms >= 1500);
    const sideBack = singleAngle.find((item) => item.file === "IMG_6317.MOV")
      || singleAngle.find((item) => item.camera_view === "side_back_candidate");

    if (front && side) {
      multiAngle.front_side = summarizeMultiAngle(await analyzeMultiAngle("front_side", [
        videoInput(front, uploadIds[singleAngle.indexOf(front)], "front"),
        videoInput(side, uploadIds[singleAngle.indexOf(side)], "side")
      ]));
    }
    if (front && sideBack) {
      multiAngle.front_side_back = summarizeMultiAngle(await analyzeMultiAngle("front_side_back", [
        videoInput(front, uploadIds[singleAngle.indexOf(front)], "front"),
        videoInput(sideBack, uploadIds[singleAngle.indexOf(sideBack)], "side_back_candidate")
      ]));
    }
    if (sideBack) {
      multiAngle.side_back_only = summarizeMultiAngle(await analyzeMultiAngle("side_back_only", [
        videoInput(sideBack, uploadIds[singleAngle.indexOf(sideBack)], "side_back_candidate")
      ]));
    }
  }

  const acceptance = assessAcceptance({ singleAngle, alpha, multiAngle, modelHealth, privacyBoundary });

  console.log(JSON.stringify({
    ok: true,
    schema_version: "authorized_real_folder_smoke.v1",
    source_contract: "local_user_provided_videos_no_external_upload_no_training",
    mode: singleOnly ? "single_only" : "single_alpha_multi_angle",
    folder: path.relative(root, folder),
    knowledge_base: {
      source_count: knowledge.source_count,
      signals: knowledge.signals,
      diagnosis_rule_count: knowledge.diagnosis_rule_count
    },
    model_health: summarizeModelHealth(modelHealth),
    privacy_boundary: {
      contains_real_school_team_video: privacyBoundary.contains_real_school_team_video,
      default_forbidden_uses: privacyBoundary.default_forbidden_uses
    },
    single_angle: singleAngle,
    authorized_alpha: summarizeAlpha(alpha),
    multi_angle: multiAngle,
    acceptance
  }, null, 2));
} finally {
  for (const sessionId of sessionIds) {
    await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`session cleanup status ${response.status}: ${sessionId}`))
      .catch((error) => cleanupErrors.push(`session cleanup failed ${sessionId}: ${error.message}`));
  }
  for (const uploadId of uploadIds) {
    await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`upload cleanup status ${response.status}: ${uploadId}`))
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

async function analyzeMultiAngle(label, videos) {
  const packet = await postJson(`${baseUrl}/api/analyze-multi-angle`, {
    session_group_id: `authorized_real_${label}_${Date.now()}`,
    shot_type: "定点投篮",
    user_id: "authorized_real_folder_smoke",
    videos
  });
  const report = await postJson(`${baseUrl}/api/coach-report`, packet);
  return { packet, report };
}

function videoInput(summary, uploadId, cameraView) {
  return {
    upload_id: uploadId,
    file_name: summary.file,
    camera_view: cameraView,
    shot_type: "定点投篮",
    fps: summary.fps || 30,
    video_duration_ms: summary.duration_ms || null,
    dimensions: summary.dimensions || null,
    training_goal: "授权真实样例多角度本地验收",
    evidence_packet: evidenceByFile.get(summary.file)
  };
}

function summarizeSingle(file, cameraView, upload, evidence, coach) {
  return {
    file,
    camera_view: cameraView,
    upload_id: upload.upload_id,
    metadata_status: upload.metadata?.status || null,
    metadata_source: upload.metadata?.source || null,
    fps: Number(upload.metadata?.fps || evidence.session?.fps || 0),
    duration_ms: Number(upload.metadata?.duration_ms || evidence.session?.video_duration_ms || 0),
    dimensions: upload.metadata?.width && upload.metadata?.height
      ? { width: upload.metadata.width, height: upload.metadata.height }
      : null,
    analysis_mode: evidence.session?.analysis_mode,
    max_report_confidence: evidence.confidence?.max_report_confidence,
    overall_confidence: evidence.confidence?.overall,
    pipeline_status: {
      video_layer: evidence.pipeline_status?.video_layer,
      object_detection_layer: evidence.pipeline_status?.object_detection_layer,
      shot_event_layer: evidence.pipeline_status?.shot_event_layer,
      precision_layer: evidence.pipeline_status?.precision_layer,
      metric_layer: evidence.pipeline_status?.metric_layer
    },
    ball_trajectory: {
      status: evidence.ball_trajectory?.status,
      source_contract: evidence.ball_trajectory?.source_contract,
      diagnosis_allowed: evidence.ball_trajectory?.diagnosis_allowed,
      point_count: evidence.ball_trajectory?.trajectory_points?.length || 0,
      failure_reason: evidence.ball_trajectory?.failure_reason || null
    },
    matched_signal_count: evidence.matched_signals?.length || 0,
    candidate_signal_count: (evidence.matched_signals || []).filter((item) => item.status === "candidate").length,
    diagnosis_rule_allowed_count: (evidence.matched_rules || []).filter((item) => item.diagnosis_allowed !== false).length,
    missing_evidence: (evidence.missing_evidence || []).map((item) => `${item.type}:${item.value}`),
    player_report: {
      analysis_status: coach.player_report?.analysis_status,
      confidence: coach.player_report?.confidence,
      next_view: coach.player_report?.next_video_request?.view
    },
    lab_report: {
      evidence_packet_version: coach.lab_report?.evidence_packet_version,
      model_status: coach.lab_report?.model_status,
      adapter_errors: coach.lab_report?.debug_notes?.adapter_errors || []
    }
  };
}

function summarizeMultiAngle({ packet, report }) {
  return {
    schema_version: packet.schema_version,
    view_count: packet.view_count,
    present_views: packet.present_views,
    missing_views: packet.missing_views,
    sync_policy: packet.sync_policy,
    sync_status: packet.sync_assessment?.status,
    sync_precision: packet.sync_assessment?.precision,
    sync_risk_level: packet.sync_assessment?.risk_level,
    view_quality_status: packet.view_quality_assessment?.status,
    view_quality_risks: (packet.view_quality_assessment?.risk_factors || []).map((item) => item.factor_id),
    max_report_confidence: packet.merged?.confidence?.max_report_confidence,
    player_report: {
      analysis_status: report.player_report?.analysis_status,
      next_view: report.player_report?.next_video_request?.view
    },
    lab_report: {
      evidence_packet_version: report.lab_report?.evidence_packet_version,
      camera_view: report.lab_report?.input_context?.camera_view,
      multi_angle_context: Boolean(report.lab_report?.multi_angle_context)
    }
  };
}

function summarizeAlpha(alpha) {
  if (!alpha) {
    return {
      skipped: true,
      reason: "single_only_mode"
    };
  }
  return {
    schema_version: alpha.schema_version,
    status: alpha.status,
    authorization_status: alpha.authorization?.status,
    evidence_schema: alpha.evidence_packet?.schema_version,
    alpha_contract: alpha.evidence_packet?.alpha_test?.schema_version,
    diagnosis_allowed: alpha.evidence_packet?.alpha_test?.diagnosis_allowed,
    max_report_confidence: alpha.evidence_packet?.confidence?.max_report_confidence,
    saved_memory_status: alpha.saved_session?.memory_status,
    long_term_written: alpha.saved_session?.long_term_written,
    boundaries: alpha.boundaries
  };
}

function assessAcceptance({ singleAngle, alpha, multiAngle, modelHealth, privacyBoundary }) {
  const frontSide = multiAngle.front_side;
  const sideBackOnly = multiAngle.side_back_only;
  const lowConfidenceCount = singleAngle.filter((item) => item.max_report_confidence === "low").length;
  const tooShort = singleAngle.filter((item) => item.duration_ms && item.duration_ms < 1500).map((item) => item.file);
  const adapterConfigured = Boolean(modelHealth.yolo?.configured || modelHealth.rtmpose?.configured);
  const adapterHealthy = Boolean(modelHealth.yolo?.ok || modelHealth.rtmpose?.ok);
  return {
    current_acceptance_met: Boolean(
      alpha?.status === "review_only"
      && alpha?.evidence_packet?.alpha_test?.diagnosis_allowed === false
      && frontSide?.schema_version === "multi_angle_evidence_packet.v1"
      && frontSide?.view_quality_status === "metadata_ready"
      && frontSide?.sync_precision === "not_frame_accurate"
      && privacyBoundary?.default_forbidden_uses?.includes("cloud_storage")
    ),
    product_diagnosis_quality_met: false,
    reasons_product_diagnosis_quality_not_met: [
      "These files are local authorized test videos, but the app still treats them as review-only or low-confidence unless stronger pose/ball evidence is available.",
      "The front+side combination is approximate grouping; the files are not proven synchronized recordings of the same shot.",
      "The side_back_candidate input is outside the required front/side pair and should degrade confidence.",
      ...(adapterConfigured && !adapterHealthy ? ["At least one configured model adapter is not healthy; check model health and adapter errors."] : []),
      ...(!adapterConfigured ? ["No local model adapters are configured in the test process; only fallback contracts can run."] : []),
      ...(tooShort.length ? [`Too-short videos under 1.5s: ${tooShort.join(", ")}.`] : [])
    ],
    low_confidence_video_count: lowConfidenceCount,
    too_short_videos: tooShort,
    side_back_degrades_as_expected: Boolean(sideBackOnly?.view_quality_status === "insufficient"),
    front_side_contract_met: Boolean(frontSide?.view_quality_status === "metadata_ready" && frontSide?.sync_precision === "not_frame_accurate"),
    no_cloud_or_training_boundary: Boolean(
      privacyBoundary?.default_forbidden_uses?.includes("cloud_storage")
      && privacyBoundary?.default_forbidden_uses?.includes("model_training")
    )
  };
}

function summarizeModelHealth(modelHealth) {
  return {
    yolo: {
      configured: modelHealth.yolo?.configured,
      ok: modelHealth.yolo?.ok,
      status: modelHealth.yolo?.status,
      missing: modelHealth.yolo?.missing || []
    },
    rtmpose: {
      configured: modelHealth.rtmpose?.configured,
      ok: modelHealth.rtmpose?.ok,
      status: modelHealth.rtmpose?.status,
      missing: modelHealth.rtmpose?.missing || []
    }
  };
}

function inferView(file) {
  if (/front/i.test(file)) return "front";
  if (/side/i.test(file)) return "side";
  return "side_back_candidate";
}

async function startServer(portToUse) {
  const child = spawn(nodeBin, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(portToUse),
      DEEPSEEK_API_KEY: "",
      MODEL_ADAPTER_TIMEOUT_MS: process.env.MODEL_ADAPTER_TIMEOUT_MS || "45000",
      MODEL_HEALTH_TIMEOUT_MS: process.env.MODEL_HEALTH_TIMEOUT_MS || "20000",
      MODEL_METADATA_TIMEOUT_MS: process.env.MODEL_METADATA_TIMEOUT_MS || "15000"
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
    await waitForServer(`http://localhost:${portToUse}`);
    return child;
  } catch (error) {
    child.kill("SIGINT");
    await new Promise((resolve) => child.once("exit", resolve));
    throw error;
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/privacy-boundary`);
      if (response.ok) return;
    } catch {
      // Retry until server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`server did not become ready: ${url}`);
}

async function uploadFile(url, filePath) {
  const bytes = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = ext === ".mov" ? "video/quicktime" : "video/mp4";
  const form = new FormData();
  form.append("video", new Blob([bytes], { type }), path.basename(filePath));
  const response = await fetch(`${url}/api/upload-video`, {
    method: "POST",
    body: form
  });
  if (!response.ok) fail(`upload failed for ${filePath}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) fail(`POST ${url} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`GET ${url} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  throw new Error(`authorized real folder smoke failed: ${message}`);
}
