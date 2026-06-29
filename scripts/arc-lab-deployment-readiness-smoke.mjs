import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditArcLabDeploymentReadiness,
  validateArcLabDeploymentReadinessGate
} from "../server/arcLabDeploymentReadiness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sql = await readFile(path.join(root, "supabase", "migrations", "0001_arc_lab_mvp_schema.sql"), "utf8");
const emptyAudit = auditArcLabDeploymentReadiness({ env: {}, sql });
const fakeReadyAudit = auditArcLabDeploymentReadiness({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "service-placeholder",
    SUPABASE_PROJECT_REF: "example-ref",
    SUPABASE_DB_PASSWORD: "db-placeholder",
    ARC_LAB_SMS_PROVIDER: "provider-placeholder",
    ARC_LAB_SMS_ACCOUNT_ID: "account-placeholder",
    ARC_LAB_SMS_AUTH_TOKEN: "token-placeholder",
    ARC_LAB_STORAGE_BUCKET: "arc-lab-videos"
  },
  sql
});
const emptyValidation = validateArcLabDeploymentReadinessGate(emptyAudit);
const fakeReadyValidation = validateArcLabDeploymentReadinessGate(fakeReadyAudit);

assert.equal(emptyValidation.ok, true, emptyValidation.errors.join("\n"));
assert.equal(emptyAudit.deployment_ready_for_manual_apply, false);
assert.equal(emptyAudit.readiness_status, "blocked_missing_environment_or_sql_contract");
assert(emptyAudit.environment.missing_required_variables.includes("NEXT_PUBLIC_SUPABASE_URL"));
assert.equal(emptyAudit.environment.secret_values_exposed, false);
assert.equal(fakeReadyValidation.ok, true, fakeReadyValidation.errors.join("\n"));
assert.equal(fakeReadyAudit.deployment_ready_for_manual_apply, true);
assert.equal(fakeReadyAudit.readiness_status, "ready_for_manual_live_verification");
assert.equal(fakeReadyAudit.live_supabase_project_verified, false);
assert.equal(fakeReadyAudit.live_sms_provider_verified, false);
assert.equal(fakeReadyAudit.live_storage_upload_verified, false);
assert.equal(fakeReadyAudit.environment.missing_required_variables.length, 0);

const envExample = await readFile(path.join(root, ".env.example"), "utf8");
for (const required of emptyAudit.environment.required_groups.flatMap((group) => group.required_variables)) {
  assert(envExample.includes(`${required}=`), `.env.example missing ${required}`);
}

const js = await readFile(path.join(root, "app", "arc-lab.js"), "utf8");
assert(js.includes("/api/arc-lab-deployment-readiness"));
assert(js.includes("部署门禁"));

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: "", YOLO_COMMAND: "", RTMPOSE_COMMAND: "" },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer();
  const api = await fetchJson("/api/arc-lab-deployment-readiness");
  assert.equal(api.schema_version, "arc_lab_deployment_readiness.v1");
  assert.equal(api.ok, true);
  assert.equal(api.live_supabase_project_verified, false);
  assert.equal(api.live_sms_provider_verified, false);
  assert.equal(api.live_storage_upload_verified, false);
  assert.equal(api.boundaries.live_external_services_contacted, false);
  assert.equal(api.environment.secret_values_exposed, false);
  assert.equal(api.supabase_contract.ok, true);
  assert(api.environment.required_groups.some((group) => group.id === "sms_auth"));

  console.log(JSON.stringify({
    ok: true,
    schema_version: "arc_lab_deployment_readiness_smoke.v1",
    source_contract: "deployment_env_gate_without_live_external_service_contact",
    readiness_status: api.readiness_status,
    required_env_groups: api.environment.required_groups.map((group) => group.id),
    missing_required_variable_count: api.environment.missing_required_variables.length,
    boundaries: api.boundaries
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await onceExit(server);
}

async function fetchJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (response.status !== 200) assert.fail(`${pathname} ${response.status} ${await response.text()}`);
  return response.json();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/arc-lab-platform`);
      if (response.ok) return;
    } catch {
      // Server process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Arc Lab deployment readiness smoke server did not start");
}

function onceExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
