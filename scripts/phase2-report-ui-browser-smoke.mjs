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

  const beforeSessionIds = new Set((await fetchJson(`${baseUrl}/api/sessions`)).map((session) => session.session_id));

  const launched = await launchChromeWithRetry();
  chromeProcess = launched.chromeProcess;
  userDataDir = launched.userDataDir;
  const version = launched.version;
  cdp = await CdpClient.connect(version.webSocketDebuggerUrl);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__phase2SmokeErrors = [];
      const remember = (value) => window.__phase2SmokeErrors.push(String(value).slice(0, 500));
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

  await waitForCondition(cdp, sessionId, `
    (() => {
      const button = document.querySelector("#loadSampleButton");
      return Boolean(button && !button.disabled && document.querySelector("#sampleSelect")?.value);
    })()
  `, "authorized sample loader ready");

  await evaluateValue(cdp, sessionId, `document.querySelector("#loadSampleButton").click(); "sample-clicked"`);
  await waitForCondition(cdp, sessionId, `document.querySelector("#sampleStatus")?.textContent.includes("已加载")`, "sample loaded");
  await evaluateValue(cdp, sessionId, `document.querySelector("#analyzeButton").click(); "analyze-clicked"`);

  await waitForCondition(cdp, sessionId, `
    (() => {
      const text = document.querySelector("#coachReport")?.innerText || "";
      return text.includes("球员版报告") && text.includes("实验室版摘要");
    })()
  `, "player and lab report sections rendered", 45000);

  const ui = await evaluateJson(cdp, sessionId, `(() => {
    const report = document.querySelector("#coachReport");
    const text = report?.innerText || "";
    const h4s = Array.from(report?.querySelectorAll("h4") || []).map((item) => item.textContent.trim());
    const cards = Array.from(report?.querySelectorAll(".report-evidence div") || []).map((item) => item.innerText.trim());
    const meta = Array.from(report?.querySelectorAll(".report-meta span") || []).map((item) => item.textContent.trim());
    return JSON.stringify({
      title: document.title,
      reportMode: document.querySelector("#reportMode")?.textContent || "",
      diagnosisTitle: document.querySelector("#diagnosisTitle")?.textContent || "",
      sampleStatus: document.querySelector("#sampleStatus")?.textContent || "",
      memoryStatus: document.querySelector("#memoryStatus")?.value || "",
      sections: h4s,
      meta,
      cards,
      text,
      errors: window.__phase2SmokeErrors || []
    });
  })()`);

  assert(ui.title.includes("投篮实验室"), "page title mismatch");
  assert(ui.sampleStatus.includes("已加载"), "authorized sample was not loaded");
  assert(ui.memoryStatus === "short_term_review", "sample should force short_term_review");
  assert(ui.sections.includes("球员版报告"), "player report section missing in browser DOM");
  assert(ui.sections.includes("实验室版摘要"), "lab report section missing in browser DOM");
  assert(ui.sections.includes("Evidence Trace"), "evidence trace section missing in browser DOM");
  assert(ui.text.includes("player_report.v1"), "player_report.v1 not visible");
  assert(ui.text.includes("lab_report.v1"), "lab_report.v1 not visible");
  assert(ui.text.includes("signal_id"), "signal_id trace not visible");
  assert(ui.text.includes("metric_id"), "metric_id trace not visible");
  assert(ui.text.includes("rule_id"), "rule_id trace not visible");
  assert(ui.text.includes("review_only") || ui.text.includes("diagnosable") || ui.text.includes("not_analyzable"), "player analysis status not visible");
  assert(ui.text.includes("missing_evidence"), "player missing_evidence fallback not visible");
  assert(ui.text.includes("模型状态"), "lab model status not visible");
  assert(ui.text.includes("姿态状态"), "lab precision pose status not visible");
  assert(ui.text.includes("缺失证据"), "lab missing evidence count not visible");
  assert(ui.text.includes("adapter_not_configured"), "adapter fallback status not visible");
  assert(!ui.text.includes("undefined"), "report UI rendered undefined");
  assert(!ui.text.includes("null"), "report UI rendered null");
  assert(ui.errors.length === 0, `browser errors: ${ui.errors.join("; ")}`);

  const afterSessions = await fetchJson(`${baseUrl}/api/sessions`);
  const newSessionIds = afterSessions
    .map((session) => session.session_id)
    .filter((id) => !beforeSessionIds.has(id));
  for (const id of newSessionIds) {
    await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then((response) => response.ok || cleanupErrors.push(`session cleanup status ${response.status}: ${id}`))
      .catch((error) => cleanupErrors.push(`session cleanup failed ${id}: ${error.message}`));
  }

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase2_report_ui_browser_smoke.v1",
    source_contract: "browser_dom_report_split_player_lab",
    base_url: baseUrl,
    sample_status: ui.sampleStatus,
    report_mode: ui.reportMode,
    sections: {
      player_report: ui.sections.includes("球员版报告"),
      lab_report: ui.sections.includes("实验室版摘要"),
      evidence_trace: ui.sections.includes("Evidence Trace")
    },
    visible_contracts: {
      player_report_v1: ui.text.includes("player_report.v1"),
      lab_report_v1: ui.text.includes("lab_report.v1"),
      signal_id: ui.text.includes("signal_id"),
      metric_id: ui.text.includes("metric_id"),
      rule_id: ui.text.includes("rule_id"),
      missing_evidence: ui.text.includes("missing_evidence"),
      model_status: ui.text.includes("模型状态"),
      adapter_fallback: ui.text.includes("adapter_not_configured")
    },
    cleanup: {
      new_session_count: newSessionIds.length,
      deleted_session_count: newSessionIds.length - cleanupErrors.length
    }
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
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await onceExit(serverProcess);
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
  child.stderrText = () => stderr;
  child.stderrTail = () => stderr.slice(-2000);
  return child;
}

async function launchChromeWithRetry() {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-phase2-report-ui-"));
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
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase2 report UI browser smoke failed: ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once("exit", resolve);
  });
}
