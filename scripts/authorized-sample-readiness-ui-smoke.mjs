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

  const readiness = await fetchJson(`${baseUrl}/api/authorized-sample-readiness`);
  assert(readiness.schema_version === "authorized_sample_readiness_audit.v1", "readiness schema mismatch");
  assert(readiness.source_contract === "metadata_only_no_video_file_access", "readiness source contract mismatch");
  assert(readiness.status === "waiting_for_authorized_samples", `readiness status mismatch: ${readiness.status}`);
  assert(readiness.candidate_sample_count === 0, "current manifest should not expose real/representative sample candidates");
  assert(readiness.ready_sample_count === 0, "current manifest should not have ready real/representative samples");
  assert(Array.isArray(readiness.required_metadata) && readiness.required_metadata.includes("authorization.provider"), "required metadata missing provider");
  assert(readiness.forbidden_scope?.includes("cloud_storage"), "forbidden cloud storage scope missing");
  assert(readiness.errors?.length === 0, `current readiness errors: ${JSON.stringify(readiness.errors)}`);

  const check = await fetchJson(`${baseUrl}/api/knowledge-summary`).then(() => fetchJson(`${baseUrl}/api/authorized-sample-readiness`));
  assert(check.source_contract === readiness.source_contract, "readiness endpoint unstable across calls");

  const [html, main] = await Promise.all([
    readFile(path.join(root, "app", "index.html"), "utf8"),
    readFile(path.join(root, "app", "main.js"), "utf8")
  ]);
  for (const needle of ["sampleReadinessStatus", "sampleReadiness", "样例授权门禁"]) {
    assert(html.includes(needle), `frontend readiness DOM missing: ${needle}`);
  }
  for (const needle of [
    "loadAuthorizedSampleReadiness();",
    "/api/authorized-sample-readiness",
    "metadata-only gate",
    "ready_sample_count",
    "candidate_sample_count",
    "不读取、不上传、不解码真实视频"
  ]) {
    assert(main.includes(needle), `frontend readiness binding missing: ${needle}`);
  }

  console.log(JSON.stringify({
    ok: true,
    schema_version: "authorized_sample_readiness_ui_smoke.v1",
    source_contract: "api_and_frontend_binding_metadata_only",
    endpoint: {
      schema_version: readiness.schema_version,
      status: readiness.status,
      candidate_sample_count: readiness.candidate_sample_count,
      ready_sample_count: readiness.ready_sample_count,
      error_count: readiness.errors.length
    },
    frontend_bindings: {
      sample_readiness_card: true,
      status_badge: true,
      api_binding: true,
      metadata_only_boundary_copy: true
    },
    boundaries: [
      "no_real_video_file_access",
      "current_manifest_has_no_real_sample_candidates",
      "readiness_does_not_raise_diagnosis_confidence"
    ]
  }, null, 2));
} finally {
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
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
      const response = await fetch(`${url}/api/authorized-sample-readiness`);
      if (response.ok) return;
    } catch {
      // Retry until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`server did not become ready: ${url}`);
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
  throw new Error(`authorized sample readiness UI smoke failed: ${message}`);
}
