import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;

const manifest = JSON.parse(await readFile(path.join(root, "data", "sample_manifest.json"), "utf8"));
const sample = manifest.samples?.find((item) => item.id === "synthetic_ball");
if (!sample) fail("synthetic_ball sample missing");

const port = Number(readArg("--port")) || await freePort();
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");
let serverProcess = null;
let uploadId = null;
let sessionId = `authorized_alpha_smoke_${Date.now()}`;
const cleanupErrors = [];

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const upload = await uploadSample(baseUrl, sample);
  uploadId = upload.upload_id;
  assert(upload.upload_id, "upload_id missing");

  const rejected = await postJson(`${baseUrl}/api/authorized-alpha-analysis`, {
    upload_id: upload.upload_id,
    tester_agreement_id: "",
    authorization: {
      local_analysis: true,
      local_acceptance_test: true,
      allow_public_showcase: false,
      allow_external_distribution: false,
      allow_cloud_storage: false,
      allow_model_training: false
    }
  });
  assert(rejected.status === "rejected", "invalid alpha authorization must be rejected");
  assert(rejected.authorization?.errors?.some((item) => item.code === "missing_tester_agreement_id"), "missing agreement error not reported");

  const alpha = await postJson(`${baseUrl}/api/authorized-alpha-analysis`, {
    upload_id: upload.upload_id,
    session_id: sessionId,
    tester_agreement_id: "alpha-smoke-local-agreement",
    file_name: upload.file_name,
    camera_view: sample.camera_view,
    shot_type: sample.shot_type,
    fps: sample.fps || 30,
    training_goal: "Authorized alpha smoke test",
    user_id: "alpha_smoke_user",
    authorization: {
      tester_agreement_id: "alpha-smoke-local-agreement",
      local_analysis: true,
      local_acceptance_test: true,
      allow_public_showcase: false,
      allow_external_distribution: false,
      allow_cloud_storage: false,
      allow_model_training: false
    }
  });

  assert(alpha.schema_version === "authorized_alpha_analysis.v1", "alpha schema mismatch");
  assert(alpha.source_contract === "local_authorized_alpha_test_not_diagnosis", "alpha source contract mismatch");
  assert(alpha.status === "review_only", "alpha status must be review_only");
  assert(alpha.authorization?.status === "accepted_for_local_review_only", "alpha authorization not accepted");
  assert(alpha.boundaries?.includes("short_term_review_only"), "short term boundary missing");
  assert(alpha.boundaries?.includes("no_cloud_storage"), "cloud boundary missing");

  const evidence = alpha.evidence_packet;
  assert(evidence?.schema_version === "evidence_packet.v1", "evidence schema mismatch");
  assert(evidence.alpha_test?.schema_version === "authorized_alpha_test.v1", "alpha evidence contract missing");
  assert(evidence.alpha_test?.diagnosis_allowed === false, "alpha evidence must not allow diagnosis");
  assert(evidence.video_context?.source_type === "authorized_alpha_test_local_upload", "alpha source type mismatch");
  assert(evidence.confidence?.max_report_confidence === "low", "alpha must remain low confidence");
  assert(evidence.confidence?.degradation_reasons?.includes("authorized_alpha_test_review_only"), "alpha degradation reason missing");
  assert(evidence.pipeline_status?.alpha_test_layer === "authorized_local_review_only", "alpha pipeline layer missing");

  const coach = alpha.coach_report;
  assert(coach?.player_report?.schema_version === "player_report.v1", "player report missing");
  assert(coach?.lab_report?.schema_version === "lab_report.v1", "lab report missing");
  assert(alpha.saved_session?.memory_status === "short_term_review", "alpha session must stay short_term_review");
  assert(alpha.saved_session?.long_term_written === false, "alpha session must not write long-term memory");

  const privacy = await fetchJson(`${baseUrl}/api/privacy-export?user_id=alpha_smoke_user`);
  assert(privacy.storage?.raw_video_bytes === "excluded", "privacy export must exclude raw video bytes");
  assert(privacy.storage?.cloud_sync === "not_implemented", "cloud sync boundary mismatch");
  assert(privacy.upload_inventory?.files?.some((file) => file.upload_id === upload.upload_id), "alpha upload missing from privacy inventory");

  const [html, main] = await Promise.all([
    readFile(path.join(root, "app", "index.html"), "utf8"),
    readFile(path.join(root, "app", "main.js"), "utf8")
  ]);
  for (const needle of ["Alpha 授权测试", "alphaAgreementId", "alphaLocalAuthorization", "runAlphaTestButton"]) {
    assert(html.includes(needle), `frontend alpha DOM missing: ${needle}`);
  }
  for (const needle of [
    "initAlphaTestControls();",
    "/api/authorized-alpha-analysis",
    "not_for_player_diagnosis",
    "short_term_review"
  ]) {
    assert(main.includes(needle), `frontend alpha binding missing: ${needle}`);
  }

  console.log(JSON.stringify({
    ok: true,
    schema_version: "authorized_alpha_analysis_smoke.v1",
    source_contract: "local_authorized_alpha_test_not_diagnosis",
    upload: {
      upload_id: upload.upload_id,
      metadata_status: upload.metadata?.status || null
    },
    rejected: {
      status: rejected.status,
      error_count: rejected.authorization?.errors?.length || 0
    },
    alpha: {
      status: alpha.status,
      evidence_schema: evidence.schema_version,
      max_report_confidence: evidence.confidence.max_report_confidence,
      alpha_contract: evidence.alpha_test.schema_version,
      diagnosis_allowed: evidence.alpha_test.diagnosis_allowed
    },
    saved: {
      memory_status: alpha.saved_session.memory_status,
      long_term_written: alpha.saved_session.long_term_written
    },
    privacy: {
      raw_video_bytes: privacy.storage.raw_video_bytes,
      cloud_sync: privacy.storage.cloud_sync,
      upload_inventory_count: privacy.upload_inventory.count
    },
    boundaries: alpha.boundaries
  }, null, 2));
} finally {
  if (sessionId) {
    await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`session cleanup status ${response.status}`))
      .catch((error) => cleanupErrors.push(`session cleanup failed: ${error.message}`));
  }
  if (uploadId) {
    await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`upload cleanup status ${response.status}`))
      .catch((error) => cleanupErrors.push(`upload cleanup failed: ${error.message}`));
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

async function startServer(portToUse) {
  const child = spawn(nodeBin, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(portToUse),
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
      // Retry until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`server did not become ready: ${url}`);
}

async function uploadSample(url, sampleItem) {
  const bytes = await readFile(path.join(root, sampleItem.file_path));
  const form = new FormData();
  form.append("video", new Blob([bytes], { type: "video/mp4" }), path.basename(sampleItem.file_path));
  const response = await fetch(`${url}/api/upload-video`, {
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

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`authorized alpha analysis smoke failed: ${message}`);
}
