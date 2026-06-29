export const ARC_LAB_SUPABASE_RLS_LIVE_VERIFICATION_SCHEMA_VERSION = "arc_lab_supabase_rls_live_verification.v1";

const LIVE_VERIFY_FLAG = "1";
const REQUIRED_ENV = [
  "ARC_LAB_LIVE_RLS_VERIFY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARC_LAB_RLS_COACH_ACCESS_TOKEN",
  "ARC_LAB_RLS_STUDENT_ACCESS_TOKEN",
  "ARC_LAB_RLS_OWN_ORG_ID",
  "ARC_LAB_RLS_OWN_ATHLETE_ID",
  "ARC_LAB_RLS_CROSS_ORG_ATHLETE_ID",
  "ARC_LAB_RLS_AI_REPORT_DRAFT_ID",
  "ARC_LAB_RLS_TRAINING_TASK_DRAFT_ID",
  "ARC_LAB_RLS_PUBLISHED_FEEDBACK_ID",
  "ARC_LAB_RLS_UNPUBLISHED_FEEDBACK_ID",
  "ARC_LAB_RLS_PUBLISHED_TASK_ID",
  "ARC_LAB_RLS_UNPUBLISHED_TASK_ID"
];

const FIXTURES = [
  ["own_athlete", "athletes", "ARC_LAB_RLS_OWN_ATHLETE_ID", "id,organization_id"],
  ["cross_org_athlete", "athletes", "ARC_LAB_RLS_CROSS_ORG_ATHLETE_ID", "id,organization_id"],
  ["ai_report_draft", "ai_report_drafts", "ARC_LAB_RLS_AI_REPORT_DRAFT_ID", "id,organization_id"],
  ["training_task_draft", "training_task_drafts", "ARC_LAB_RLS_TRAINING_TASK_DRAFT_ID", "id,organization_id,athlete_id"],
  ["published_feedback", "coach_feedback", "ARC_LAB_RLS_PUBLISHED_FEEDBACK_ID", "id,organization_id,session_id,published_at"],
  ["unpublished_feedback", "coach_feedback", "ARC_LAB_RLS_UNPUBLISHED_FEEDBACK_ID", "id,organization_id,session_id,published_at"],
  ["published_task", "training_tasks", "ARC_LAB_RLS_PUBLISHED_TASK_ID", "id,organization_id,athlete_id,published_at"],
  ["unpublished_task", "training_tasks", "ARC_LAB_RLS_UNPUBLISHED_TASK_ID", "id,organization_id,athlete_id,published_at"]
].map(([name, table, envName, select]) => ({ name, table, envName, select }));

export async function auditArcLabSupabaseRlsLiveVerification({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const requested = env?.ARC_LAB_LIVE_RLS_VERIFY === LIVE_VERIFY_FLAG;
  const presentVariables = REQUIRED_ENV.filter((name) => hasEnv(env, name));
  const missingVariables = REQUIRED_ENV.filter((name) => !hasEnv(env, name));
  const base = {
    ok: true,
    schema_version: ARC_LAB_SUPABASE_RLS_LIVE_VERIFICATION_SCHEMA_VERSION,
    source_contract: "opt_in_read_only_live_rls_role_probe_with_service_fixture_preflight",
    live_verification_requested: requested,
    live_external_services_contacted: false,
    live_fixture_preflight_verified: false,
    live_coach_access_verified: false,
    live_student_draft_isolation_verified: false,
    live_student_published_only_verified: false,
    live_cross_organization_denial_verified: false,
    live_rls_policy_effect_verified: false,
    environment: {
      required_variables: REQUIRED_ENV,
      present_variables: presentVariables,
      missing_variables: missingVariables,
      secret_values_exposed: false
    },
    checked: {
      fixture_count: FIXTURES.length,
      role_probe_count: 16,
      fixture_ids_exposed: false,
      probe_mode: "read_only_exact_id_postgrest_queries"
    },
    boundaries: {
      opt_in_required: true,
      no_migration_apply: true,
      no_database_mutation: true,
      no_storage_access: true,
      no_sms_provider_contact: true,
      no_secret_or_fixture_id_exposure: true,
      service_role_used_for_fixture_preflight_only: true
    }
  };

  if (!requested) {
    return {
      ...base,
      verification_status: "skipped_not_requested",
      next_manual_steps: [
        "Create dedicated staging coach and student users plus the documented fixture rows.",
        "Set ARC_LAB_LIVE_RLS_VERIFY=1 and required values outside the repository.",
        "Run scripts/arc-lab-supabase-rls-live-verification-smoke.mjs without printing tokens."
      ]
    };
  }

  if (missingVariables.length > 0) {
    return {
      ...base,
      verification_status: "blocked_missing_environment",
      next_manual_steps: [
        "Provide all dedicated staging role tokens and fixture IDs outside the repository.",
        "Do not use production users or commit token values."
      ]
    };
  }

  if (typeof fetchImpl !== "function") {
    return { ...base, verification_status: "blocked_missing_fetch_runtime", errors: ["fetch runtime is not available"] };
  }

  const normalizedUrl = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const invalidFixtureVariables = FIXTURES
    .map((fixture) => fixture.envName)
    .concat("ARC_LAB_RLS_OWN_ORG_ID")
    .filter((name) => !isUuid(env[name]));
  if (!normalizedUrl.ok || invalidFixtureVariables.length > 0) {
    return {
      ...base,
      verification_status: "blocked_invalid_environment",
      errors: [
        ...(normalizedUrl.ok ? [] : [normalizedUrl.error]),
        ...invalidFixtureVariables.map((name) => `${name} must be a UUID`)
      ]
    };
  }

  const serviceHeaders = supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SERVICE_ROLE_KEY);
  const fixtureResults = [];
  for (const fixture of FIXTURES) {
    fixtureResults.push(await fetchRows({
      fetchImpl,
      baseUrl: normalizedUrl.value,
      headers: serviceHeaders,
      fixture,
      id: env[fixture.envName]
    }));
  }

  const fixtureRows = Object.fromEntries(fixtureResults.map((result) => [result.fixture, result.rows?.[0]]));
  const fixtureErrors = validateFixtureRows(fixtureRows, env);
  const fixturePreflightVerified = fixtureResults.every((result) => result.ok && result.count === 1)
    && fixtureErrors.length === 0;
  const fixtureSummaries = fixtureResults.map(publicProbeSummary);

  if (!fixturePreflightVerified) {
    return {
      ...base,
      verification_status: "blocked_fixture_preflight_failed",
      live_external_services_contacted: true,
      probes: { fixture_preflight: fixtureSummaries },
      errors: [
        ...fixtureResults.filter((result) => !result.ok || result.count !== 1).map((result) => `${result.fixture} fixture must resolve to exactly one row`),
        ...fixtureErrors
      ]
    };
  }

  const fixturesByName = Object.fromEntries(FIXTURES.map((fixture) => [fixture.name, fixture]));
  const roleProbeSpecs = buildRoleProbeSpecs();
  const roleResults = [];
  for (const spec of roleProbeSpecs) {
    const fixture = fixturesByName[spec.fixture];
    const token = spec.actor === "coach"
      ? env.ARC_LAB_RLS_COACH_ACCESS_TOKEN
      : env.ARC_LAB_RLS_STUDENT_ACCESS_TOKEN;
    const result = await fetchRows({
      fetchImpl,
      baseUrl: normalizedUrl.value,
      headers: supabaseHeaders(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token),
      fixture,
      id: env[fixture.envName]
    });
    roleResults.push({ ...result, actor: spec.actor, expected_count: spec.expectedCount });
  }

  const publicRoleResults = roleResults.map((result) => ({
    ...publicProbeSummary(result),
    actor: result.actor,
    expected_count: result.expected_count,
    passed: result.ok && result.count === result.expected_count
  }));
  const categoryPassed = (actor, fixtureNames) => publicRoleResults
    .filter((result) => result.actor === actor && fixtureNames.includes(result.fixture))
    .every((result) => result.passed);
  const coachAccessVerified = categoryPassed("coach", [
    "own_athlete", "ai_report_draft", "training_task_draft", "published_feedback",
    "unpublished_feedback", "published_task", "unpublished_task"
  ]);
  const studentDraftIsolationVerified = categoryPassed("student", ["ai_report_draft", "training_task_draft"]);
  const studentPublishedOnlyVerified = categoryPassed("student", [
    "published_feedback", "unpublished_feedback", "published_task", "unpublished_task"
  ]);
  const crossOrganizationDenialVerified = categoryPassed("coach", ["cross_org_athlete"])
    && categoryPassed("student", ["cross_org_athlete"]);
  const ownStudentBindingVerified = categoryPassed("student", ["own_athlete"]);
  const allPassed = publicRoleResults.every((result) => result.passed)
    && coachAccessVerified
    && studentDraftIsolationVerified
    && studentPublishedOnlyVerified
    && crossOrganizationDenialVerified
    && ownStudentBindingVerified;

  return {
    ...base,
    verification_status: allPassed ? "live_rls_role_behavior_verified" : "live_rls_role_behavior_failed",
    live_external_services_contacted: true,
    live_fixture_preflight_verified: true,
    live_coach_access_verified: coachAccessVerified,
    live_student_draft_isolation_verified: studentDraftIsolationVerified,
    live_student_published_only_verified: studentPublishedOnlyVerified && ownStudentBindingVerified,
    live_cross_organization_denial_verified: crossOrganizationDenialVerified,
    live_rls_policy_effect_verified: allPassed,
    probes: {
      fixture_preflight: fixtureSummaries,
      role_results: publicRoleResults
    },
    next_manual_steps: allPassed
      ? ["Keep the dedicated staging fixtures isolated and rerun after every RLS migration change."]
      : ["Inspect failed role probes in staging before applying this migration to production."]
  };
}

export function validateArcLabSupabaseRlsLiveVerificationGate(input = {}) {
  const errors = [];
  if (input.schema_version !== ARC_LAB_SUPABASE_RLS_LIVE_VERIFICATION_SCHEMA_VERSION) {
    errors.push("schema version mismatch");
  }
  if (input.environment?.secret_values_exposed !== false) errors.push("RLS live gate must not expose secret values");
  if (input.live_verification_requested !== true && input.live_external_services_contacted !== false) {
    errors.push("RLS live gate must not contact external services without opt-in");
  }
  if (input.live_rls_policy_effect_verified === true) {
    for (const field of [
      "live_fixture_preflight_verified",
      "live_coach_access_verified",
      "live_student_draft_isolation_verified",
      "live_student_published_only_verified",
      "live_cross_organization_denial_verified"
    ]) {
      if (input[field] !== true) errors.push(`RLS verification requires ${field}`);
    }
  }
  if (input.boundaries?.no_database_mutation !== true) errors.push("RLS live gate must stay read-only");
  if (input.boundaries?.no_secret_or_fixture_id_exposure !== true) errors.push("RLS live gate must hide secrets and fixture IDs");
  if (input.checked?.fixture_ids_exposed !== false) errors.push("RLS live gate must not expose fixture IDs");

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_supabase_rls_live_verification_validation.v1",
    errors,
    checked: input.checked,
    boundaries: input.boundaries
  };
}

function buildRoleProbeSpecs() {
  return [
    ...["own_athlete", "ai_report_draft", "training_task_draft", "published_feedback", "unpublished_feedback", "published_task", "unpublished_task"]
      .map((fixture) => ({ actor: "coach", fixture, expectedCount: 1 })),
    { actor: "coach", fixture: "cross_org_athlete", expectedCount: 0 },
    { actor: "student", fixture: "own_athlete", expectedCount: 1 },
    { actor: "student", fixture: "ai_report_draft", expectedCount: 0 },
    { actor: "student", fixture: "training_task_draft", expectedCount: 0 },
    { actor: "student", fixture: "published_feedback", expectedCount: 1 },
    { actor: "student", fixture: "unpublished_feedback", expectedCount: 0 },
    { actor: "student", fixture: "published_task", expectedCount: 1 },
    { actor: "student", fixture: "unpublished_task", expectedCount: 0 },
    { actor: "student", fixture: "cross_org_athlete", expectedCount: 0 }
  ];
}

function validateFixtureRows(rows, env) {
  const errors = [];
  const ownOrgId = env.ARC_LAB_RLS_OWN_ORG_ID;
  const ownAthleteId = env.ARC_LAB_RLS_OWN_ATHLETE_ID;
  for (const name of ["own_athlete", "ai_report_draft", "training_task_draft", "published_feedback", "unpublished_feedback", "published_task", "unpublished_task"]) {
    if (rows[name]?.organization_id !== ownOrgId) errors.push(`${name} fixture must belong to the own organization`);
  }
  if (rows.cross_org_athlete?.organization_id === ownOrgId) errors.push("cross_org_athlete fixture must belong to another organization");
  for (const name of ["training_task_draft", "published_task", "unpublished_task"]) {
    if (rows[name]?.athlete_id !== ownAthleteId) errors.push(`${name} fixture must belong to the own athlete`);
  }
  if (!rows.published_feedback?.published_at) errors.push("published_feedback fixture must have published_at");
  if (rows.unpublished_feedback?.published_at != null) errors.push("unpublished_feedback fixture must not have published_at");
  if (rows.published_feedback?.session_id !== rows.unpublished_feedback?.session_id) {
    errors.push("published and unpublished feedback fixtures must share one visible session");
  }
  if (!rows.published_task?.published_at) errors.push("published_task fixture must have published_at");
  if (rows.unpublished_task?.published_at != null) errors.push("unpublished_task fixture must not have published_at");
  return errors;
}

async function fetchRows({ fetchImpl, baseUrl, headers, fixture, id }) {
  const url = new URL(`/rest/v1/${fixture.table}`, baseUrl);
  url.searchParams.set("select", fixture.select);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("limit", "2");
  try {
    const response = await fetchImpl(url, { method: "GET", headers });
    const status = Number(response?.status) || null;
    const statusOk = status !== null && status >= 200 && status < 300;
    const rows = statusOk && typeof response.json === "function" ? await response.json() : null;
    return {
      fixture: fixture.name,
      table: fixture.table,
      status,
      ok: statusOk && Array.isArray(rows),
      count: Array.isArray(rows) ? rows.length : null,
      rows: Array.isArray(rows) ? rows : null
    };
  } catch {
    return { fixture: fixture.name, table: fixture.table, status: null, ok: false, count: null, rows: null };
  }
}

function publicProbeSummary(result) {
  return {
    fixture: result.fixture,
    table: result.table,
    status: result.status,
    ok: result.ok,
    count: result.count
  };
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
