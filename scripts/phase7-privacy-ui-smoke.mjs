import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
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
const uploadDir = path.join(root, "data", "uploads");
const chromeBin = readArg("--chrome-bin") || process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(readArg("--port")) || await freePort();
const debugPort = Number(readArg("--debug-port") || 0);
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");

const stamp = Date.now();
const deleteFileName = `upload_${stamp}_abc123def456.mp4`;
const deleteFilePath = path.join(uploadDir, deleteFileName);
const cleanupFileName = `upload_${stamp + 1}_abcdef654321.mp4`;
const cleanupFilePath = path.join(uploadDir, cleanupFileName);
const localUserDeleteId = `phase7_ui_delete_${stamp}`;

let serverProcess = null;
let chromeProcess = null;
let userDataDir = null;
let cdp = null;
const cleanupErrors = [];

try {
  await mkdir(uploadDir, { recursive: true });
  await writeFile(deleteFilePath, "phase7 browser delete smoke\n");
  await writeFile(cleanupFilePath, "phase7 browser cleanup smoke\n");
  const oldDate = new Date("2000-01-01T00:00:00.000Z");
  await utimes(cleanupFilePath, oldDate, oldDate);

  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }
  await postJson(`${baseUrl}/api/sessions`, buildSessionPayload(`${localUserDeleteId}_a`, localUserDeleteId, "long_term"));
  await postJson(`${baseUrl}/api/sessions`, buildSessionPayload(`${localUserDeleteId}_b`, localUserDeleteId, "short_term_review"));

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
      window.__phase7UiSmokeErrors = [];
      window.confirm = () => true;
      const remember = (value) => window.__phase7UiSmokeErrors.push(String(value).slice(0, 500));
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
    document.querySelector("#privacyStatus")?.textContent === "local only" &&
    document.querySelector("#privacyBoundary")?.innerText.includes("${deleteFileName}")
  `, "privacy card with managed upload file");

  const initial = await readPrivacyUi(cdp, sessionId);
  assert(initial.privacyStatus === "local only", `privacy status mismatch: ${initial.privacyStatus}`);
  assert(initial.text.includes("local_uploads_only"), "raw video local boundary not visible");
  assert(initial.text.includes("local_sqlite"), "local sqlite boundary not visible");
  assert(initial.text.includes("not_implemented"), "cloud sync not implemented not visible");
  assert(initial.text.includes("public_showcase"), "public showcase forbidden use not visible");
  assert(initial.text.includes("model_training"), "model training forbidden use not visible");
  assert(initial.text.includes("不包含原始视频字节"), "raw video export exclusion copy not visible");
  assert(initial.hasExportButton, "privacy export button missing");
  assert(initial.hasUserIdInput, "privacy user id input missing");
  assert(initial.hasDeleteUserSessionsButton, "delete local user sessions button missing");
  assert(initial.hasCleanupDaysInput, "cleanup days input missing");
  assert(initial.hasPreviewButton, "cleanup preview button missing");
  assert(initial.hasRunButton, "cleanup run button missing");
  assert(initial.deleteButtonCount >= 1, "upload file delete button missing");
  assert(initial.fileNames.includes(deleteFileName), "managed delete file missing from UI");
  assert(initial.primaryUploadDeleteDisabled === true, "primary upload delete should be disabled before upload");
  assert(initial.pairedUploadDeleteDisabled === true, "paired upload delete should be disabled before upload");
  assert(initial.errors.length === 0, `browser errors before actions: ${initial.errors.join("; ")}`);

  const exportPayload = await evaluateJson(cdp, sessionId, `fetch("/api/privacy-export").then((res) => res.json()).then((payload) => JSON.stringify({
    schema_version: payload.schema_version,
    scope: payload.scope,
    raw_video_bytes: payload.storage?.raw_video_bytes,
    cloud_sync: payload.storage?.cloud_sync,
    upload_inventory_schema: payload.upload_inventory?.schema_version,
    redaction_local_file_paths: payload.export_redaction?.local_file_paths,
    redaction_forbidden_fields: payload.export_redaction?.forbidden_fields || []
  }))`);
  assert(exportPayload.schema_version === "privacy_export.v1", "privacy export schema mismatch");
  assert(exportPayload.scope === "local_json_export_no_raw_video_bytes", "privacy export scope mismatch");
  assert(exportPayload.raw_video_bytes === "excluded", "privacy export must exclude raw video bytes");
  assert(exportPayload.cloud_sync === "not_implemented", "privacy export cloud sync mismatch");
  assert(exportPayload.upload_inventory_schema === "upload_file_inventory.v1", "privacy export upload inventory missing");
  assert(exportPayload.redaction_local_file_paths === "redacted", "privacy export redaction boundary missing");
  assert(exportPayload.redaction_forbidden_fields.includes("video_path"), "privacy export forbidden field list missing video_path");

  await evaluateValue(cdp, sessionId, `
    document.querySelector("#privacyUserId").value = "${localUserDeleteId}";
    "ok";
  `);
  const deleteUserClicked = await evaluateValue(cdp, sessionId, `
    (() => {
      const button = document.querySelector("#deleteLocalUserSessions");
      if (button) button.click();
      return Boolean(button);
    })();
  `);
  assert(deleteUserClicked === true, "delete local user sessions button not found");
  await waitForCondition(cdp, sessionId, `
    document.querySelector("#localUserDeleteResult")?.innerText.includes("已删除 2 条本地 SQLite session")
  `, "local user sessions delete result");
  const userExportAfterDelete = await evaluateJson(cdp, sessionId, `
    fetch("/api/privacy-export?user_id=${encodeURIComponent(localUserDeleteId)}")
      .then((res) => res.json())
      .then((payload) => JSON.stringify({ session_count: payload.sessions?.length || 0 }))
  `);
  assert(userExportAfterDelete.session_count === 0, "local user sessions remained after UI delete");

  await evaluateValue(cdp, sessionId, `document.querySelector("#uploadCleanupDays").value = "3650"; "ok";`);
  await evaluateValue(cdp, sessionId, `document.querySelector("#previewUploadCleanup").click(); "clicked";`);
  await waitForCondition(cdp, sessionId, `
    document.querySelector("#uploadCleanupResult")?.innerText.includes("预览")
  `, "cleanup dry-run result");
  assert(await exists(cleanupFilePath), "dry-run must not delete managed upload file");

  const deleteClicked = await evaluateValue(cdp, sessionId, `
    (() => {
      const button = [...document.querySelectorAll("[data-delete-upload-file]")].find((item) => item.getAttribute("data-delete-upload-file") === "${deleteFileName}");
      if (button) button.click();
      return Boolean(button);
    })();
  `);
  assert(deleteClicked === true, "delete upload file button not found");
  await waitForCondition(cdp, sessionId, `
    !document.querySelector("#privacyBoundary")?.innerText.includes("${deleteFileName}")
  `, "managed upload file removed from privacy card");
  assert(!(await exists(deleteFilePath)), "managed upload file still exists after UI delete");

  const afterDelete = await readPrivacyUi(cdp, sessionId);
  assert(afterDelete.privacyStatus === "local only", "privacy status changed after UI delete");
  assert(afterDelete.errors.length === 0, `browser errors after actions: ${afterDelete.errors.join("; ")}`);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase7_privacy_ui_smoke.v1",
    source_contract: "browser_dom_privacy_boundary_export_upload_cleanup",
    viewport: { width: 390, height: 844 },
    privacy: {
      status: initial.privacyStatus,
      local_raw_video_visible: initial.text.includes("local_uploads_only"),
      local_sqlite_visible: initial.text.includes("local_sqlite"),
      cloud_sync_not_implemented_visible: initial.text.includes("not_implemented"),
      forbidden_model_training_visible: initial.text.includes("model_training")
    },
    export: exportPayload,
    local_user_delete: {
      user_id: localUserDeleteId,
      sessions_after_delete: userExportAfterDelete.session_count,
      result_visible: true
    },
    upload_inventory: {
      row_count_before_delete: initial.uploadFileRows,
      delete_buttons_before_delete: initial.deleteButtonCount,
      ui_delete_removed_file: !afterDelete.fileNames.includes(deleteFileName),
      file_exists_after_ui_delete: await exists(deleteFilePath)
    },
    cleanup: {
      dry_run_result_visible: true,
      dry_run_kept_file: await exists(cleanupFilePath)
    },
    boundaries: [
      "local_only_no_cloud_sync",
      "privacy_export_excludes_raw_video_bytes",
      "browser_ui_delete_local_sqlite_sessions_only",
      "browser_ui_delete_limited_to_managed_upload_file",
      "retention_cleanup_dry_run_keeps_file"
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
  for (const filePath of [deleteFilePath, cleanupFilePath]) {
    await rm(filePath, { force: true })
      .catch((error) => cleanupErrors.push(`file cleanup failed ${filePath}: ${error.message}`));
  }
  await fetch(`${baseUrl}/api/users/${encodeURIComponent(localUserDeleteId)}/sessions`, { method: "DELETE" })
    .then((response) => response.ok || cleanupErrors.push(`local user cleanup status ${response.status}: ${localUserDeleteId}`))
    .catch((error) => cleanupErrors.push(`local user cleanup failed ${localUserDeleteId}: ${error.message}`));
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await onceExit(serverProcess);
  }
  if (cleanupErrors.length) {
    console.error(`cleanup warnings: ${cleanupErrors.join("; ")}`);
    process.exitCode = process.exitCode || 1;
  }
}

async function readPrivacyUi(client, sessionId) {
  return evaluateJson(client, sessionId, `(() => {
    const root = document.querySelector("#privacyBoundary");
    return JSON.stringify({
      privacyStatus: document.querySelector("#privacyStatus")?.textContent || "",
      text: root?.innerText || "",
      hasExportButton: Boolean(document.querySelector("#downloadPrivacyExport")),
      hasUserIdInput: Boolean(document.querySelector("#privacyUserId")),
      hasDeleteUserSessionsButton: Boolean(document.querySelector("#deleteLocalUserSessions")),
      hasCleanupDaysInput: Boolean(document.querySelector("#uploadCleanupDays")),
      hasPreviewButton: Boolean(document.querySelector("#previewUploadCleanup")),
      hasRunButton: Boolean(document.querySelector("#runUploadCleanup")),
      uploadFileRows: root?.querySelectorAll(".upload-file-row").length || 0,
      deleteButtonCount: root?.querySelectorAll("[data-delete-upload-file]").length || 0,
      fileNames: [...root?.querySelectorAll("[data-delete-upload-file]") || []].map((button) => button.getAttribute("data-delete-upload-file")),
      primaryUploadDeleteDisabled: document.querySelector("#deleteUploadButton")?.disabled ?? null,
      pairedUploadDeleteDisabled: document.querySelector("#deletePairedUploadButton")?.disabled ?? null,
      errors: window.__phase7UiSmokeErrors || []
    });
  })()`);
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

function buildSessionPayload(sessionId, userId, memoryStatus) {
  return {
    session_id: sessionId,
    title: `Phase 7 browser local user delete ${memoryStatus}`,
    memory_status: memoryStatus,
    evidence: {
      session_id: sessionId,
      user_profile: {
        user_id: userId,
        goal: "Phase 7 browser local SQLite delete smoke"
      },
      session: {
        camera_view: "side",
        fps: 30
      },
      video_context: {
        file_name: `${sessionId}.mp4`,
        camera_view: "side",
        fps: 30
      },
      confidence: {
        overall: memoryStatus === "long_term" ? 0.82 : 0.42
      },
      metrics: {
        ball_lift_knee_delta_ms: memoryStatus === "long_term" ? 120 : 240,
        trunk_lean_release_deg: 3
      },
      matched_signals: [],
      missing_evidence: []
    },
    report: {
      summary: "Phase 7 browser local user delete smoke"
    }
  };
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
    const profileDir = await mkdtemp(path.join(tmpdir(), "shooting-lab-phase7-privacy-ui-"));
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

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase7 privacy UI smoke failed: ${message}`);
}
