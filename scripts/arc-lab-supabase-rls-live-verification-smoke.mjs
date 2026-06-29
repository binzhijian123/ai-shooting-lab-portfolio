import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditArcLabSupabaseRlsLiveVerification,
  validateArcLabSupabaseRlsLiveVerificationGate
} from "../server/arcLabSupabaseRlsLiveVerification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ids = {
  ownOrg: "11111111-1111-4111-8111-111111111111",
  crossOrg: "22222222-2222-4222-8222-222222222222",
  ownAthlete: "33333333-3333-4333-8333-333333333333",
  crossAthlete: "44444444-4444-4444-8444-444444444444",
  aiDraft: "55555555-5555-4555-8555-555555555555",
  taskDraft: "66666666-6666-4666-8666-666666666666",
  publishedFeedback: "77777777-7777-4777-8777-777777777777",
  unpublishedFeedback: "88888888-8888-4888-8888-888888888888",
  publishedTask: "99999999-9999-4999-8999-999999999999",
  unpublishedTask: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  session: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
};
const fakeEnv = {
  ARC_LAB_LIVE_RLS_VERIFY: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://arc-lab-rls-example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-secret-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-placeholder",
  ARC_LAB_RLS_COACH_ACCESS_TOKEN: "coach-token-secret-placeholder",
  ARC_LAB_RLS_STUDENT_ACCESS_TOKEN: "student-token-secret-placeholder",
  ARC_LAB_RLS_OWN_ORG_ID: ids.ownOrg,
  ARC_LAB_RLS_OWN_ATHLETE_ID: ids.ownAthlete,
  ARC_LAB_RLS_CROSS_ORG_ATHLETE_ID: ids.crossAthlete,
  ARC_LAB_RLS_AI_REPORT_DRAFT_ID: ids.aiDraft,
  ARC_LAB_RLS_TRAINING_TASK_DRAFT_ID: ids.taskDraft,
  ARC_LAB_RLS_PUBLISHED_FEEDBACK_ID: ids.publishedFeedback,
  ARC_LAB_RLS_UNPUBLISHED_FEEDBACK_ID: ids.unpublishedFeedback,
  ARC_LAB_RLS_PUBLISHED_TASK_ID: ids.publishedTask,
  ARC_LAB_RLS_UNPUBLISHED_TASK_ID: ids.unpublishedTask
};

const skipped = await auditArcLabSupabaseRlsLiveVerification({ env: {}, fetchImpl: forbiddenFetch });
assert.equal(validateArcLabSupabaseRlsLiveVerificationGate(skipped).ok, true);
assert.equal(skipped.verification_status, "skipped_not_requested");
assert.equal(skipped.live_external_services_contacted, false);
assert.equal(skipped.live_rls_policy_effect_verified, false);

const blocked = await auditArcLabSupabaseRlsLiveVerification({
  env: { ARC_LAB_LIVE_RLS_VERIFY: "1" },
  fetchImpl: forbiddenFetch
});
assert.equal(validateArcLabSupabaseRlsLiveVerificationGate(blocked).ok, true);
assert.equal(blocked.verification_status, "blocked_missing_environment");
assert.equal(blocked.live_external_services_contacted, false);

const calls = [];
const live = await auditArcLabSupabaseRlsLiveVerification({
  env: fakeEnv,
  fetchImpl: createRlsFetch({ calls })
});
const liveValidation = validateArcLabSupabaseRlsLiveVerificationGate(live);
assert.equal(liveValidation.ok, true, liveValidation.errors.join("\n"));
assert.equal(live.verification_status, "live_rls_role_behavior_verified");
assert.equal(live.live_fixture_preflight_verified, true);
assert.equal(live.live_coach_access_verified, true);
assert.equal(live.live_student_draft_isolation_verified, true);
assert.equal(live.live_student_published_only_verified, true);
assert.equal(live.live_cross_organization_denial_verified, true);
assert.equal(live.live_rls_policy_effect_verified, true);
assert.equal(live.probes.fixture_preflight.length, 8);
assert.equal(live.probes.role_results.length, 16);
assert.equal(calls.length, 24);

const leaked = await auditArcLabSupabaseRlsLiveVerification({
  env: fakeEnv,
  fetchImpl: createRlsFetch({ leakUnpublishedFeedback: true })
});
assert.equal(leaked.verification_status, "live_rls_role_behavior_failed");
assert.equal(leaked.live_student_published_only_verified, false);
assert.equal(leaked.live_rls_policy_effect_verified, false);

const serialized = JSON.stringify(live);
for (const hidden of [
  fakeEnv.NEXT_PUBLIC_SUPABASE_URL,
  fakeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fakeEnv.SUPABASE_SERVICE_ROLE_KEY,
  fakeEnv.ARC_LAB_RLS_COACH_ACCESS_TOKEN,
  fakeEnv.ARC_LAB_RLS_STUDENT_ACCESS_TOKEN,
  ...Object.values(ids)
]) {
  assert(!serialized.includes(hidden), `RLS verification output leaked protected value`);
}

const serverSource = await readFile(path.join(root, "server", "index.mjs"), "utf8");
assert(serverSource.includes('url.pathname === "/api/arc-lab-supabase-rls-live-verification"'));
assert(serverSource.includes("auditArcLabSupabaseRlsLiveVerification({ env: process.env })"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_supabase_rls_live_verification_smoke.v1",
  source_contract: "opt_in_read_only_live_rls_role_probe_default_no_external_contact",
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

function createRlsFetch({ calls = [], leakUnpublishedFeedback = false } = {}) {
  const rows = [
    { table: "athletes", id: ids.ownAthlete, organization_id: ids.ownOrg },
    { table: "athletes", id: ids.crossAthlete, organization_id: ids.crossOrg },
    { table: "ai_report_drafts", id: ids.aiDraft, organization_id: ids.ownOrg },
    { table: "training_task_drafts", id: ids.taskDraft, organization_id: ids.ownOrg, athlete_id: ids.ownAthlete },
    { table: "coach_feedback", id: ids.publishedFeedback, organization_id: ids.ownOrg, session_id: ids.session, published_at: "2026-06-28T00:00:00Z" },
    { table: "coach_feedback", id: ids.unpublishedFeedback, organization_id: ids.ownOrg, session_id: ids.session, published_at: null },
    { table: "training_tasks", id: ids.publishedTask, organization_id: ids.ownOrg, athlete_id: ids.ownAthlete, published_at: "2026-06-28T00:00:00Z" },
    { table: "training_tasks", id: ids.unpublishedTask, organization_id: ids.ownOrg, athlete_id: ids.ownAthlete, published_at: null }
  ];

  return async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    const table = url.pathname.split("/").pop();
    const id = String(url.searchParams.get("id") || "").replace(/^eq\./, "");
    const authorization = init.headers?.authorization;
    const actor = authorization === `Bearer ${fakeEnv.SUPABASE_SERVICE_ROLE_KEY}`
      ? "service"
      : authorization === `Bearer ${fakeEnv.ARC_LAB_RLS_COACH_ACCESS_TOKEN}`
        ? "coach"
        : "student";
    calls.push({ table, actor });
    const row = rows.find((candidate) => candidate.table === table && candidate.id === id);
    let visible = Boolean(row);
    if (row && actor === "coach") visible = row.organization_id === ids.ownOrg;
    if (row && actor === "student") {
      visible = row.organization_id === ids.ownOrg
        && (
          (table === "athletes" && row.id === ids.ownAthlete)
          || (table === "coach_feedback" && (row.published_at !== null || leakUnpublishedFeedback))
          || (table === "training_tasks" && row.published_at !== null)
        );
    }
    return { status: 200, json: async () => visible ? [{ ...row }] : [] };
  };
}

async function forbiddenFetch() {
  throw new Error("fetch should not be called");
}
