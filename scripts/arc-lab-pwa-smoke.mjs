import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;

const html = await readFile(path.join(root, "app", "arc-lab.html"), "utf8");
const js = await readFile(path.join(root, "app", "arc-lab.js"), "utf8");
const sw = await readFile(path.join(root, "app", "arc-lab-sw.js"), "utf8");
const manifest = JSON.parse(await readFile(path.join(root, "app", "arc-lab.webmanifest"), "utf8"));

assert(html.includes('rel="manifest" href="/arc-lab.webmanifest"'));
assert(html.includes('name="theme-color" content="#0f2e28"'));
assert(js.includes("navigator.serviceWorker.register(\"/arc-lab-sw.js\")"));
assert.equal(manifest.start_url, "/arc-lab.html");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color, "#0f2e28");
assert(manifest.icons.some((icon) => icon.src === "/assets/arc-lab-icon.svg" && icon.purpose.includes("maskable")));
assert(sw.includes("CACHE_NAME"));
assert(sw.includes("/arc-lab.html"));
assert(!sw.includes("/api/arc-lab"));

const port = await getFreePort();
const server = spawn(nodeBin, ["server/index.mjs"], {
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

try {
  await waitForServer(port);
  const manifestResponse = await fetch(`http://127.0.0.1:${port}/arc-lab.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  assert(manifestResponse.headers.get("content-type").includes("application/manifest+json"));
  const servedManifest = await manifestResponse.json();
  assert.equal(servedManifest.scope, "/");

  const serviceWorkerResponse = await fetch(`http://127.0.0.1:${port}/arc-lab-sw.js`);
  assert.equal(serviceWorkerResponse.status, 200);
  assert(serviceWorkerResponse.headers.get("content-type").includes("text/javascript"));
  assert((await serviceWorkerResponse.text()).includes("SHELL_ASSETS"));
} finally {
  server.kill("SIGTERM");
  await onceExit(server);
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_pwa_smoke.v1",
  source_contract: "local_mobile_first_pwa_shell_not_nextjs_or_production_offline_data",
  manifest: {
    start_url: manifest.start_url,
    display: manifest.display,
    theme_color: manifest.theme_color,
    icon_count: manifest.icons.length
  },
  boundaries: [
    "arc_lab_static_shell_only",
    "service_worker_does_not_cache_api_payloads",
    "analysis_lab_entry_preserved",
    "not_a_production_nextjs_app"
  ]
}, null, 2));

async function waitForServer(portToUse) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    try {
      const response = await fetch(`http://127.0.0.1:${portToUse}/arc-lab.html`);
      if (response.ok) return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error("server did not become ready");
}

async function getFreePort() {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function onceExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
