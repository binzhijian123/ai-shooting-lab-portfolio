import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditArcLabSupabaseStorageLifecycleVerification,
  validateArcLabSupabaseStorageLifecycleVerificationGate
} from "../server/arcLabSupabaseStorageLifecycleVerification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const confirmation = "I_UNDERSTAND_THIS_WRITES_AND_DELETES_A_TEST_OBJECT";
const objectKey = [
  "11111111-1111-4111-8111-111111111111",
  "33333333-3333-4333-8333-333333333333",
  "codex-storage-lifecycle",
  "smoke.txt"
].join("/");
const fakeEnv = {
  ARC_LAB_LIVE_STORAGE_LIFECYCLE_VERIFY: confirmation,
  NEXT_PUBLIC_SUPABASE_URL: "https://arc-lab-lifecycle-example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-placeholder",
  ARC_LAB_STORAGE_BUCKET: "arc-lab-videos",
  ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY: objectKey
};

const skipped = await auditArcLabSupabaseStorageLifecycleVerification({ env: {}, fetchImpl: forbiddenFetch });
assert.equal(validateArcLabSupabaseStorageLifecycleVerificationGate(skipped).ok, true);
assert.equal(skipped.verification_status, "skipped_not_requested");
assert.equal(skipped.live_external_services_contacted, false);

const blocked = await auditArcLabSupabaseStorageLifecycleVerification({
  env: { ARC_LAB_LIVE_STORAGE_LIFECYCLE_VERIFY: confirmation },
  fetchImpl: forbiddenFetch
});
assert.equal(validateArcLabSupabaseStorageLifecycleVerificationGate(blocked).ok, true);
assert.equal(blocked.verification_status, "blocked_missing_environment");
assert.equal(blocked.live_external_services_contacted, false);

const invalid = await auditArcLabSupabaseStorageLifecycleVerification({
  env: { ...fakeEnv, ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY: "plain-real-video.mp4" },
  fetchImpl: forbiddenFetch
});
assert.equal(validateArcLabSupabaseStorageLifecycleVerificationGate(invalid).ok, true);
assert.equal(invalid.verification_status, "blocked_invalid_environment");
assert.equal(invalid.live_external_services_contacted, false);

const calls = [];
const live = await auditArcLabSupabaseStorageLifecycleVerification({
  env: fakeEnv,
  fetchImpl: createLifecycleFetch({ calls })
});
const liveValidation = validateArcLabSupabaseStorageLifecycleVerificationGate(live);
assert.equal(liveValidation.ok, true, liveValidation.errors.join("\n"));
assert.equal(live.verification_status, "live_storage_lifecycle_verified");
assert.equal(live.live_external_services_contacted, true);
assert.equal(live.live_storage_object_uploaded, true);
assert.equal(live.live_storage_object_read_verified, true);
assert.equal(live.live_storage_object_deleted, true);
assert.equal(live.live_storage_delete_verified, true);
assert.equal(live.live_storage_lifecycle_verified, true);
assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "DELETE", "GET"]);

const uploadFailed = await auditArcLabSupabaseStorageLifecycleVerification({
  env: fakeEnv,
  fetchImpl: createLifecycleFetch({ uploadStatus: 409 })
});
assert.equal(uploadFailed.verification_status, "live_storage_lifecycle_upload_failed");
assert.equal(uploadFailed.live_storage_object_uploaded, false);

const cleanupFailed = await auditArcLabSupabaseStorageLifecycleVerification({
  env: fakeEnv,
  fetchImpl: createLifecycleFetch({ deleteStatus: 500 })
});
assert.equal(cleanupFailed.verification_status, "live_storage_lifecycle_incomplete_cleanup_failed");
assert.equal(cleanupFailed.live_storage_object_uploaded, true);
assert.equal(cleanupFailed.live_storage_object_deleted, false);
assert.equal(cleanupFailed.live_storage_lifecycle_verified, false);

const serialized = JSON.stringify(live);
for (const hidden of [
  fakeEnv.NEXT_PUBLIC_SUPABASE_URL,
  fakeEnv.SUPABASE_SERVICE_ROLE_KEY,
  fakeEnv.ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY
]) {
  assert(!serialized.includes(hidden), "Storage lifecycle output leaked protected value");
}

const serverSource = await readFile(path.join(root, "server", "index.mjs"), "utf8");
assert(serverSource.includes('url.pathname === "/api/arc-lab-supabase-storage-lifecycle-verification"'));
assert(serverSource.includes("auditArcLabSupabaseStorageLifecycleVerification({ env: process.env })"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_supabase_storage_lifecycle_verification_smoke.v1",
  source_contract: "strong_opt_in_storage_lifecycle_write_read_delete_default_no_external_contact",
  default_status: skipped.verification_status,
  blocked_status: blocked.verification_status,
  invalid_status: invalid.verification_status,
  mock_live_status: live.verification_status,
  mock_upload_failed_status: uploadFailed.verification_status,
  mock_cleanup_failed_status: cleanupFailed.verification_status,
  endpoint_binding: true,
  live_external_services_contacted_by_default: skipped.live_external_services_contacted,
  operation_count: calls.length,
  boundaries: live.boundaries
}, null, 2));

function createLifecycleFetch({ calls = [], uploadStatus = 200, deleteStatus = 200 } = {}) {
  let exists = false;
  return async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    calls.push({ method: init.method, pathname: url.pathname });
    if (init.method === "POST") {
      exists = uploadStatus >= 200 && uploadStatus < 300;
      return { status: uploadStatus, body: { cancel: async () => {} } };
    }
    if (init.method === "GET") {
      return { status: exists ? 206 : 404, body: { cancel: async () => {} } };
    }
    if (init.method === "DELETE") {
      const ok = deleteStatus >= 200 && deleteStatus < 300;
      if (ok) exists = false;
      return { status: deleteStatus, body: { cancel: async () => {} } };
    }
    return { status: 405, body: { cancel: async () => {} } };
  };
}

async function forbiddenFetch() {
  throw new Error("fetch should not be called");
}
