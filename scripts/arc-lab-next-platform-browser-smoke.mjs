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
    if (message.error) pending.reject(new Error(`${message.error.message}: ${message.error.data || ""}`));
    else pending.resolve(message.result || {});
  }

  close() {
    this.socket.close();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appRoot = path.join(root, "apps", "coach-platform");
const pnpmBin = "/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pnpm";
const nodeBinDir = "/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin";
const binDir = "/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin";
const chromeBin = readArg("--chrome-bin") || process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const nextPort = Number(readArg("--port")) || await freePort();
const debugPort = Number(readArg("--debug-port") || 0);
const pageUrl = `http://127.0.0.1:${nextPort}/`;
const smokeEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  PATH: `${nodeBinDir}:${binDir}:${process.env.PATH || ""}`
};

let nextProcess = null;
let chromeProcess = null;
let userDataDir = null;
let cdp = null;

try {
  nextProcess = await startNext(nextPort);
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
      window.__arcLabNextSmokeErrors = [];
      const remember = (value) => window.__arcLabNextSmokeErrors.push(String(value).slice(0, 500));
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
  await waitForPageReady(cdp, sessionId);
  await applyMobileMetrics(cdp, sessionId);
  await sleep(500);

  const layout = await evaluateJson(cdp, sessionId, `(() => {
    const qs = (selector) => document.querySelector(selector);
    const text = document.body.textContent || "";
    const rectFor = (selector) => {
      const element = qs(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: computed.display,
        flexDirection: computed.flexDirection,
        gridTemplateColumns: computed.gridTemplateColumns
      };
    };
    return JSON.stringify({
      title: document.title,
      innerWidth,
      innerHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      hasHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth + 1,
      workspace: rectFor(".workspace"),
      topbar: rectFor(".topbar"),
      grid: rectFor(".grid"),
      panels: Array.from(document.querySelectorAll(".panel")).map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
      wideElements: Array.from(document.querySelectorAll("body *")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth || 0,
          text: (element.textContent || "").trim().slice(0, 80)
        };
      }).filter((item) => item.width > 390 || item.scrollWidth > 390).slice(0, 8),
      visible: {
        productName: text.includes("Arc Lab Coach OS"),
        headline: text.includes("教练主导的投篮复盘工作台"),
        coachQueue: text.includes("教练待办") && text.includes("复测待看"),
        studentResult: text.includes("学生端结果") && text.includes("教练反馈"),
        studentFinalBoundary: text.includes("学生端只把教练发布的反馈作为最终依据"),
        aiDraftHidden: text.includes("AI 草稿、编辑 diff、原始证据追踪默认隐藏"),
        supabaseBoundary: text.includes("Supabase 边界") && text.includes("Live Supabase") && text.includes("SMS Auth") && text.includes("Storage"),
        runtimeBoundary: text.includes("local_next_build_verified_by_runtime_smoke"),
        localFallbackLink: qs('a[href="/arc-lab.html"]')?.textContent.includes("打开本地验收版") || false
      },
      errors: window.__arcLabNextSmokeErrors || []
    });
  })()`);

  assert(layout.title.includes("Arc Lab Coach OS"), "page title mismatch");
  assert(layout.innerWidth === 390, `viewport width mismatch: ${layout.innerWidth}`);
  assert(layout.hasHorizontalOverflow === false, `horizontal overflow: scrollWidth=${layout.scrollWidth}, clientWidth=${layout.clientWidth}, wide=${JSON.stringify(layout.wideElements)}`);
  assert(layout.workspace?.width <= 390, `workspace too wide: ${layout.workspace?.width}`);
  assert(layout.grid?.display === "flex", `mobile grid should collapse to flex: ${JSON.stringify(layout.grid)}`);
  assert(layout.grid?.flexDirection === "column", `mobile grid should be column: ${JSON.stringify(layout.grid)}`);
  assert(layout.panels.length === 3, `expected three panels, got ${layout.panels.length}`);
  for (const panel of layout.panels) {
    assert(panel.width <= 358, `panel too wide: ${JSON.stringify(panel)}`);
  }
  for (const [name, visible] of Object.entries(layout.visible)) {
    assert(Boolean(visible), `missing visible contract: ${name}`);
  }
  assert(layout.errors.length === 0, `browser errors: ${layout.errors.join("; ")}`);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "arc_lab_next_platform_browser_smoke.v1",
    source_contract: "local_nextjs_dev_mobile_browser_smoke_not_production_deployment",
    base_url: pageUrl,
    viewport: {
      width: layout.innerWidth,
      height: layout.innerHeight,
      client_width: layout.clientWidth,
      scroll_width: layout.scrollWidth,
      horizontal_overflow: layout.hasHorizontalOverflow
    },
    checks: {
      next_dev_server_started: true,
      mobile_grid_collapsed: true,
      visible_contracts: layout.visible,
      panel_count: layout.panels.length,
      browser_errors: layout.errors.length
    },
    boundaries: {
      production_deployment_verified: false,
      live_supabase_project_verified: false,
      live_sms_auth_verified: false,
      live_storage_verified: false
    }
  }, null, 2));
} finally {
  if (cdp) cdp.close();
  if (chromeProcess) {
    chromeProcess.kill("SIGTERM");
    await onceExit(chromeProcess);
  }
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
  if (nextProcess) {
    nextProcess.kill("SIGTERM");
    await onceExit(nextProcess);
  }
}

async function startNext(port) {
  const child = spawn(pnpmBin, ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appRoot,
    env: smokeEnv,
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
  try {
    await waitForNext(port, child);
    return child;
  } catch (error) {
    child.kill("SIGTERM");
    await onceExit(child);
    throw error;
  }
}

async function waitForNext(port, child) {
  const deadline = Date.now() + 30000;
  const url = `http://127.0.0.1:${port}/`;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      fail(`Next exited before ready: code=${child.exitCode}, signal=${child.signalCode}, output=${child.outputText?.().slice(-2000) || ""}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes("Arc Lab Coach OS")) return;
    } catch {
      // Retry until Next compiles and serves the route.
    }
    await sleep(250);
  }
  fail(`Next dev server did not become ready: ${url}; output=${child.outputText?.().slice(-2000) || ""}`);
}

function startChrome(port, profileDir) {
  const child = spawn(chromeBin, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
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
    const profileDir = await mkdtemp(path.join(tmpdir(), "arc-lab-next-browser-"));
    const port = debugPort || await freePort();
    const child = startChrome(port, profileDir);
    try {
      const version = await waitForChrome(port, child);
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

async function waitForChrome(port, child) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      fail(`Chrome exited before DevTools was ready: code=${child.exitCode}, signal=${child.signalCode}, stderr=${child.stderrTail?.() || ""}`);
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
    const ready = await evaluateValue(client, sessionId, `document.readyState !== "loading" && Boolean(document.querySelector(".workspace"))`);
    if (ready) {
      await sleep(750);
      return;
    }
    await sleep(250);
  }
  fail("Next page did not become DOM-ready");
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
  if (result.exceptionDetails) fail(`browser evaluation failed: ${result.exceptionDetails.text}`);
  return result.result?.value;
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

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`Arc Lab Next browser smoke failed: ${message}`);
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
