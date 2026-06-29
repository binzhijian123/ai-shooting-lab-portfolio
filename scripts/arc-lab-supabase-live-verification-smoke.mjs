import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARC_LAB_DATA_MODEL_TABLES } from "../server/arcLabPlatform.mjs";
import {
  auditArcLabSupabaseLiveVerification,
  validateArcLabSupabaseLiveVerificationGate
} from "../server/arcLabSupabaseLiveVerification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fakeEnv = {
  ARC_LAB_LIVE_SUPABASE_VERIFY: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://arc-lab-example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-secret-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-placeholder",
  ARC_LAB_STORAGE_BUCKET: "arc-lab-videos"
};

const skipped = await auditArcLabSupabaseLiveVerification({ env: {}, fetchImpl: forbiddenFetch });
const skippedValidation = validateArcLabSupabaseLiveVerificationGate(skipped);
assert.equal(skippedValidation.ok, true, skippedValidation.errors.join("\n"));
assert.equal(skipped.verification_status, "skipped_not_requested");
assert.equal(skipped.live_external_services_contacted, false);
assert.equal(skipped.live_supabase_project_verified, false);
assert.equal(skipped.environment.secret_values_exposed, false);

const blocked = await auditArcLabSupabaseLiveVerification({
  env: { ARC_LAB_LIVE_SUPABASE_VERIFY: "1" },
  fetchImpl: forbiddenFetch
});
const blockedValidation = validateArcLabSupabaseLiveVerificationGate(blocked);
assert.equal(blockedValidation.ok, true, blockedValidation.errors.join("\n"));
assert.equal(blocked.verification_status, "blocked_missing_environment");
assert.equal(blocked.live_external_services_contacted, false);
assert(blocked.environment.missing_variables.includes("SUPABASE_SERVICE_ROLE_KEY"));

const calls = [];
const live = await auditArcLabSupabaseLiveVerification({
  env: fakeEnv,
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { status: 200 };
  }
});
const liveValidation = validateArcLabSupabaseLiveVerificationGate(live);
assert.equal(liveValidation.ok, true, liveValidation.errors.join("\n"));
assert.equal(live.verification_status, "live_read_only_surface_verified_rls_effect_unverified");
assert.equal(live.live_external_services_contacted, true);
assert.equal(live.live_supabase_project_verified, true);
assert.equal(live.live_rest_schema_surface_verified, true);
assert.equal(live.live_storage_bucket_verified, true);
assert.equal(live.live_rls_policy_effect_verified, false);
assert.equal(live.live_sms_provider_verified, false);
assert.equal(live.probes.table_results.length, ARC_LAB_DATA_MODEL_TABLES.length);
assert.equal(calls.length, ARC_LAB_DATA_MODEL_TABLES.length + 2);

const serialized = JSON.stringify(live);
for (const secret of [
  fakeEnv.NEXT_PUBLIC_SUPABASE_URL,
  fakeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fakeEnv.SUPABASE_SERVICE_ROLE_KEY
]) {
  assert(!serialized.includes(secret), `live verification output leaked ${secret}`);
}

const incomplete = await auditArcLabSupabaseLiveVerification({
  env: fakeEnv,
  fetchImpl: async (url) => ({ status: String(url).includes("/storage/v1/bucket/") ? 404 : 200 })
});
assert.equal(incomplete.verification_status, "live_read_only_surface_incomplete");
assert.equal(incomplete.live_storage_bucket_verified, false);

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ARC_LAB_LIVE_SUPABASE_VERIFY: "",
    DEEPSEEK_API_KEY: "",
    YOLO_COMMAND: "",
    RTMPOSE_COMMAND: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(baseUrl);
  const api = await fetchJson(`${baseUrl}/api/arc-lab-supabase-live-verification`);
  assert.equal(api.schema_version, "arc_lab_supabase_live_verification.v1");
  assert.equal(api.verification_status, "skipped_not_requested");
  assert.equal(api.live_external_services_contacted, false);
  assert.equal(api.live_rls_policy_effect_verified, false);
  assert.equal(api.environment.secret_values_exposed, false);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "arc_lab_supabase_live_verification_smoke.v1",
    source_contract: "opt_in_live_supabase_read_only_probe_default_no_external_contact",
    default_status: skipped.verification_status,
    blocked_status: blocked.verification_status,
    mock_live_status: live.verification_status,
    endpoint_status: api.verification_status,
    table_probe_count: live.probes.table_results.length,
    live_external_services_contacted_by_default: api.live_external_services_contacted,
    boundaries: live.boundaries
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await onceExit(server);
}

async function forbiddenFetch() {
  throw new Error("fetch should not be called");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (response.status !== 200) assert.fail(`${url} ${response.status} ${await response.text()}`);
  return response.json();
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/arc-lab-platform`);
      if (response.ok) return;
    } catch {
      // Server process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Arc Lab Supabase live verification smoke server did not start");
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
