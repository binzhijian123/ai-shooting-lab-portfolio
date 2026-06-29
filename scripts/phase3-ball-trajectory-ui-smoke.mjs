import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvidencePacket } from "../server/visionPipeline.mjs";

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
const knowledgeBase = JSON.parse(await readFile(
  path.join(root, "distillation", "douyin-shooting-coach", "outputs", "knowledge_base.json"),
  "utf8"
));

let serverProcess = null;
let chromeProcess = null;
let userDataDir = null;
let cdp = null;

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

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
      window.__phase3UiSmokeErrors = [];
      const remember = (value) => window.__phase3UiSmokeErrors.push(String(value).slice(0, 500));
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
      return Boolean(button && !button.disabled && document.querySelector("#sampleSelect")?.value && window.__shootingLabTestHooks?.renderEvidence);
    })()
  `, "sample loader and local test hook ready");
  await evaluateValue(cdp, sessionId, `document.querySelector("#loadSampleButton").click(); "sample-clicked"`);
  await waitForCondition(cdp, sessionId, `
    (() => {
      const video = document.querySelector("#shotVideo");
      return document.querySelector("#sampleStatus")?.textContent.includes("已加载") && video?.videoWidth > 0 && video?.videoHeight > 0;
    })()
  `, "sample video metadata ready", 30000);

  const evidences = {
    adapter_error: buildEvidence("adapter_error", {
      status: "adapter_error",
      error: "synthetic yolo failure"
    }),
    camera_view_not_suitable: buildEvidence("camera_view_not_suitable", {
      status: "provided_by_adapter",
      trajectory: {
        ball_points: [
          point(10, 200, 360, 0.74),
          point(11, 216, 345, 0.72),
          point(12, 230, 332, 0.7)
        ],
        rim_reference: { frame: 20, box: [900, 250, 980, 315], confidence: 0.7 },
        failure_reasons: [
          {
            reason: "camera_view_not_suitable",
            message: "Front-like view cannot support reliable depth trajectory."
          }
        ]
      },
      shot_summary: { status: "insufficient_evidence", confidence: 0.38 }
    }),
    ball_occluded_by_body: buildEvidence("ball_occluded_by_body", {
      status: "provided_by_adapter",
      trajectory: {
        ball_points: [
          point(10, 210, 356, 0.48),
          point(11, 220, 332, 0.44),
          point(12, 231, 310, 0.4)
        ],
        rim_reference: { frame: 20, box: [900, 250, 980, 315], confidence: 0.7 },
        failure_reasons: ["ball_occluded_by_body"]
      },
      shot_summary: { status: "insufficient_evidence", confidence: 0.34 }
    }),
    tracked_candidate_make: buildEvidence("tracked_candidate_make", {
      status: "provided_by_adapter",
      trajectory: {
        ball_points: [
          point(10, 200, 360, 0.88),
          point(11, 215, 330, 0.86),
          point(12, 235, 300, 0.84),
          point(13, 260, 275, 0.82)
        ],
        rim_reference: { frame: 20, box: [900, 250, 980, 315], confidence: 0.72 }
      },
      shot_summary: { status: "provided_by_yolo_heuristics", attempts: 1, made: 1, missed: 0, confidence: 0.68 },
      shot_events: [
        {
          event_id: "shot_candidate_1",
          release_frame: 10,
          rim_cross_frame: 20,
          release_angle_deg: 46,
          ball_path_offset_cm: 8,
          judgement: "made",
          confidence: 0.68,
          basis: "synthetic browser DOM fixture"
        }
      ]
    })
  };

  const rendered = {};
  for (const [name, evidence] of Object.entries(evidences)) {
    rendered[name] = await renderScenario(cdp, sessionId, name, evidence);
  }

  for (const item of Object.values(rendered)) {
    assert(item.status.length > 0, "release motion status not visible");
    assert(item.text.includes("出手动作切片"), "release motion card title missing");
    assert(item.text.includes("手腕路径点"), "release motion wrist path count missing");
    assert(item.text.includes("起球/下肢时序"), "release motion timing metric missing");
    assert(item.text.includes("不追踪空中球路"), "release motion no-airborne-ball boundary missing");
    assert(item.text.includes("human_pose_motion_slice_only_no_airborne_ball_tracking"), "release motion interpretation policy missing");
    assert(item.text.includes("不直接支撑动作诊断"), "diagnosis disallowance copy missing");
    assert(!item.text.includes("候选球路点"), "frontend should not show airborne ball trajectory points");
    assert(!item.html.includes("trajectory-preview"), "frontend should not render trajectory preview");
    assert(!item.text.includes("undefined"), "UI rendered undefined");
    assert(!item.text.includes("null"), "UI rendered null");
    assert(item.errors.length === 0, `browser errors: ${item.errors.join("; ")}`);
  }
  assert(rendered.tracked_candidate_make.overlay.non_transparent_pixels > 300, `release motion overlay appears blank: ${rendered.tracked_candidate_make.overlay.non_transparent_pixels}`);
  assert(rendered.tracked_candidate_make.overlay.release_motion_color_pixels > 40, `release motion overlay pixels too low: ${rendered.tracked_candidate_make.overlay.release_motion_color_pixels}`);
  assert(rendered.tracked_candidate_make.overlay.pose_status.includes("出手切片"), `release motion overlay status missing: ${rendered.tracked_candidate_make.overlay.pose_status}`);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase3_ball_trajectory_ui_smoke.v1",
    source_contract: "browser_dom_release_motion_card_and_canvas_no_airborne_ball_overlay",
    viewport: { width: 390, height: 844 },
    scenarios: Object.fromEntries(Object.entries(rendered).map(([name, item]) => [name, {
      status: item.status,
      release_motion_card: true,
      card_text_length: item.text.length,
      overlay: {
        non_transparent_pixels: item.overlay.non_transparent_pixels,
        release_motion_color_pixels: item.overlay.release_motion_color_pixels,
        pose_status: item.overlay.pose_status
      }
    }])),
    boundaries: [
      "frontend_airborne_ball_path_removed",
      "release_motion_overlay_active",
      "human_pose_motion_slice_only_no_airborne_ball_tracking",
      "diagnosis_allowed_false",
      "synthetic_evidence_only_no_real_video_readability"
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
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await onceExit(serverProcess);
  }
}

function buildEvidence(name, objectDetection) {
  return buildEvidencePacket({
    shot_type: "phase3_browser_dom_smoke",
    camera_view: "side_back_candidate",
    fps: 60,
    video_duration_ms: 1600,
    file_name: `${name}.mp4`,
    model_adapter_outputs: {
      object_detection: objectDetection,
      precision_pose: { status: "adapter_not_configured" }
    },
    model_health: {
      yolo: { configured: false, status: "adapter_not_configured" },
      rtmpose: { configured: false, status: "adapter_not_configured" }
    }
  }, knowledgeBase);
}

function point(frame, x, y, confidence = 0.8) {
  return {
    frame,
    time_ms: Math.round((frame / 60) * 1000),
    x,
    y,
    confidence
  };
}

async function renderScenario(client, sessionId, name, evidence) {
  await evaluateValue(client, sessionId, `
    window.__phase3UiEvidence = ${JSON.stringify(evidence)};
    window.__shootingLabTestHooks.renderEvidence(window.__phase3UiEvidence);
    window.__shootingLabTestHooks.drawPrecisionPoseAtTime(167);
    "${name}";
  `);
  await waitForCondition(client, sessionId, `
    document.querySelector("#releaseMotionCard")?.innerText.includes("human_pose_motion_slice_only_no_airborne_ball_tracking")
  `, `${name} release motion card rendered`);
  const card = await evaluateJson(client, sessionId, `(() => {
    const card = document.querySelector("#releaseMotionCard");
    return JSON.stringify({
      status: document.querySelector("#releaseMotionStatus")?.textContent || "",
      text: card?.innerText || "",
      html: card?.innerHTML || "",
      errors: window.__phase3UiSmokeErrors || []
    });
  })()`);
  return {
    ...card,
    overlay: await canvasStats(client, sessionId)
  };
}

async function canvasStats(client, sessionId) {
  return evaluateJson(client, sessionId, `(() => {
    const canvas = document.querySelector("#poseCanvas");
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparent = 0;
    let releaseMotionColor = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 12) nonTransparent += 1;
      const green = r > 70 && r < 145 && g > 190 && b > 80 && b < 160;
      const orange = r > 220 && g > 80 && g < 170 && b < 90;
      const yellow = r > 210 && g > 165 && b < 90;
      const blue = r < 100 && g > 150 && b > 180;
      const white = r > 235 && g > 235 && b > 235;
      if (a > 35 && (green || orange || yellow || blue || white)) releaseMotionColor += 1;
    }
    return JSON.stringify({
      canvas: { width: canvas.width, height: canvas.height },
      non_transparent_pixels: nonTransparent,
      release_motion_color_pixels: releaseMotionColor,
      pose_status: document.querySelector("#poseStatus")?.textContent || ""
    });
  })()`);
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
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-phase3-ball-ui-"));
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
  if (!condition) throw new Error(`phase3 ball trajectory UI smoke failed: ${message}`);
}

function fail(message) {
  throw new Error(`phase3 ball trajectory UI smoke failed: ${message}`);
}
