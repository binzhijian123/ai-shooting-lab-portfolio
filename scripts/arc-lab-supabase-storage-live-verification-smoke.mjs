import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditArcLabSupabaseStorageLiveVerification,
  validateArcLabSupabaseStorageLiveVerificationGate
} from "../server/arcLabSupabaseStorageLiveVerification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ids = {
  ownOrg: "11111111-1111-4111-8111-111111111111",
  crossOrg: "22222222-2222-4222-8222-222222222222",
  ownAthlete: "33333333-3333-4333-8333-333333333333",
  siblingAthlete: "44444444-4444-4444-8444-444444444444",
  crossAthlete: "55555555-5555-4555-8555-555555555555"
};
const keys = {
  ownVisible: `${ids.ownOrg}/${ids.ownAthlete}/visible.mp4`,
  ownHidden: `${ids.ownOrg}/${ids.ownAthlete}/hidden.mp4`,
  sibling: `${ids.ownOrg}/${ids.siblingAthlete}/sibling.mp4`,
  crossOrg: `${ids.crossOrg}/${ids.crossAthlete}/cross.mp4`
};
const fakeEnv = {
  ARC_LAB_LIVE_STORAGE_RLS_VERIFY: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://arc-lab-storage-example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-secret-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-placeholder",
  ARC_LAB_RLS_COACH_ACCESS_TOKEN: "coach-token-secret-placeholder",
  ARC_LAB_RLS_STUDENT_ACCESS_TOKEN: "student-token-secret-placeholder",
  ARC_LAB_STORAGE_BUCKET: "arc-lab-videos",
  ARC_LAB_STORAGE_OWN_VISIBLE_OBJECT_KEY: keys.ownVisible,
  ARC_LAB_STORAGE_OWN_HIDDEN_OBJECT_KEY: keys.ownHidden,
  ARC_LAB_STORAGE_SIBLING_OBJECT_KEY: keys.sibling,
  ARC_LAB_STORAGE_CROSS_ORG_OBJECT_KEY: keys.crossOrg
};

const skipped = await auditArcLabSupabaseStorageLiveVerification({ env: {}, fetchImpl: forbiddenFetch });
assert.equal(validateArcLabSupabaseStorageLiveVerificationGate(skipped).ok, true);
assert.equal(skipped.verification_status, "skipped_not_requested");
assert.equal(skipped.live_external_services_contacted, false);

const blocked = await auditArcLabSupabaseStorageLiveVerification({
  env: { ARC_LAB_LIVE_STORAGE_RLS_VERIFY: "1" },
  fetchImpl: forbiddenFetch
});
assert.equal(validateArcLabSupabaseStorageLiveVerificationGate(blocked).ok, true);
assert.equal(blocked.verification_status, "blocked_missing_environment");
assert.equal(blocked.live_external_services_contacted, false);

const calls = [];
const live = await auditArcLabSupabaseStorageLiveVerification({
  env: fakeEnv,
  fetchImpl: createStorageFetch({ calls })
});
const liveValidation = validateArcLabSupabaseStorageLiveVerificationGate(live);
assert.equal(liveValidation.ok, true, liveValidation.errors.join("\n"));
assert.equal(live.verification_status, "live_storage_read_policy_verified");
assert.equal(live.live_fixture_preflight_verified, true);
assert.equal(live.live_coach_storage_access_verified, true);
assert.equal(live.live_student_own_visible_storage_verified, true);
assert.equal(live.live_student_hidden_storage_denial_verified, true);
assert.equal(live.live_same_org_cross_athlete_denial_verified, true);
assert.equal(live.live_cross_organization_storage_denial_verified, true);
assert.equal(live.live_storage_read_policy_verified, true);
assert.equal(live.probes.fixture_preflight.length, 4);
assert.equal(live.probes.role_results.length, 8);
assert.equal(calls.length, 12);

const leaked = await auditArcLabSupabaseStorageLiveVerification({
  env: fakeEnv,
  fetchImpl: createStorageFetch({ leakSiblingToStudent: true })
});
assert.equal(leaked.verification_status, "live_storage_read_policy_failed");
assert.equal(leaked.live_same_org_cross_athlete_denial_verified, false);
assert.equal(leaked.live_storage_read_policy_verified, false);

const serialized = JSON.stringify(live);
for (const hidden of [
  fakeEnv.NEXT_PUBLIC_SUPABASE_URL,
  fakeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fakeEnv.SUPABASE_SERVICE_ROLE_KEY,
  fakeEnv.ARC_LAB_RLS_COACH_ACCESS_TOKEN,
  fakeEnv.ARC_LAB_RLS_STUDENT_ACCESS_TOKEN,
  ...Object.values(keys)
]) {
  assert(!serialized.includes(hidden), "Storage verification output leaked protected value");
}

const serverSource = await readFile(path.join(root, "server", "index.mjs"), "utf8");
assert(serverSource.includes('url.pathname === "/api/arc-lab-supabase-storage-live-verification"'));
assert(serverSource.includes("auditArcLabSupabaseStorageLiveVerification({ env: process.env })"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_supabase_storage_live_verification_smoke.v1",
  source_contract: "opt_in_read_only_storage_role_probe_default_no_external_contact",
  default_status: skipped.verification_status,
  blocked_status: blocked.verification_status,
  mock_live_status: live.verification_status,
  mock_leak_status: leaked.verification_status,
  endpoint_binding: true,
  fixture_probe_count: live.probes.fixture_preflight.length,
  role_probe_count: live.probes.role_results.length,
  live_external_services_contacted_by_default: skipped.live_external_services_contacted,
  boundaries: live.boundaries
}, null, 2));

function createStorageFetch({ calls = [], leakSiblingToStudent = false } = {}) {
  return async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    const prefix = "/storage/v1/object/authenticated/arc-lab-videos/";
    const objectKey = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/")
      : "";
    const authorization = init.headers?.authorization;
    const actor = authorization === `Bearer ${fakeEnv.SUPABASE_SERVICE_ROLE_KEY}`
      ? "service"
      : authorization === `Bearer ${fakeEnv.ARC_LAB_RLS_COACH_ACCESS_TOKEN}`
        ? "coach"
        : "student";
    const fixture = Object.entries(keys).find(([, key]) => key === objectKey)?.[0] || "unknown";
    calls.push({ actor, fixture });

    let visible = actor === "service";
    if (actor === "coach") visible = objectKey !== keys.crossOrg;
    if (actor === "student") {
      visible = objectKey === keys.ownVisible || (leakSiblingToStudent && objectKey === keys.sibling);
    }
    return {
      status: visible ? 206 : 404,
      body: { cancel: async () => {} }
    };
  };
}

async function forbiddenFetch() {
  throw new Error("fetch should not be called");
}
