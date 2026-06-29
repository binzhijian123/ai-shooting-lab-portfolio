import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
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
  const version = launched.version;
  cdp = await CdpClient.connect(version.webSocketDebuggerUrl);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__phase5SmokeErrors = [];
      const remember = (value) => window.__phase5SmokeErrors.push(String(value).slice(0, 500));
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
      return Boolean(button && !button.disabled && document.querySelector("#sampleSelect")?.value && window.__shootingLabTestHooks);
    })()
  `, "sample loader and local test hooks ready");

  await evaluateValue(cdp, sessionId, `document.querySelector("#loadSampleButton").click(); "sample-clicked"`);
  await waitForCondition(cdp, sessionId, `
    (() => {
      const video = document.querySelector("#shotVideo");
      return document.querySelector("#sampleStatus")?.textContent.includes("已加载") && video?.videoWidth > 0 && video?.videoHeight > 0;
    })()
  `, "sample video metadata ready", 30000);

  const goodEvidence = buildSyntheticEvidence("good");
  const partialEvidence = buildSyntheticEvidence("partial");
  const lowScoreEvidence = buildSyntheticEvidence("low_score");
  await evaluateValue(cdp, sessionId, `
    window.__phase5GoodEvidence = ${JSON.stringify(goodEvidence)};
    window.__phase5PartialEvidence = ${JSON.stringify(partialEvidence)};
    window.__phase5LowScoreEvidence = ${JSON.stringify(lowScoreEvidence)};
    window.__shootingLabTestHooks.renderEvidence(window.__phase5GoodEvidence);
    window.__shootingLabTestHooks.drawPrecisionPoseAtTime(0);
    "good-rendered";
  `);
  const goodAtStart = await canvasStats(cdp, sessionId);
  const frameExport = await evaluateJson(cdp, sessionId, `
    JSON.stringify(window.__shootingLabTestHooks.exportAnnotatedFrame({ download: false, includeDataUrl: true }))
  `);
  const reviewStats = await evaluateJson(cdp, sessionId, `
    (() => {
      window.__shootingLabTestHooks.addAnnotatedFrameReview(${JSON.stringify(frameExport)});
      const review = document.querySelector("#annotatedFrameReview");
      const img = review?.querySelector("img");
      return JSON.stringify({
        thumb_count: review?.querySelectorAll(".annotated-frame-thumb").length || 0,
        has_png_thumb: Boolean(img?.src?.startsWith("data:image/png;base64,")),
        text: review?.innerText || "",
        image_width: img?.naturalWidth || 0,
        image_height: img?.naturalHeight || 0
      });
    })()
  `);
  await waitForCondition(cdp, sessionId, `
    (() => {
      const img = document.querySelector("#annotatedFrameReview img");
      return Boolean(img?.src?.startsWith("data:image/png;base64,") && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    })()
  `, "annotated frame review thumbnail decode");
  const decodedReviewStats = await evaluateJson(cdp, sessionId, `
    (() => {
      const review = document.querySelector("#annotatedFrameReview");
      const img = review?.querySelector("img");
      return JSON.stringify({
        thumb_count: review?.querySelectorAll(".annotated-frame-thumb").length || 0,
        has_png_thumb: Boolean(img?.src?.startsWith("data:image/png;base64,")),
        text: review?.innerText || "",
        image_width: img?.naturalWidth || 0,
        image_height: img?.naturalHeight || 0
      });
    })()
  `);

  await evaluateValue(cdp, sessionId, `window.__shootingLabTestHooks.drawPrecisionPoseAtTime(2200); "seek-rendered";`);
  const goodAtSeek = await canvasStats(cdp, sessionId);

  await evaluateValue(cdp, sessionId, `
    window.__shootingLabTestHooks.renderEvidence(window.__phase5PartialEvidence);
    window.__shootingLabTestHooks.drawPrecisionPoseAtTime(0);
    "partial-rendered";
  `);
  const partialOverlay = await canvasStats(cdp, sessionId);

  await evaluateValue(cdp, sessionId, `
    window.__shootingLabTestHooks.renderEvidence(window.__phase5LowScoreEvidence);
    window.__shootingLabTestHooks.drawPrecisionPoseAtTime(0);
    "low-rendered";
  `);
  const lowScore = await canvasStats(cdp, sessionId);

  assert(goodAtStart.canvas.width > 0 && goodAtStart.canvas.height > 0, "canvas has no size");
  assert(goodAtStart.non_transparent_pixels > 500, `good frame canvas appears blank: ${goodAtStart.non_transparent_pixels}`);
  assert(goodAtStart.coach_color_pixels > 120, `coach line color pixels too low: ${goodAtStart.coach_color_pixels}`);
  assert(goodAtStart.trajectory_color_pixels > 80, `release motion pixels too low: ${goodAtStart.trajectory_color_pixels}`);
  assert(goodAtStart.pose_status.includes("条教练线"), `good pose status missing coach line count: ${goodAtStart.pose_status}`);
  assert(goodAtStart.pose_status.includes("阶段：投篮窗口开始"), `good pose status missing start phase: ${goodAtStart.pose_status}`);
  assert(goodAtStart.pose_status.includes("出手切片点"), `good pose status missing release motion overlay count: ${goodAtStart.pose_status}`);
  assert(goodAtStart.overlay_diagnostics_status === "rtmpose_precision_pose", `overlay diagnostics status mismatch: ${goodAtStart.overlay_diagnostics_status}`);
  assert(goodAtStart.overlay_diagnostics_text.includes("coach_overlay_diagnostics.v1"), "overlay diagnostics schema missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("source_check_only_not_real_sample_readability"), "overlay diagnostics source boundary missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("rtmpose_precision_pose"), "overlay diagnostics pose source missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("phase_source=evidence_keyframes_not_classifier"), "overlay diagnostics phase boundary missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("human_pose_motion_slice_only_no_airborne_ball_tracking"), "overlay diagnostics release-motion boundary missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("local_browser_png_current_frame_no_video_export"), "overlay diagnostics export boundary missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("not_real_sample_readability"), "overlay diagnostics real sample boundary missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("real_authorized_sample_readability_checklist.v1"), "readability checklist schema missing");
  assert(goodAtStart.overlay_diagnostics_text.includes("不证明真实样例诊断质量"), "readability checklist diagnosis boundary missing");
  assert(goodAtStart.readability_status === "synthetic_overlay_visible_not_real_readability", `good readability status mismatch: ${goodAtStart.readability_status}`);
  assert(goodAtStart.overlay_diagnostics_text.includes("manual_review_gate_not_quality_claim"), "readability quality-claim guard missing");
  assert(frameExport.schema_version === "annotated_frame_export.v1", `frame export schema mismatch: ${frameExport.schema_version}`);
  assert(frameExport.source_contract === "local_browser_png_current_frame_no_video_export", `frame export source contract mismatch: ${frameExport.source_contract}`);
  assert(frameExport.data_url_prefix === "data:image/png;base64,", `frame export did not create png data url: ${frameExport.data_url_prefix}`);
  assert(frameExport.data_url_length > 1000, `frame export png data too small: ${frameExport.data_url_length}`);
  assert(frameExport.width === goodAtStart.canvas.width && frameExport.height === goodAtStart.canvas.height, "frame export dimensions must match overlay canvas");
  assert(frameExport.includes_video_frame && frameExport.includes_overlay_canvas, "frame export must combine video and overlay canvas");
  assert(frameExport.download_triggered === false, "browser smoke must not trigger a download");
  assert(reviewStats.thumb_count === 1, `annotated frame review thumb count mismatch: ${reviewStats.thumb_count}`);
  assert(reviewStats.has_png_thumb === true, "annotated frame review did not render a png thumbnail");
  assert(decodedReviewStats.image_width > 0 && decodedReviewStats.image_height > 0, "annotated frame review image did not decode");
  assert(reviewStats.text.includes("仅保存在当前浏览器内存"), "annotated frame review local-memory boundary copy missing");
  assert(reviewStats.text.includes("no video export"), "annotated frame review no-video-export copy missing");
  assert(goodAtSeek.pose_status.includes("阶段："), `seek pose status missing phase: ${goodAtSeek.pose_status}`);
  assert(goodAtSeek.pose_status !== goodAtStart.pose_status, `seek pose status did not change phase: ${goodAtSeek.pose_status}`);
  assert(goodAtSeek.pose_status.includes("出手切片点"), `seek pose status missing release motion overlay: ${goodAtSeek.pose_status}`);
  assert(partialOverlay.non_transparent_pixels > 100, "partial frame should still render some overlay pixels");
  assert(partialOverlay.coach_color_pixels > 0, "partial frame should draw partial coach-line pixels");
  assert(partialOverlay.coach_color_pixels < goodAtStart.coach_color_pixels, `partial coach pixels should be lower than full overlay: ${partialOverlay.coach_color_pixels} vs ${goodAtStart.coach_color_pixels}`);
  assert(partialOverlay.pose_status.includes("条教练线"), `partial pose status missing coach line count: ${partialOverlay.pose_status}`);
  assert(partialOverlay.readability_status === "partial_overlay_seek_another_frame", `partial readability status mismatch: ${partialOverlay.readability_status}`);
  assert(partialOverlay.overlay_diagnostics_text.includes("partial_overlay_seek_another_frame"), "partial overlay diagnostics missing readability guard");
  assert(lowScore.non_transparent_pixels > 100, "low-score frame should still show skeleton fallback pixels");
  assert(lowScore.coach_color_pixels < Math.max(20, goodAtStart.coach_color_pixels * 0.25), `low-score coach pixels did not drop enough: ${lowScore.coach_color_pixels} vs ${goodAtStart.coach_color_pixels}`);
  assert(lowScore.pose_status.includes("不绘制教练线"), `low-score pose status missing guard copy: ${lowScore.pose_status}`);
  assert(lowScore.overlay_diagnostics_text.includes("score<0.2"), `low-score overlay diagnostics missing score guard: ${lowScore.overlay_diagnostics_text}`);
  assert(lowScore.readability_status === "no_pose_evidence_for_readability", `low-score readability status mismatch: ${lowScore.readability_status}`);
  assert(goodAtStart.errors.length === 0, `browser errors: ${goodAtStart.errors.join("; ")}`);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase5_browser_visual_smoke.v1",
    source_contract: "browser_canvas_visual_check_synthetic_keypoints_and_release_motion",
    viewport: {
      width: goodAtStart.inner_width,
      height: goodAtStart.inner_height
    },
    canvas: goodAtStart.canvas,
    good_frame: {
      non_transparent_pixels: goodAtStart.non_transparent_pixels,
      coach_color_pixels: goodAtStart.coach_color_pixels,
      release_motion_color_pixels: goodAtStart.trajectory_color_pixels,
      pose_status: goodAtStart.pose_status,
      overlay_diagnostics_status: goodAtStart.overlay_diagnostics_status,
      overlay_diagnostics_contract: "coach_overlay_diagnostics.v1",
      readability_status: goodAtStart.readability_status
    },
    frame_export: {
      schema_version: frameExport.schema_version,
      source_contract: frameExport.source_contract,
      width: frameExport.width,
      height: frameExport.height,
      data_url_length: frameExport.data_url_length,
      includes_video_frame: frameExport.includes_video_frame,
      includes_overlay_canvas: frameExport.includes_overlay_canvas
    },
    annotated_frame_review: {
      thumb_count: reviewStats.thumb_count,
      has_png_thumb: reviewStats.has_png_thumb,
      image_width: decodedReviewStats.image_width,
      image_height: decodedReviewStats.image_height,
      storage_boundary: "browser_memory_only"
    },
    seek_frame: {
      coach_color_pixels: goodAtSeek.coach_color_pixels,
      release_motion_color_pixels: goodAtSeek.trajectory_color_pixels,
      pose_status: goodAtSeek.pose_status
    },
    partial_overlay_frame: {
      non_transparent_pixels: partialOverlay.non_transparent_pixels,
      coach_color_pixels: partialOverlay.coach_color_pixels,
      pose_status: partialOverlay.pose_status,
      readability_status: partialOverlay.readability_status
    },
    low_score_frame: {
      non_transparent_pixels: lowScore.non_transparent_pixels,
      coach_color_pixels: lowScore.coach_color_pixels,
      pose_status: lowScore.pose_status,
      overlay_diagnostics_status: lowScore.overlay_diagnostics_status,
      readability_status: lowScore.readability_status
    },
    boundaries: [
      "not_real_sample_readability",
      "not_validated_action_phase_classifier",
      "local_png_frame_only",
      "local_review_preview_only",
      "real_authorized_readability_checklist_only",
      "not_exported_annotated_video"
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

function buildSyntheticEvidence(kind) {
  const keypointScore = kind === "low_score" ? 0.1 : 0.92;
  const keypointMode = kind === "partial" ? "partial" : "full";
  return buildEvidencePacket({
    shot_type: "phase5_browser_visual_smoke",
    camera_view: "side",
    fps: 30,
    video_duration_ms: 2400,
    file_name: `phase5_${kind}.mp4`,
    model_adapter_outputs: {
      object_detection: kind === "good" ? syntheticObjectDetection() : { status: "adapter_not_configured" },
      precision_pose: {
        status: "provided_by_adapter",
        fps: 30,
        image_width: 640,
        image_height: 360,
        frame_count: 72,
        sampling_policy: "phase5 synthetic deterministic keypoints",
        pose_series: [
          poseFrame(0, 0, keypointScore, 0, keypointMode),
          poseFrame(30, 1000, keypointScore, kind === "low_score" ? 0 : 18, keypointMode),
          poseFrame(60, 2000, keypointScore, kind === "low_score" ? 0 : -12, keypointMode)
        ]
      }
    },
    model_health: {
      yolo: { configured: false, status: "adapter_not_configured" },
      rtmpose: { configured: true, status: "synthetic_fixture" }
    }
  }, knowledgeBase);
}

function syntheticObjectDetection() {
  return {
    status: "provided_by_adapter",
    trajectory: {
      ball_points: [
        trajectoryPoint(10, 178, 302, 0.58),
        trajectoryPoint(12, 228, 238, 0.57),
        trajectoryPoint(14, 288, 184, 0.56),
        trajectoryPoint(16, 352, 150, 0.55)
      ],
      rim_reference: { frame: 18, box: [420, 108, 484, 148], confidence: 0.72 }
    },
    shot_summary: { status: "provided_by_yolo_heuristics", attempts: 1, made: 0, missed: 0, confidence: 0.56 },
    shot_events: [
      {
        event_id: "phase5_candidate_trajectory",
        release_frame: 10,
        rim_cross_frame: 16,
        release_angle_deg: 45,
        ball_path_offset_cm: 7,
        judgement: "made",
        confidence: 0.56,
        basis: "phase5 browser visual synthetic fixture"
      }
    ]
  };
}

function trajectoryPoint(frame, x, y, confidence) {
  return {
    frame,
    time_ms: Math.round((frame / 30) * 1000),
    x,
    y,
    confidence
  };
}

function poseFrame(frame, timeMs, score, offset, mode = "full") {
  return {
    frame,
    time_ms: timeMs,
    keypoints: mode === "partial" ? partialCocoKeypoints(score, offset) : cocoKeypoints(score, offset)
  };
}

function cocoKeypoints(score, offset = 0) {
  const points = Array.from({ length: 17 }, () => [0, 0, 0]);
  points[5] = [260, 106 + offset, score];
  points[6] = [342, 110 + offset, score];
  points[7] = [238, 166 + offset, score];
  points[8] = [366, 172 + offset, score];
  points[9] = [218, 220 + offset, score];
  points[10] = [388, 228 + offset, score];
  points[11] = [278, 220 + offset, score];
  points[12] = [332, 222 + offset, score];
  points[13] = [270, 286 + offset, score];
  points[14] = [346, 286 + offset, score];
  points[15] = [262, 342 + offset, score];
  points[16] = [360, 344 + offset, score];
  return points;
}

function partialCocoKeypoints(score, offset = 0) {
  const points = Array.from({ length: 17 }, () => [0, 0, 0]);
  points[6] = [342, 110 + offset, score];
  points[8] = [366, 172 + offset, score];
  points[10] = [388, 228 + offset, score];
  return points;
}

async function canvasStats(client, sessionId) {
  return evaluateJson(client, sessionId, `(() => {
    const canvas = document.querySelector("#poseCanvas");
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparent = 0;
    let coachColor = 0;
    let trajectoryColor = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 12) nonTransparent += 1;
      const cyan = r < 90 && g > 165 && b > 180;
      const yellow = r > 190 && g > 145 && b < 110;
      const purple = r > 120 && b > 170 && g < 170;
      const pink = r > 190 && g < 150 && b > 120 && b < 190;
      const white = r > 235 && g > 235 && b > 235;
      if (a > 40 && (cyan || yellow || purple || pink || white)) coachColor += 1;
      const rimOrange = r > 220 && g > 80 && g < 170 && b < 90;
      const markerBlue = r < 100 && g > 145 && b > 180;
      if (a > 40 && (rimOrange || markerBlue)) trajectoryColor += 1;
    }
    return JSON.stringify({
      inner_width: innerWidth,
      inner_height: innerHeight,
      canvas: { width: canvas.width, height: canvas.height },
      non_transparent_pixels: nonTransparent,
      coach_color_pixels: coachColor,
      trajectory_color_pixels: trajectoryColor,
      pose_status: document.querySelector("#poseStatus")?.textContent || "",
      overlay_diagnostics_status: document.querySelector("#overlayDiagnosticsStatus")?.textContent || "",
      overlay_diagnostics_text: document.querySelector("#overlayDiagnostics")?.innerText || "",
      readability_status: document.querySelector("[data-readability-status]")?.getAttribute("data-readability-status") || "",
      errors: window.__phase5SmokeErrors || []
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
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-phase5-browser-visual-"));
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
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase5 browser visual smoke failed: ${message}`);
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
