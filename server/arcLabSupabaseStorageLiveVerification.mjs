export const ARC_LAB_SUPABASE_STORAGE_LIVE_VERIFICATION_SCHEMA_VERSION = "arc_lab_supabase_storage_live_verification.v1";

const LIVE_VERIFY_FLAG = "1";
const REQUIRED_ENV = [
  "ARC_LAB_LIVE_STORAGE_RLS_VERIFY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARC_LAB_RLS_COACH_ACCESS_TOKEN",
  "ARC_LAB_RLS_STUDENT_ACCESS_TOKEN",
  "ARC_LAB_STORAGE_BUCKET",
  "ARC_LAB_STORAGE_OWN_VISIBLE_OBJECT_KEY",
  "ARC_LAB_STORAGE_OWN_HIDDEN_OBJECT_KEY",
  "ARC_LAB_STORAGE_SIBLING_OBJECT_KEY",
  "ARC_LAB_STORAGE_CROSS_ORG_OBJECT_KEY"
];

const FIXTURES = [
  ["own_visible", "ARC_LAB_STORAGE_OWN_VISIBLE_OBJECT_KEY"],
  ["own_hidden", "ARC_LAB_STORAGE_OWN_HIDDEN_OBJECT_KEY"],
  ["sibling", "ARC_LAB_STORAGE_SIBLING_OBJECT_KEY"],
  ["cross_org", "ARC_LAB_STORAGE_CROSS_ORG_OBJECT_KEY"]
].map(([name, envName]) => ({ name, envName }));

export async function auditArcLabSupabaseStorageLiveVerification({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const requested = env?.ARC_LAB_LIVE_STORAGE_RLS_VERIFY === LIVE_VERIFY_FLAG;
  const presentVariables = REQUIRED_ENV.filter((name) => hasEnv(env, name));
  const missingVariables = REQUIRED_ENV.filter((name) => !hasEnv(env, name));
  const base = {
    ok: true,
    schema_version: ARC_LAB_SUPABASE_STORAGE_LIVE_VERIFICATION_SCHEMA_VERSION,
    source_contract: "opt_in_read_only_storage_role_probe_with_range_one_byte_and_service_preflight",
    live_verification_requested: requested,
    live_external_services_contacted: false,
    live_fixture_preflight_verified: false,
    live_coach_storage_access_verified: false,
    live_student_own_visible_storage_verified: false,
    live_student_hidden_storage_denial_verified: false,
    live_same_org_cross_athlete_denial_verified: false,
    live_cross_organization_storage_denial_verified: false,
    live_storage_read_policy_verified: false,
    environment: {
      required_variables: REQUIRED_ENV,
      present_variables: presentVariables,
      missing_variables: missingVariables,
      secret_values_exposed: false
    },
    checked: {
      fixture_count: FIXTURES.length,
      role_probe_count: 8,
      object_keys_exposed: false,
      probe_mode: "read_only_storage_get_range_bytes_0_0"
    },
    boundaries: {
      opt_in_required: true,
      no_migration_apply: true,
      no_database_mutation: true,
      no_storage_object_write_update_or_delete: true,
      no_full_object_download: true,
      no_sms_provider_contact: true,
      no_secret_or_object_key_exposure: true,
      service_role_used_for_fixture_preflight_only: true
    }
  };

  if (!requested) {
    return {
      ...base,
      verification_status: "skipped_not_requested",
      next_manual_steps: [
        "Create four dedicated staging objects mapped to visible, hidden, sibling-athlete, and cross-organization video assets.",
        "Set ARC_LAB_LIVE_STORAGE_RLS_VERIFY=1 and required values outside the repository.",
        "Run scripts/arc-lab-supabase-storage-live-verification-smoke.mjs without printing tokens or object keys."
      ]
    };
  }

  if (missingVariables.length > 0) {
    return {
      ...base,
      verification_status: "blocked_missing_environment",
      next_manual_steps: [
        "Provide dedicated staging role tokens, bucket, and object keys outside the repository.",
        "Do not use production videos or commit object-key values."
      ]
    };
  }

  if (typeof fetchImpl !== "function") {
    return { ...base, verification_status: "blocked_missing_fetch_runtime", errors: ["fetch runtime is not available"] };
  }

  const normalizedUrl = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const fixturePaths = Object.fromEntries(FIXTURES.map((fixture) => [fixture.name, parseObjectKey(env[fixture.envName])]));
  const fixtureErrors = validateFixturePaths(fixturePaths);
  if (!normalizedUrl.ok || fixtureErrors.length > 0) {
    return {
      ...base,
      verification_status: "blocked_invalid_environment",
      errors: [...(normalizedUrl.ok ? [] : [normalizedUrl.error]), ...fixtureErrors]
    };
  }

  const serviceHeaders = supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SERVICE_ROLE_KEY);
  const preflightResults = [];
  for (const fixture of FIXTURES) {
    preflightResults.push(await fetchObjectStatus({
      fetchImpl,
      baseUrl: normalizedUrl.value,
      bucket: env.ARC_LAB_STORAGE_BUCKET,
      objectKey: env[fixture.envName],
      headers: serviceHeaders,
      fixture: fixture.name
    }));
  }
  const publicPreflight = preflightResults.map(publicProbeSummary);
  const preflightVerified = preflightResults.every((result) => result.visible);
  if (!preflightVerified) {
    return {
      ...base,
      verification_status: "blocked_fixture_preflight_failed",
      live_external_services_contacted: true,
      probes: { fixture_preflight: publicPreflight },
      errors: preflightResults.filter((result) => !result.visible).map((result) => `${result.fixture} object must exist for service preflight`)
    };
  }

  const roleSpecs = buildRoleSpecs();
  const roleResults = [];
  for (const spec of roleSpecs) {
    const fixture = FIXTURES.find((item) => item.name === spec.fixture);
    const token = spec.actor === "coach"
      ? env.ARC_LAB_RLS_COACH_ACCESS_TOKEN
      : env.ARC_LAB_RLS_STUDENT_ACCESS_TOKEN;
    const result = await fetchObjectStatus({
      fetchImpl,
      baseUrl: normalizedUrl.value,
      bucket: env.ARC_LAB_STORAGE_BUCKET,
      objectKey: env[fixture.envName],
      headers: supabaseHeaders(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token),
      fixture: fixture.name
    });
    roleResults.push({ ...result, actor: spec.actor, expected_visible: spec.expectedVisible });
  }

  const publicRoleResults = roleResults.map((result) => ({
    ...publicProbeSummary(result),
    actor: result.actor,
    expected_visible: result.expected_visible,
    passed: result.visible === result.expected_visible
  }));
  const passed = (actor, fixture) => publicRoleResults
    .some((result) => result.actor === actor && result.fixture === fixture && result.passed);
  const coachAccessVerified = ["own_visible", "own_hidden", "sibling", "cross_org"]
    .every((fixture) => passed("coach", fixture));
  const studentOwnVisibleVerified = passed("student", "own_visible");
  const studentHiddenDenied = passed("student", "own_hidden");
  const siblingDenied = passed("student", "sibling");
  const crossOrgDenied = passed("coach", "cross_org") && passed("student", "cross_org");
  const allPassed = publicRoleResults.every((result) => result.passed)
    && coachAccessVerified
    && studentOwnVisibleVerified
    && studentHiddenDenied
    && siblingDenied
    && crossOrgDenied;

  return {
    ...base,
    verification_status: allPassed ? "live_storage_read_policy_verified" : "live_storage_read_policy_failed",
    live_external_services_contacted: true,
    live_fixture_preflight_verified: true,
    live_coach_storage_access_verified: coachAccessVerified,
    live_student_own_visible_storage_verified: studentOwnVisibleVerified,
    live_student_hidden_storage_denial_verified: studentHiddenDenied,
    live_same_org_cross_athlete_denial_verified: siblingDenied,
    live_cross_organization_storage_denial_verified: crossOrgDenied,
    live_storage_read_policy_verified: allPassed,
    probes: {
      fixture_preflight: publicPreflight,
      role_results: publicRoleResults
    },
    next_manual_steps: allPassed
      ? ["Rerun this read-only staging probe after every Storage or video-visibility policy change."]
      : ["Inspect failed Storage role probes before enabling production uploads."]
  };
}

export function validateArcLabSupabaseStorageLiveVerificationGate(input = {}) {
  const errors = [];
  if (input.schema_version !== ARC_LAB_SUPABASE_STORAGE_LIVE_VERIFICATION_SCHEMA_VERSION) {
    errors.push("schema version mismatch");
  }
  if (input.environment?.secret_values_exposed !== false) errors.push("Storage live gate must not expose secret values");
  if (input.live_verification_requested !== true && input.live_external_services_contacted !== false) {
    errors.push("Storage live gate must not contact external services without opt-in");
  }
  if (input.live_storage_read_policy_verified === true) {
    for (const field of [
      "live_fixture_preflight_verified",
      "live_coach_storage_access_verified",
      "live_student_own_visible_storage_verified",
      "live_student_hidden_storage_denial_verified",
      "live_same_org_cross_athlete_denial_verified",
      "live_cross_organization_storage_denial_verified"
    ]) {
      if (input[field] !== true) errors.push(`Storage verification requires ${field}`);
    }
  }
  if (input.boundaries?.no_storage_object_write_update_or_delete !== true) {
    errors.push("Storage live gate must not mutate objects");
  }
  if (input.boundaries?.no_secret_or_object_key_exposure !== true) {
    errors.push("Storage live gate must hide secrets and object keys");
  }
  if (input.checked?.object_keys_exposed !== false) errors.push("Storage live gate must not expose object keys");

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_supabase_storage_live_verification_validation.v1",
    errors,
    checked: input.checked,
    boundaries: input.boundaries
  };
}

function buildRoleSpecs() {
  return [
    { actor: "coach", fixture: "own_visible", expectedVisible: true },
    { actor: "coach", fixture: "own_hidden", expectedVisible: true },
    { actor: "coach", fixture: "sibling", expectedVisible: true },
    { actor: "coach", fixture: "cross_org", expectedVisible: false },
    { actor: "student", fixture: "own_visible", expectedVisible: true },
    { actor: "student", fixture: "own_hidden", expectedVisible: false },
    { actor: "student", fixture: "sibling", expectedVisible: false },
    { actor: "student", fixture: "cross_org", expectedVisible: false }
  ];
}

function validateFixturePaths(paths) {
  const errors = [];
  for (const fixture of FIXTURES) {
    if (!paths[fixture.name].ok) errors.push(`${fixture.envName} must use organization_uuid/athlete_uuid/object_path`);
  }
  if (errors.length > 0) return errors;
  if (paths.own_visible.organizationId !== paths.own_hidden.organizationId
    || paths.own_visible.athleteId !== paths.own_hidden.athleteId) {
    errors.push("own visible and hidden objects must share organization and athlete prefixes");
  }
  if (paths.sibling.organizationId !== paths.own_visible.organizationId
    || paths.sibling.athleteId === paths.own_visible.athleteId) {
    errors.push("sibling object must use the same organization and a different athlete prefix");
  }
  if (paths.cross_org.organizationId === paths.own_visible.organizationId) {
    errors.push("cross organization object must use a different organization prefix");
  }
  return errors;
}

function parseObjectKey(value) {
  const text = String(value || "").trim();
  const segments = text.split("/");
  const safe = !text.startsWith("/")
    && !text.includes("\\")
    && segments.length >= 3
    && segments.every((segment) => segment && segment !== "." && segment !== "..")
    && isUuid(segments[0])
    && isUuid(segments[1]);
  return { ok: safe, organizationId: segments[0] || null, athleteId: segments[1] || null };
}

async function fetchObjectStatus({ fetchImpl, baseUrl, bucket, objectKey, headers, fixture }) {
  const encodedPath = objectKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(`/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`, baseUrl);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { ...headers, Range: "bytes=0-0" } });
    const status = Number(response?.status) || null;
    if (typeof response?.body?.cancel === "function") await response.body.cancel();
    return { fixture, status, visible: status !== null && status >= 200 && status < 300 };
  } catch {
    return { fixture, status: null, visible: false };
  }
}

function publicProbeSummary(result) {
  return { fixture: result.fixture, status: result.status, visible: result.visible };
}

function supabaseHeaders(apiKey, accessToken) {
  return { apikey: apiKey, authorization: `Bearer ${accessToken}` };
}

function normalizeSupabaseUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL must use https" };
    return { ok: true, value: url.origin };
  } catch {
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL" };
  }
}

function hasEnv(env, name) {
  return String(env?.[name] || "").trim().length > 0;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
