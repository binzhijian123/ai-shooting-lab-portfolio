import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
const userId = `phase6_ui_smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const sessionIds = [
  `${userId}_long_1`,
  `${userId}_long_2`,
  `${userId}_review_1`
];

let serverProcess = null;
let chromeProcess = null;
let userDataDir = null;
let cdp = null;
const cleanupErrors = [];

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  await saveSession(baseUrl, sessionIds[0], makeEvidence({
    userId,
    sessionId: sessionIds[0],
    memoryStatus: "long_term",
    timingMs: 220,
    trunkDeg: 7,
    confidence: 0.86
  }), "long_term");
  await sleep(20);
  await saveSession(baseUrl, sessionIds[1], makeEvidence({
    userId,
    sessionId: sessionIds[1],
    memoryStatus: "long_term",
    timingMs: 120,
    trunkDeg: 4,
    confidence: 0.88
  }), "long_term");
  await sleep(20);
  await saveSession(baseUrl, sessionIds[2], makeEvidence({
    userId,
    sessionId: sessionIds[2],
    memoryStatus: "short_term_review",
    timingMs: 999,
    trunkDeg: 18,
    confidence: 0.42,
    signalStatus: "low_confidence"
  }), "short_term_review");

  const memory = await fetchJson(`${baseUrl}/api/memory-summary?user_id=${encodeURIComponent(userId)}`);
  assert(memory.long_term_session_count === 2, "expected two long-term sessions");
  assert(memory.review_session_count === 1, "expected one review session");
  assert(JSON.stringify(memory.trend?.values) === JSON.stringify([220, 120]), "review session must be excluded from trend values");

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
      window.__phase6UiSmokeErrors = [];
      const remember = (value) => window.__phase6UiSmokeErrors.push(String(value).slice(0, 500));
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
  await waitForCondition(cdp, sessionId, `Boolean(window.__shootingLabTestHooks?.renderMemorySummary)`, "memory summary test hook ready");

  await evaluateValue(cdp, sessionId, `
    window.__phase6Memory = ${JSON.stringify(memory)};
    window.__shootingLabTestHooks.renderMemorySummary(window.__phase6Memory);
    "memory-rendered";
  `);
  await waitForCondition(cdp, sessionId, `
    document.querySelector("#memoryDetails")?.innerText.includes("${userId}")
  `, "memory details rendered");

  const ui = await evaluateJson(cdp, sessionId, `(() => {
    const details = document.querySelector("#memoryDetails");
    const chart = document.querySelector("#memoryChart");
    return JSON.stringify({
      count: document.querySelector("#memoryCount")?.textContent || "",
      summary: document.querySelector("#memorySummary")?.textContent || "",
      details: details?.innerText || "",
      chart_bar_count: chart?.querySelectorAll("div").length || 0,
      pill_count: details?.querySelectorAll(".memory-pill").length || 0,
      errors: window.__phase6UiSmokeErrors || []
    });
  })()`);

  assert(ui.count.includes("2 long-term / 1 review"), `memory count mismatch: ${ui.count}`);
  assert(ui.summary.includes("improving"), `trend direction not visible: ${ui.summary}`);
  assert(ui.summary.includes("-100"), `trend delta not visible: ${ui.summary}`);
  assert(ui.details.includes(userId), "local user id not visible");
  assert(ui.details.includes("local_sqlite"), "local sqlite storage not visible");
  assert(ui.details.includes("Phase 6 trend smoke"), "primary training goal not visible");
  assert(ui.details.includes("long_term_only"), "trend source not visible");
  assert(ui.details.includes("review excluded: 1"), "review exclusion not visible");
  assert(ui.details.includes("起球-下肢启动时序"), "recurring signal not visible");
  assert(ui.chart_bar_count === 2, `trend chart should show only long-term values: ${ui.chart_bar_count}`);
  assert(ui.pill_count >= 2, `expected training goal and signal pills, got ${ui.pill_count}`);
  assert(ui.errors.length === 0, `browser errors: ${ui.errors.join("; ")}`);

  const deleteResults = [];
  for (const id of [...sessionIds]) {
    deleteResults.push(await deleteSession(baseUrl, id));
    sessionIds.shift();
  }
  const afterDelete = await fetchJson(`${baseUrl}/api/memory-summary?user_id=${encodeURIComponent(userId)}`);
  assert(afterDelete.session_count === 0, `expected cleanup to remove test sessions, got ${afterDelete.session_count}`);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase6_memory_ui_smoke.v1",
    source_contract: "browser_dom_memory_card_local_sqlite_visibility",
    viewport: { width: 390, height: 844 },
    user_id: userId,
    memory: {
      long_term_session_count: memory.long_term_session_count,
      review_session_count: memory.review_session_count,
      trend_source: memory.confidence_policy.trend_source,
      review_sessions_excluded: memory.confidence_policy.review_sessions_excluded,
      trend_values: memory.trend.values,
      trend_delta_ms: memory.trend.delta_ms,
      trend_direction: memory.trend.direction
    },
    ui: {
      chart_bar_count: ui.chart_bar_count,
      pill_count: ui.pill_count,
      count_text: ui.count
    },
    cleanup: {
      deleted_count: deleteResults.filter((item) => item.ok).length,
      after_delete_session_count: afterDelete.session_count
    },
    boundaries: [
      "local_sqlite_only_no_account",
      "short_term_review_excluded_from_trend",
      "synthetic_sessions_deleted"
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
  for (const sessionId of sessionIds) {
    if (!sessionId) continue;
    await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`session cleanup status ${response.status}: ${sessionId}`))
      .catch((error) => cleanupErrors.push(`session cleanup failed ${sessionId}: ${error.message}`));
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

async function saveSession(url, sessionId, evidence, memoryStatus) {
  return postJson(`${url}/api/sessions`, {
    session_id: sessionId,
    title: `Phase 6 memory UI smoke ${memoryStatus}`,
    evidence,
    report: {
      summary: "Phase 6 memory UI smoke report",
      primary_diagnosis: {
        title: "Phase 6 memory UI smoke",
        confidence: evidence.confidence.max_report_confidence,
        evidence: []
      }
    },
    memory_status: memoryStatus,
    feedback: {
      shot_result: "synthetic",
      coach_helpfulness: "smoke_test",
      note: "Generated by scripts/phase6-memory-ui-smoke.mjs"
    }
  });
}

function makeEvidence({ userId, sessionId, memoryStatus, timingMs, trunkDeg, confidence, signalStatus = "candidate" }) {
  return {
    schema_version: "evidence_packet.v1",
    session_id: sessionId,
    user_profile: {
      user_id: userId,
      goal: "Phase 6 trend smoke"
    },
    session: {
      shot_type: "phase6_memory_ui_smoke",
      camera_view: "side",
      fps: 60,
      analysis_mode: "synthetic_memory_ui_contract",
      video_duration_ms: 1000
    },
    video_context: {
      file_name: `${sessionId}.mp4`,
      camera_view: "side",
      fps: 60
    },
    metrics: {
      ball_lift_knee_delta_ms: timingMs,
      trunk_lean_release_deg: trunkDeg
    },
    matched_signals: [
      {
        signal_id: "coordination.ball_lift_lower_body_timing",
        name: "起球-下肢启动时序",
        status: signalStatus,
        confidence,
        frame: 128,
        evidence_metric_ids: ["ball_lift_knee_delta_ms"]
      }
    ],
    confidence: {
      overall: confidence,
      max_report_confidence: confidence >= 0.82 ? "high" : confidence >= 0.65 ? "medium" : "low"
    },
    pipeline_status: {
      memory_layer: "sqlite_sessions"
    },
    memory_status: memoryStatus
  };
}

async function deleteSession(url, sessionId) {
  const response = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!response.ok) fail(`delete failed: ${sessionId} ${response.status} ${await response.text()}`);
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
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-phase6-memory-ui-"));
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

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`GET ${url} failed with ${response.status}: ${await response.text()}`);
  return response.json();
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
  if (!condition) throw new Error(`phase6 memory UI smoke failed: ${message}`);
}

function fail(message) {
  throw new Error(`phase6 memory UI smoke failed: ${message}`);
}
