import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;

const port = Number(readArg("--port")) || await freePort();
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");
let serverProcess = null;

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const samples = await fetchJson(`${baseUrl}/api/samples`);
  assert(samples.schema_version === "sample_list.v1", "sample list schema mismatch");
  const sample = samples.samples?.find((item) => item.id === "synthetic_ball");
  assert(sample, "synthetic_ball missing from /api/samples");
  assert(sample.authorization?.status === "authorized", "sample authorization missing");
  assert(sample.authorization?.scope?.includes("local_acceptance_test"), "sample local_acceptance_test scope missing");
  assert(sample.video_url === "/api/sample-videos/synthetic_ball", "sample video_url mismatch");
  assert(sample.fps === 30, "sample fps baseline mismatch");
  assert(sample.duration_ms === 2400, "sample duration baseline mismatch");
  assert(sample.dimensions?.width === 640 && sample.dimensions?.height === 360, "sample dimensions baseline mismatch");

  const rangeResponse = await fetch(`${baseUrl}${sample.video_url}`, {
    headers: { range: "bytes=0-31" }
  });
  assert(rangeResponse.status === 206, `sample video range status ${rangeResponse.status}`);
  assert(rangeResponse.headers.get("content-type")?.startsWith("video/"), "sample video content-type mismatch");
  assert((await rangeResponse.arrayBuffer()).byteLength === 32, "sample video range length mismatch");
  const suffixRangeResponse = await fetch(`${baseUrl}${sample.video_url}`, {
    headers: { range: "bytes=-16" }
  });
  assert(suffixRangeResponse.status === 206, `sample video suffix range status ${suffixRangeResponse.status}`);
  assert((await suffixRangeResponse.arrayBuffer()).byteLength === 16, "sample video suffix range length mismatch");
  assert(/bytes \d+-\d+\/\d+/.test(suffixRangeResponse.headers.get("content-range") || ""), "sample suffix content-range mismatch");
  const openEndedRangeResponse = await fetch(`${baseUrl}${sample.video_url}`, {
    headers: { range: "bytes=32-" }
  });
  assert(openEndedRangeResponse.status === 206, `sample video open-ended range status ${openEndedRangeResponse.status}`);
  const openEndedContentRange = openEndedRangeResponse.headers.get("content-range") || "";
  const openEndedLength = Number(openEndedRangeResponse.headers.get("content-length") || 0);
  assert(openEndedContentRange.startsWith("bytes 32-"), `sample open-ended content-range mismatch: ${openEndedContentRange}`);
  assert(openEndedLength > 32, `sample open-ended content-length too small: ${openEndedLength}`);
  assert((await openEndedRangeResponse.arrayBuffer()).byteLength === openEndedLength, "sample open-ended range length mismatch");
  const invalidRangeResponse = await fetch(`${baseUrl}${sample.video_url}`, {
    headers: { range: "bytes=999999999-1000000000" }
  });
  assert(invalidRangeResponse.status === 416, `sample video invalid range status ${invalidRangeResponse.status}`);
  assert(invalidRangeResponse.headers.get("accept-ranges") === "bytes", "sample invalid range accept-ranges mismatch");
  assert(/^bytes \*\/\d+$/.test(invalidRangeResponse.headers.get("content-range") || ""), "sample invalid content-range mismatch");

  const evidence = await postJson(`${baseUrl}/api/analyze-video`, {
    sample_id: sample.id,
    file_name: sample.file_name,
    camera_view: sample.camera_view,
    shot_type: sample.shot_type,
    training_goal: "Phase 1 sample UI smoke",
    dominant_hand: "right",
    fps: sample.fps || null,
    video_duration_ms: 1200,
    pose_samples: [],
    browser_pose_diagnostics: {
      engine: "sample_ui_smoke",
      runtime: "script",
      called: false,
      failure_reason: "not_a_browser_pose_test"
    }
  });
  assert(evidence.schema_version === "evidence_packet.v1", "evidence schema mismatch");
  assert(evidence.video_context?.sample_id === sample.id, "evidence sample_id missing");
  assert(evidence.video_context?.source_type === "synthetic", "evidence sample source_type mismatch");
  assert(evidence.session?.fps === 30, "evidence sample fps mismatch");
  assert(evidence.pipeline_status?.video_layer === "local_authorized_sample_ready", "sample video layer mismatch");
  assert(evidence.pipeline_status?.object_detection_layer === "adapter_not_configured", "smoke should not require YOLO adapter");
  assert(evidence.confidence?.max_report_confidence === "low", "sample smoke must remain low confidence");

  const coach = await postJson(`${baseUrl}/api/coach-report`, evidence);
  assert(coach.player_report?.schema_version === "player_report.v1", "player report missing");
  assert(coach.lab_report?.schema_version === "lab_report.v1", "lab report missing");

  const [html, main] = await Promise.all([
    readFile(path.join(root, "app", "index.html"), "utf8"),
    readFile(path.join(root, "app", "main.js"), "utf8")
  ]);
  for (const needle of ["sampleSelect", "loadSampleButton", "sampleStatus", "inputContractWarnings"]) {
    assert(html.includes(needle), `frontend sample control missing: ${needle}`);
  }
  for (const needle of [
    "/api/samples",
    "loadSelectedSample",
    "sample_id",
    "local_acceptance_test",
    "setSelectValue(\"memoryStatus\", \"short_term_review\")",
    "updateInputContractWarnings",
    "buildInputContractRows",
    "不是 Phase 4 最小 front/side 输入",
    "时序/同步优先 60fps",
    "少于 1500ms"
  ]) {
    assert(main.includes(needle), `frontend sample binding missing: ${needle}`);
  }

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase1_sample_ui_smoke.v1",
    sample_id: sample.id,
    sample_source_type: sample.source_type,
    sample_video: {
      fps: sample.fps,
      duration_ms: sample.duration_ms,
      dimensions: sample.dimensions
    },
    video_range_status: rangeResponse.status,
    suffix_range_status: suffixRangeResponse.status,
    open_ended_range_status: openEndedRangeResponse.status,
    invalid_range_status: invalidRangeResponse.status,
    invalid_range_accept_ranges: invalidRangeResponse.headers.get("accept-ranges"),
    evidence: {
      schema_version: evidence.schema_version,
      video_layer: evidence.pipeline_status.video_layer,
      max_report_confidence: evidence.confidence.max_report_confidence,
      object_detection_layer: evidence.pipeline_status.object_detection_layer,
      sample_id: evidence.video_context.sample_id
    },
    report_contracts: {
      player_report: coach.player_report.schema_version,
      lab_report: coach.lab_report.schema_version
    },
    frontend_bindings: {
      sample_select: true,
      load_sample_button: true,
      sample_status: true,
      input_contract_warnings: true
    }
  }, null, 2));
} finally {
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`GET ${url} failed with ${response.status}: ${await response.text()}`);
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
  throw new Error(`phase1 sample UI smoke failed: ${message}`);
}
