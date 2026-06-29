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
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${message.error.message}: ${message.error.data || ""}`));
    } else {
      pending.resolve(message.result || {});
    }
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
const arcLab = process.argv.includes("--arc-lab");
const pageUrl = new URL(arcLab ? "/arc-lab.html" : "/", baseUrl).toString();

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
      window.__mobileSmokeErrors = [];
      const remember = (value) => window.__mobileSmokeErrors.push(String(value).slice(0, 500));
      const originalError = console.error;
      console.error = (...args) => {
        remember(args.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" "));
        originalError.apply(console, args);
      };
      window.addEventListener("error", (event) => remember(event.message || "window error"));
      window.addEventListener("unhandledrejection", (event) => remember(event.reason?.message || event.reason || "unhandled rejection"));
    `
  }, sessionId);
  await applyMobileMetrics(cdp, sessionId);
  await cdp.send("Page.navigate", { url: pageUrl }, sessionId);
  await waitForPageReady(cdp, sessionId, arcLab);
  await applyMobileMetrics(cdp, sessionId);
  await sleep(500);

  const layout = arcLab
    ? await evaluateJson(cdp, sessionId, `(() => {
      const qs = (selector) => document.querySelector(selector);
      const columnCount = (value) => value.trim() ? value.trim().split(/\\s+/).length : 0;
      const styles = (selector) => {
        const element = qs(selector);
        if (!element) return null;
        const computed = getComputedStyle(element);
        return {
          display: computed.display,
          gridTemplateColumns: computed.gridTemplateColumns,
          columnCount: columnCount(computed.gridTemplateColumns),
          aspectRatio: computed.aspectRatio
        };
      };
      return JSON.stringify({
        title: document.title,
        innerWidth,
        innerHeight,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        hasHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth + 1,
        wideElements: Array.from(document.querySelectorAll("body *")).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || "",
            className: typeof element.className === "string" ? element.className : "",
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth || 0,
            text: (element.textContent || "").trim().slice(0, 80)
          };
        }).filter((item) => item.width > 390 || item.scrollWidth > 390).sort((a, b) => Math.max(b.width, b.scrollWidth) - Math.max(a.width, a.scrollWidth)).slice(0, 8),
        poster: styles("#posterStage"),
        coach: styles("#coach"),
        student: styles("#student"),
        trend: styles("#trend"),
        trendGrid: styles(".trend-grid"),
        analysisLabFrame: styles(".analysis-lab-frame"),
        visible: {
          posterStage: Boolean(qs("#posterStage .poster-frame")),
          posterEntrances: Array.from(document.querySelectorAll("#posterStage .poster-cta")).map((link) => link.textContent.trim()),
          portalMode: document.body.classList.contains("portal-mode"),
          topbarHidden: !qs(".topbar") || getComputedStyle(qs(".topbar")).display === "none",
          localDemoRemoved: !qs("#demoFlowButton") && !document.body.textContent.includes("一键跑通本地演示"),
          coachInitiallyHidden: getComputedStyle(qs("#coach")).display === "none",
          studentInitiallyHidden: getComputedStyle(qs("#student")).display === "none"
        },
        errors: window.__mobileSmokeErrors || []
      });
    })()`)
    : await evaluateJson(cdp, sessionId, `(() => {
    const qs = (selector) => document.querySelector(selector);
    const columnCount = (value) => value.trim() ? value.trim().split(/\\s+/).length : 0;
    const styles = (selector) => {
      const element = qs(selector);
      if (!element) return null;
      const computed = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: computed.display,
        gridTemplateColumns: computed.gridTemplateColumns,
        columnCount: columnCount(computed.gridTemplateColumns),
        gridColumnStart: computed.gridColumnStart,
        gridRowStart: computed.gridRowStart,
        aspectRatio: computed.aspectRatio,
        minHeight: computed.minHeight,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    return JSON.stringify({
      title: document.title,
      url: location.href,
      innerWidth,
      innerHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      hasHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth + 1,
      wideElements: Array.from(document.querySelectorAll("body *")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || "",
          className: typeof element.className === "string" ? element.className : "",
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth || 0,
          text: (element.textContent || "").trim().slice(0, 80)
        };
      }).filter((item) => item.width > 390 || item.scrollWidth > 390).sort((a, b) => Math.max(b.width, b.scrollWidth) - Math.max(a.width, a.scrollWidth)).slice(0, 8),
      workspace: styles(".workspace"),
      sideRail: styles(".side-rail"),
      evidencePanel: styles(".evidence-panel"),
      videoStage: styles(".video-stage"),
      keyframes: styles(".keyframes"),
      errors: window.__mobileSmokeErrors || []
    });
    })()`);

  assert(layout.title.includes(arcLab ? "Arc Lab" : "投篮实验室"), "page title mismatch");
  assert(layout.innerWidth === 390, `viewport width mismatch: ${layout.innerWidth}; wide=${JSON.stringify(layout.wideElements)}`);
  assert(layout.hasHorizontalOverflow === false, `horizontal overflow: scrollWidth=${layout.scrollWidth}, clientWidth=${layout.clientWidth}`);
  if (arcLab) {
    assert(layout.visible.posterStage, "poster stage missing");
    assert(layout.visible.portalMode, "Arc Lab should start as poster portal");
    assert(layout.visible.topbarHidden, "developer topbar should be hidden");
    assert(layout.visible.localDemoRemoved, "local demo entry should be removed");
    assert(layout.visible.coachInitiallyHidden, "coach workbench should be hidden before entrance click");
    assert(layout.visible.studentInitiallyHidden, "student workbench should be hidden before entrance click");
    assert(layout.visible.posterEntrances.includes("教练端"), "coach entrance missing");
    assert(layout.visible.posterEntrances.includes("学生端"), "student entrance missing");
    const coachLayout = await enterArcLabSection(cdp, sessionId, "#coach");
    assert(coachLayout.visible.coachLogin, "coach login missing after coach entrance");
    assert(coachLayout.posterVisible === false, "poster should be removed after coach entrance");
    assert(coachLayout.coach?.columnCount === 1, `coach home is not single-column: ${coachLayout.coach?.gridTemplateColumns}`);
    assert(coachLayout.tabbarLabels.join("/") === "首页/复盘/学生/趋势", `coach tabbar labels mismatch: ${coachLayout.tabbarLabels.join("/")}`);
    const coachReviewLayout = await createArcLabReviewFixture(cdp, sessionId);
    assert(coachReviewLayout.visible.analysisLabEmbed, "analysis lab embed missing in coach review tab");
    assert(coachReviewLayout.analysisLab?.embeddedMode, "analysis lab iframe is not in embedded review mode");
    assert(coachReviewLayout.analysisLab?.primaryUpload, "analysis lab primary upload missing");
    assert(coachReviewLayout.analysisLab?.pairedUpload, "analysis lab paired upload missing");
    assert(coachReviewLayout.analysisLab?.analyzeButton, "analysis lab analyze button missing");
    assert(coachReviewLayout.analysisLab?.videoReplay, "analysis lab video replay missing");
    assert(coachReviewLayout.analysisLab?.exportFrameButton, "analysis lab annotated-frame export missing");
    assert(coachReviewLayout.analysisLab?.keyframes, "analysis lab keyframes missing");
    assert(coachReviewLayout.analysisLab?.topbarHidden, "embedded analysis lab topbar should be hidden");
    assert(coachReviewLayout.visible.reviewPublish, "review publish missing in coach review tab");
    const coachTrendLayout = await switchArcLabTab(cdp, sessionId, "coach", "trend");
    assert(coachTrendLayout.trend?.columnCount === 1, `coach trend is not single-column: ${coachTrendLayout.trend?.gridTemplateColumns}`);
    assert(coachTrendLayout.visible.coachTrend && !coachTrendLayout.visible.studentTrend, "coach trend tab should show coach trend only");
    const studentLayout = await enterArcLabSection(cdp, sessionId, "#student");
    assert(studentLayout.visible.knowledgeSearch, "student entrance should open public local RAG search");
    assert(studentLayout.visible.knowledgeAssistantVisible, "knowledge assistant should be visible without token");
    assert(studentLayout.posterVisible === false, "poster should be removed after student entrance");
    assert(studentLayout.student?.columnCount === 1, `student knowledge is not single-column: ${studentLayout.student?.gridTemplateColumns}`);
    assert(studentLayout.tabbarLabels.join("/") === "首页/训练/知识/进步", `student tabbar labels mismatch: ${studentLayout.tabbarLabels.join("/")}`);
    const studentHomeLayout = await switchArcLabTab(cdp, sessionId, "student", "home");
    assert(studentHomeLayout.visible.studentBind, "student bind missing in student home tab");
    assert(studentHomeLayout.visible.studentHomeAnalysisLabEmbed, "student published lesson analysis lab embed missing");
    assert(studentHomeLayout.analysisLab?.embeddedMode, "student home analysis lab iframe is not in embedded mode");
    assert(studentHomeLayout.analysisLab?.videoReplay, "student home analysis lab replay missing");
    assert(studentHomeLayout.analysisLab?.exportFrameButton, "student home analysis lab annotated-frame export missing");
    assert(studentHomeLayout.analysisLab?.keyframes, "student home analysis lab keyframes missing");
    const studentTrainingLayout = await switchArcLabTab(cdp, sessionId, "student", "training");
    assert(studentTrainingLayout.visible.studentTrainingAnalysisLabEmbed, "student homework analysis lab embed missing in training tab");
    assert(studentTrainingLayout.analysisLab?.embeddedMode, "student training analysis lab iframe is not in embedded mode");
    assert(studentTrainingLayout.analysisLab?.primaryUpload, "student training analysis lab primary upload missing");
    assert(studentTrainingLayout.analysisLab?.pairedUpload, "student training analysis lab paired upload missing");
    assert(studentTrainingLayout.analysisLab?.analyzeButton, "student training analysis lab analyze button missing");
    assert(studentTrainingLayout.visible.trainingPlan, "training plan missing in training tab");
    const studentKnowledgeLayout = await switchArcLabTab(cdp, sessionId, "student", "knowledge");
    assert(studentKnowledgeLayout.visible.knowledgeSearch, "public local RAG search missing in knowledge tab");
    assert(studentKnowledgeLayout.visible.knowledgeAssistantVisible, "knowledge assistant should be visible without token");
    const studentProgressLayout = await switchArcLabTab(cdp, sessionId, "student", "progress");
    assert(studentProgressLayout.visible.studentTrend && !studentProgressLayout.visible.coachTrend, "student progress tab should show student trend only");
    assert(coachLayout.visible.manualMetricFieldsHidden, "manual metric fields should stay hidden");
    assert(coachLayout.visible.backendBoundariesHidden, "backend boundary cards should stay hidden");
  } else {
    assert(layout.workspace?.columnCount === 1, `workspace is not single-column: ${layout.workspace?.gridTemplateColumns}`);
    if (layout.sideRail) {
      assert(layout.sideRail.gridColumnStart === "1", `side rail grid column is ${layout.sideRail.gridColumnStart}`);
      assert(["auto", "1"].includes(layout.sideRail.gridRowStart), `side rail grid row is ${layout.sideRail.gridRowStart}`);
    }
    assert(layout.evidencePanel?.columnCount === 1, `evidence panel is not single-column: ${layout.evidencePanel?.gridTemplateColumns}`);
    assert(layout.keyframes?.columnCount === 1, `keyframes are not single-column: ${layout.keyframes?.gridTemplateColumns}`);
    assert(layout.videoStage?.aspectRatio === "16 / 9", `video stage aspect ratio is ${layout.videoStage?.aspectRatio}`);
  }
  assert(layout.errors.length === 0, `browser errors: ${layout.errors.join("; ")}`);
  console.log(JSON.stringify({
    ok: true,
    schema_version: arcLab ? "arc_lab_mobile_browser_smoke.v1" : "mobile_browser_smoke.v1",
    source_contract: arcLab
      ? "chrome_headless_390x844_arc_lab_coach_student_mobile_shell"
      : "chrome_headless_390x844_layout_baseline",
    base_url: pageUrl,
    viewport: {
      width: layout.innerWidth,
      height: layout.innerHeight,
      client_width: layout.clientWidth,
      scroll_width: layout.scrollWidth,
      horizontal_overflow: layout.hasHorizontalOverflow
    },
    checks: arcLab
	      ? {
	          poster_present: true,
	          coach_single_column: true,
	          student_single_column: true,
          trend_single_column: true,
          trend_grid_single_column: true,
          coach_and_student_video_areas_use_full_analysis_lab_embed: true,
          analysis_lab_embed_features: [
            "primary_upload",
            "paired_upload",
            "video_replay",
            "analyze_report",
            "annotated_frame_export",
            "keyframes"
          ],
          poster_portal_visible: layout.visible,
          browser_errors: layout.errors.length
        }
      : {
          workspace_single_column: true,
          side_rail_single_column: layout.sideRail ? true : "not_present_current_lab_layout",
          evidence_single_column: true,
          keyframes_single_column: true,
          video_aspect_ratio: layout.videoStage.aspectRatio,
          browser_errors: layout.errors.length
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
}

async function enterArcLabSection(client, sessionId, hash) {
  await client.send("Page.navigate", { url: pageUrl }, sessionId);
  await waitForPageReady(client, sessionId, true);
  await sleep(500);
  await evaluateJson(client, sessionId, `(() => {
    document.querySelector(\`#posterStage .poster-cta[href="${hash}"]\`)?.click();
    return JSON.stringify({ clicked: true });
  })()`);
  await sleep(1300);
  return readArcLabWorkbench(client, sessionId);
}

async function createArcLabReviewFixture(client, sessionId) {
  await submitArcLabForm(client, sessionId, "#coachLoginForm", 'document.querySelector("#identityStatus")?.textContent.includes("教练已登录")');
  await submitArcLabForm(client, sessionId, "#athleteForm", 'document.querySelector("#lessonUploadForm input[name=athlete_id]")?.value');
  await switchArcLabTab(client, sessionId, "coach", "review");
  await waitForCondition(client, sessionId, '(() => { const frame = document.querySelector(".analysis-lab-frame"); return Boolean(frame?.contentDocument?.querySelector("#videoInput") && frame.contentDocument.querySelector("#pairedVideoInput") && frame.contentDocument.querySelector("#analyzeButton") && frame.contentDocument.querySelector("#exportFrameButton") && frame.contentDocument.querySelector("#keyframes")); })()', "analysis lab iframe");
  await sleep(250);
  return readArcLabWorkbench(client, sessionId);
}

async function submitArcLabForm(client, sessionId, selector, readyExpression) {
  await evaluateJson(client, sessionId, `(() => {
    document.querySelector(${JSON.stringify(selector)})?.requestSubmit();
    return JSON.stringify({ submitted: true });
  })()`);
  await waitForCondition(client, sessionId, readyExpression, selector);
}

async function setFileInput(client, sessionId, selector, filePath) {
  const documentResult = await client.send("DOM.getDocument", {}, sessionId);
  const nodeResult = await client.send("DOM.querySelector", {
    nodeId: documentResult.root.nodeId,
    selector
  }, sessionId);
  if (!nodeResult.nodeId) fail(`file input not found: ${selector}`);
  await client.send("DOM.setFileInputFiles", {
    nodeId: nodeResult.nodeId,
    files: [filePath]
  }, sessionId);
}

async function switchArcLabTab(client, sessionId, role, tab) {
  await evaluateJson(client, sessionId, `(() => {
    document.querySelector(\`.app-tabbar[data-role="${role}"] button[data-tab="${tab}"]\`)?.click();
    return JSON.stringify({ clicked: true });
  })()`);
  await sleep(250);
  return readArcLabWorkbench(client, sessionId);
}

async function waitForCondition(client, sessionId, expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluateValue(client, sessionId, expression)) return;
    await sleep(250);
  }
  fail(`timed out waiting for ${label}`);
}

async function readArcLabWorkbench(client, sessionId) {
  return evaluateJson(client, sessionId, `(() => {
    const qs = (selector) => document.querySelector(selector);
    const visible = (selector) => {
      const element = qs(selector);
      if (!element) return false;
      const computed = getComputedStyle(element);
      return !element.hidden && computed.display !== "none" && computed.visibility !== "hidden" && element.getClientRects().length > 0;
    };
    const columnCount = (value) => value.trim() ? value.trim().split(/\\s+/).length : 0;
    const styles = (selector) => {
      const element = qs(selector);
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        display: computed.display,
        gridTemplateColumns: computed.gridTemplateColumns,
        columnCount: columnCount(computed.gridTemplateColumns),
        aspectRatio: computed.aspectRatio
      };
    };
    const canvasStats = () => {
      const canvas = qs(".review-overlay-canvas");
      if (!canvas) return { hasCanvas: false, paintedPixels: 0, text: "", stageLabels: "" };
      const context = canvas.getContext("2d");
      const pixels = context ? context.getImageData(0, 0, canvas.width, canvas.height).data : [];
      let paintedPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) paintedPixels += 1;
      }
      return {
        hasCanvas: true,
        paintedPixels,
        text: qs(".review-overlay")?.textContent || "",
        stageLabels: Array.from(document.querySelectorAll(".stage-list button")).map((button) => button.querySelector("strong")?.textContent.trim() || button.textContent.trim()).slice(0, 3).join("/")
      };
    };
    const analysisLabStats = () => {
      const frames = Array.from(document.querySelectorAll(".analysis-lab-frame"));
      const frame = frames.find((item) => {
        const computed = getComputedStyle(item);
        return !item.hidden && computed.display !== "none" && computed.visibility !== "hidden" && item.getClientRects().length > 0;
      }) || frames[0];
      const doc = frame?.contentDocument;
      const frameVisible = Boolean(frame && !frame.hidden && getComputedStyle(frame).display !== "none" && frame.getClientRects().length > 0);
      if (!doc) return { frameVisible, loaded: false };
      const frameVisibleElement = (selector) => {
        const element = doc.querySelector(selector);
        if (!element) return false;
        const computed = frame.contentWindow.getComputedStyle(element);
        return !element.hidden && computed.display !== "none" && computed.visibility !== "hidden" && element.getClientRects().length > 0;
      };
      return {
        frameVisible,
        loaded: true,
        embeddedMode: doc.documentElement.classList.contains("lab-embedded"),
        topbarHidden: !frameVisibleElement(".topbar"),
        primaryUpload: Boolean(doc.querySelector("#videoInput")),
        pairedUpload: Boolean(doc.querySelector("#pairedVideoInput")),
        analyzeButton: frameVisibleElement("#analyzeButton"),
        videoReplay: frameVisibleElement("#shotVideo") || frameVisibleElement(".video-stage"),
        exportFrameButton: Boolean(doc.querySelector("#exportFrameButton")),
        keyframes: Boolean(doc.querySelector("#keyframes")),
        reportSurfaces: Boolean(doc.querySelector("#analysis") && doc.querySelector("#playerReport") && doc.querySelector("#labReport"))
      };
    };
    return JSON.stringify({
      portalMode: document.body.classList.contains("portal-mode"),
      posterVisible: getComputedStyle(qs("#posterStage")).display !== "none",
      role: document.body.dataset.role || "",
      tab: document.body.dataset.tab || "",
      tabbarLabels: Array.from(document.querySelectorAll('.app-tabbar[data-role="' + (document.body.dataset.role || "") + '"] button')).map((button) => button.textContent.trim()),
      coach: styles("#coach"),
      student: styles("#student"),
      trend: styles("#trend"),
      trendGrid: styles(".trend-grid"),
      reviewFrame: styles(".review-video-frame"),
      reviewOverlay: canvasStats(),
      analysisLab: analysisLabStats(),
      visible: {
        coachLogin: visible("#coachLoginForm button"),
        lessonUpload: visible("#lessonUploadForm button"),
        analysisLabEmbed: visible(".analysis-lab-frame"),
        studentHomeAnalysisLabEmbed: visible("#student [data-tabs~='home'] .analysis-lab-frame"),
        studentTrainingAnalysisLabEmbed: visible("#student [data-tabs~='training'] .analysis-lab-frame"),
        reviewPublish: visible("#reviewPublishForm button"),
        coachReview: visible("#coachReview"),
        coachTrend: visible("#coachTrend"),
        studentBind: visible("#studentBindForm button"),
        studentHomework: visible("#studentHomeworkForm button"),
        studentTrend: visible("#studentTrend"),
        trainingPlan: visible("#trainingPlan"),
        knowledgeSearch: visible("#knowledgeAssistantForm button"),
        knowledgeAssistantVisible: visible("#knowledgeAssistantPanel"),
        manualMetricFieldsHidden: !document.body.textContent.includes("教练记录起球延迟") && !document.body.textContent.includes("本次复测记录起球延迟"),
        backendBoundariesHidden: qs("#boundaries")?.closest(".panel")?.hidden === true && qs("#productionBoundary")?.closest(".panel")?.hidden === true
      },
      errors: window.__mobileSmokeErrors || []
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
  child.stderrText = () => stderr;
  child.stderrTail = () => stderr.slice(-2000);
  return child;
}

async function launchChromeWithRetry() {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-mobile-browser-"));
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

async function waitForPageReady(client, sessionId, isArcLab) {
  const deadline = Date.now() + 15000;
  const selector = isArcLab ? "#posterStage .poster-frame" : ".workspace";
  while (Date.now() < deadline) {
    const ready = await evaluateValue(client, sessionId, `document.readyState !== 'loading' && Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (ready) {
      await sleep(750);
      return;
    }
    await sleep(250);
  }
  fail("page did not become DOM-ready");
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
  throw new Error(`mobile browser smoke failed: ${message}`);
}

async function applyMobileMetrics(client, sessionId) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
    scale: 1
  }, sessionId);
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
