import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    const client = new CdpClient(socket);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return client;
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(`${message.error.message}: ${message.error.data || ""}`));
    else pending.resolve(message.result || {});
  }

  close() {
    this.socket.close();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const chromeBin = readArg("--chrome-bin") || process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(readArg("--port")) || await freePort();
const debugPort = Number(readArg("--debug-port") || 0);
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");

const manifest = JSON.parse(await readFile(path.join(root, "data", "sample_manifest.json"), "utf8"));
const sampleId = readArg("--sample-id") || "synthetic_ball";
const sample = manifest.samples?.find((item) => item.id === sampleId);
if (!sample) fail(`sample not found in data/sample_manifest.json: ${sampleId}`);
if (sample.authorization?.status !== "authorized") fail(`sample is not authorized: ${sampleId}`);
if (!sample.authorization?.scope?.includes("local_acceptance_test")) {
  fail(`sample is not authorized for local_acceptance_test: ${sampleId}`);
}

let serverProcess = null;
let chromeProcess = null;
let userDataDir = null;
let cdp = null;
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
  const reusableSideEvidence = await analyzeSingleAngle(baseUrl, sample, videoInput(sideUpload.upload_id, "side", sample));
  const reusedPrimary = await analyzeMultiAngle(baseUrl, sample, [
    {
      ...videoInput(sideUpload.upload_id, "side", sample),
      evidence_packet: reusableSideEvidence
    },
    videoInput(frontUpload.upload_id, "front", sample)
  ]);
  const both = await analyzeMultiAngle(baseUrl, sample, [
    videoInput(sideUpload.upload_id, "side", sample),
    videoInput(frontUpload.upload_id, "front", sample)
  ]);
  assert(
    reusedPrimary.views?.side?.session_id === reusableSideEvidence.session_id,
    "multi-angle API did not preserve reused primary evidence packet"
  );

  const launched = await launchChromeWithRetry();
  chromeProcess = launched.chromeProcess;
  userDataDir = launched.userDataDir;
  cdp = await CdpClient.connect(launched.version.webSocketDebuggerUrl);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__phase4UiSmokeErrors = [];
      const remember = (value) => window.__phase4UiSmokeErrors.push(String(value).slice(0, 500));
      const originalError = console.error;
      console.error = (...args) => {
        remember(args.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" "));
        originalError.apply(console, args);
      };
      window.addEventListener("error", (event) => remember(event.message || "window error"));
      window.addEventListener("unhandledrejection", (event) => remember(event.reason?.message || event.reason || "unhandled rejection"));
    `
  }, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  }, sessionId);
  await cdp.send("Page.navigate", { url: baseUrl }, sessionId);
  await waitForPageReady(cdp, sessionId);
  await waitForCondition(cdp, sessionId, `Boolean(window.__shootingLabTestHooks?.renderMultiAngleEvidence)`, "multi-angle test hook ready");

  const renderedBoth = await renderPacket(cdp, sessionId, "both", both);
  const renderedSideOnly = await renderPacket(cdp, sessionId, "side_only", sideOnly);

  assert(renderedBoth.status === "multi_angle_evidence_packet.v1", "both: status schema not visible");
  assert(renderedBoth.text.includes("front + side"), "both: present views not visible");
  assert(renderedBoth.text.includes("Metric Views"), "both: metric view summary missing");
  assert(renderedBoth.text.includes("Signal Views"), "both: signal view summary missing");
  assert(renderedBoth.text.includes("Rule Views"), "both: rule view summary missing");
  assert(renderedBoth.text.includes("同步评估"), "both: sync assessment section missing");
  assert(renderedBoth.text.includes("sync_assessment.v1"), "both: sync assessment schema missing");
  assert(renderedBoth.text.includes("视角质量评估"), "both: view quality section missing");
  assert(renderedBoth.text.includes("view_quality_assessment.v1"), "both: view quality schema missing");
  assert(renderedBoth.text.includes("metadata_and_evidence_context_only_not_real_frame_quality"), "both: view quality boundary missing");
  assert(renderedBoth.text.includes("view_quality_front_side_metadata_ready"), "both: view quality metadata-ready factor missing");
  assert(renderedBoth.text.includes("not_frame_accurate"), "both: not-frame-accurate copy missing");
  assert(renderedBoth.text.includes("no_shared_clock"), "both: no shared clock reason missing");
  assert(renderedBoth.text.includes("同步风险"), "both: sync risk section missing");
  assert(renderedBoth.text.includes("no_sync_marker"), "both: no sync marker risk missing");
  assert(renderedBoth.text.includes("front_side_present_but_approximate"), "both: front+side approximate risk missing");
  assert(renderedBoth.text.includes("拍手"), "both: sync retake guidance missing");
  assert(renderedBoth.text.includes("视角证据清单"), "both: view evidence table missing");
  assert(renderedBoth.text.includes("关键指标来源"), "both: metric source audit missing");
  assert(renderedBoth.text.includes("approximate session grouping"), "both: approximate sync copy missing");
  assert(renderedBoth.text.includes("仍未做精确关键帧同步"), "both: no precise sync boundary missing");
  assert(renderedBoth.row_count >= 4, `both: expected multi-angle rows, got ${renderedBoth.row_count}`);

  assert(renderedSideOnly.text.includes("side"), "side-only: side view not visible");
  assert(renderedSideOnly.text.includes("front 视角缺失"), "side-only: missing front copy not visible");
  assert(renderedSideOnly.text.includes("视角缺失影响"), "side-only: missing-view impact section missing");
  assert(renderedSideOnly.text.includes("missing_front_view"), "side-only: sync missing front reason not visible");
  assert(renderedSideOnly.text.includes("view_quality_assessment.v1"), "side-only: view quality schema missing");
  assert(renderedSideOnly.text.includes("view_quality_missing_front"), "side-only: view quality missing front not visible");
  assert(renderedSideOnly.text.includes("同步风险"), "side-only: sync risk section missing");
  assert(renderedSideOnly.text.includes("missing_front_view"), "side-only: missing front risk not visible");
  assert(renderedSideOnly.text.includes("正面和侧面两个视角"), "side-only: sync retake guidance missing");
  assert(renderedSideOnly.text.includes("missing"), "side-only: missing count not visible");

  for (const item of [renderedBoth, renderedSideOnly]) {
    assert(!item.text.includes("undefined"), "UI rendered undefined");
    assert(!item.text.includes("null"), "UI rendered null");
    assert(!item.text.includes("precise_sync_complete"), "UI must not claim precise sync");
    assert(item.errors.length === 0, `browser errors: ${item.errors.join("; ")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase4_multi_angle_ui_smoke.v1",
    source_contract: "browser_dom_multi_angle_audit_visibility",
    viewport: { width: 390, height: 844 },
    sample_id: sample.id,
    both: summarizeRendered(renderedBoth, both),
    side_only: summarizeRendered(renderedSideOnly, sideOnly),
    reused_primary: {
      reused_session_id: reusedPrimary.views?.side?.session_id,
      original_session_id: reusableSideEvidence.session_id,
      preserved: reusedPrimary.views?.side?.session_id === reusableSideEvidence.session_id
    },
    boundaries: [
      "approximate_grouping_only_no_precise_sync",
      "sync_assessment_not_frame_accurate",
      "view_quality_metadata_only",
      "primary_evidence_packet_reuse_no_duplicate_primary_adapter_run",
      "synthetic_sample_only_no_real_multi_angle_quality"
    ]
  }, null, 2));
} finally {
  if (cdp) cdp.close();
  if (chromeProcess) {
    chromeProcess.kill("SIGTERM");
    await onceExit(chromeProcess);
  }
  if (userDataDir) {
    await rm(userDataDir, { recursive: true, force: true });
  }
  for (const uploadId of uploadIds) {
    if (!uploadId) continue;
    await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" })
      .then((response) => response.ok || cleanupErrors.push(`upload cleanup status ${response.status}: ${uploadId}`))
      .catch((error) => cleanupErrors.push(`upload cleanup failed ${uploadId}: ${error.message}`));
  }
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await onceExit(serverProcess);
  }
  if (cleanupErrors.length) {
    console.error(`cleanup warnings: ${cleanupErrors.join("; ")}`);
    process.exitCode = process.exitCode || 1;
  }
}

async function renderPacket(client, sessionId, name, packet) {
  await evaluateValue(client, sessionId, `
    window.__phase4Packet = ${JSON.stringify(packet)};
    window.__shootingLabTestHooks.renderMultiAngleEvidence(window.__phase4Packet);
    "${name}";
  `);
  await waitForCondition(client, sessionId, `
    document.querySelector("#multiAngleCard")?.innerText.includes("Session Group")
  `, `${name} multi-angle card rendered`);
  return evaluateJson(client, sessionId, `(() => {
    const card = document.querySelector("#multiAngleCard");
    return JSON.stringify({
      status: document.querySelector("#multiAngleStatus")?.textContent || "",
      text: card?.innerText || "",
      row_count: card?.querySelectorAll(".multi-angle-row").length || 0,
      section_count: card?.querySelectorAll("h4").length || 0,
      errors: window.__phase4UiSmokeErrors || []
    });
  })()`);
}

function summarizeRendered(rendered, packet) {
  return {
    status: rendered.status,
    present_views: packet.present_views,
    missing_views: packet.missing_views,
    row_count: rendered.row_count,
    section_count: rendered.section_count,
    sync_policy: packet.sync_policy,
    sync_assessment: {
      schema_version: packet.sync_assessment?.schema_version,
      status: packet.sync_assessment?.status,
      precision: packet.sync_assessment?.precision,
      risk_level: packet.sync_assessment?.risk_level,
      risk_factor_count: packet.sync_assessment?.risk_factors?.length || 0
    },
    view_quality_assessment: {
      schema_version: packet.view_quality_assessment?.schema_version,
      status: packet.view_quality_assessment?.status,
      risk_factor_count: packet.view_quality_assessment?.risk_factors?.length || 0
    }
  };
}

async function analyzeMultiAngle(url, sampleToUse, videos) {
  return postJson(`${url}/api/analyze-multi-angle`, {
    session_group_id: `phase4_ui_smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    shot_type: sampleToUse.shot_type,
    videos
  });
}

async function analyzeSingleAngle(url, sampleToUse, video) {
  return postJson(`${url}/api/analyze-video`, {
    ...video,
    user_id: "local_user_001",
    dominant_hand: "right",
    video_duration_ms: sampleToUse.duration_ms || 2400,
    observed_fps: sampleToUse.fps || 30,
    upload_metadata: {
      width: sampleToUse.width || 640,
      height: sampleToUse.height || 360,
      fps: sampleToUse.fps || 30,
      duration_ms: sampleToUse.duration_ms || 2400
    }
  });
}

function videoInput(uploadId, cameraView, sampleToUse) {
  return {
    upload_id: uploadId,
    file_name: `${cameraView}_${path.basename(sampleToUse.file_path)}`,
    camera_view: cameraView,
    shot_type: sampleToUse.shot_type,
    fps: sampleToUse.fps || 60,
    training_goal: "Phase 4 multi-angle UI smoke"
  };
}

async function uploadSample(url, sampleToUse) {
  const filePath = path.join(root, sampleToUse.file_path);
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("video", new Blob([bytes], { type: "video/mp4" }), path.basename(sampleToUse.file_path));
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
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.json();
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
    await onceExit(child);
    throw error;
  }
}

function startChrome(portToUse, profileDir) {
  const child = spawn(chromeBin, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${portToUse}`,
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.outputText = () => `${stdout}\n${stderr}`;
  child.stderrTail = () => stderr.slice(-2000);
  return child;
}

async function launchChromeWithRetry() {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-phase4-multi-angle-ui-"));
    const portToUse = debugPort || await freePort();
    const child = startChrome(portToUse, profileDir);
    try {
      const version = await waitForChrome(portToUse, child);
      return { chromeProcess: child, userDataDir: profileDir, version };
    } catch (error) {
      lastError = error;
      child.kill("SIGTERM");
      await onceExit(child);
      await rm(profileDir, { recursive: true, force: true });
      await sleep(1000);
    }
  }
  throw lastError;
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/privacy-boundary`);
      if (response.ok) return;
    } catch {
      // Retry until ready.
    }
    await sleep(250);
  }
  fail(`server did not become ready: ${url}`);
}

async function waitForChrome(portToUse, child) {
  const endpoint = `http://127.0.0.1:${portToUse}/json/version`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      fail(`Chrome exited before DevTools was ready: code=${child.exitCode}, signal=${child.signalCode}, stderr=${child.stderrTail?.() || ""}`);
    }
    if (!portToUse) {
      const match = child.outputText?.().match(/ws:\/\/[^\s]+/);
      if (match) return { webSocketDebuggerUrl: match[0] };
      await sleep(250);
      continue;
    }
    try {
      const response = await fetch(endpoint);
      if (response.ok) return response.json();
    } catch {
      // Retry until ready.
    }
    await sleep(250);
  }
  fail(`Chrome DevTools did not become ready: ${endpoint}; stderr=${child.stderrTail?.() || ""}`);
}

async function waitForPageReady(client, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await evaluateValue(client, sessionId, "document.readyState !== 'loading' && Boolean(document.querySelector('.workspace'))");
    if (ready) {
      await sleep(750);
      return;
    }
    await sleep(250);
  }
  fail("page did not become DOM-ready");
}

async function waitForCondition(client, sessionId, expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluateValue(client, sessionId, expression)) return;
    await sleep(250);
  }
  fail(`timed out waiting for ${label}`);
}

async function evaluateJson(client, sessionId, expression) {
  return JSON.parse(await evaluateValue(client, sessionId, expression));
}

async function evaluateValue(client, sessionId, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  }, sessionId);
  if (result.exceptionDetails) {
    fail(`browser evaluation failed: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const foundPort = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return foundPort;
}

function readArg(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return "";
}

function onceExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(`phase4 multi-angle UI smoke failed: ${message}`);
}

function fail(message) {
  throw new Error(`phase4 multi-angle UI smoke failed: ${message}`);
}
