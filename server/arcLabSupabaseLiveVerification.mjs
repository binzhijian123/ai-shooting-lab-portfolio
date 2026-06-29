import { ARC_LAB_DATA_MODEL_TABLES } from "./arcLabPlatform.mjs";

export const ARC_LAB_SUPABASE_LIVE_VERIFICATION_SCHEMA_VERSION = "arc_lab_supabase_live_verification.v1";

const REQUIRED_LIVE_ENV = [
  "ARC_LAB_LIVE_SUPABASE_VERIFY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARC_LAB_STORAGE_BUCKET"
];

const LIVE_VERIFY_FLAG = "1";

export async function auditArcLabSupabaseLiveVerification({
  env = process.env,
  fetchImpl = globalThis.fetch,
  tableNames = ARC_LAB_DATA_MODEL_TABLES
} = {}) {
  const requested = env?.ARC_LAB_LIVE_SUPABASE_VERIFY === LIVE_VERIFY_FLAG;
  const presentVariables = REQUIRED_LIVE_ENV.filter((name) => hasEnv(env, name));
  const missingVariables = REQUIRED_LIVE_ENV.filter((name) => !hasEnv(env, name));
  const base = {
    ok: true,
    schema_version: ARC_LAB_SUPABASE_LIVE_VERIFICATION_SCHEMA_VERSION,
    source_contract: "opt_in_live_supabase_read_only_probe_no_secret_exposure",
    live_verification_requested: requested,
    live_external_services_contacted: false,
    live_supabase_project_verified: false,
    live_rest_schema_surface_verified: false,
    live_storage_bucket_verified: false,
    live_rls_policy_effect_verified: false,
    live_sms_provider_verified: false,
    environment: {
      required_variables: REQUIRED_LIVE_ENV,
      present_variables: presentVariables,
      missing_variables: missingVariables,
      secret_values_exposed: false
    },
    checked: {
      table_count: tableNames.length,
      storage_bucket_expected: env?.ARC_LAB_STORAGE_BUCKET || "arc-lab-videos",
      probe_mode: "read_only_http_status_only"
    },
    boundaries: {
      opt_in_required: true,
      no_migration_apply: true,
      no_database_mutation: true,
      no_storage_object_upload: true,
      no_secret_values_exposed: true,
      rls_effect_requires_separate_role_user_probe: true,
      sms_provider_not_contacted: true
    }
  };

  if (!requested) {
    return {
      ...base,
      verification_status: "skipped_not_requested",
      next_manual_steps: [
        "Set ARC_LAB_LIVE_SUPABASE_VERIFY=1 outside the repository when ready to run read-only live probes.",
        "Provide Supabase URL, anon key, service role key, and ARC_LAB_STORAGE_BUCKET through local environment variables.",
        "Run scripts/arc-lab-supabase-live-verification-smoke.mjs; do not commit secret values."
      ]
    };
  }

  if (missingVariables.length > 0) {
    return {
      ...base,
      verification_status: "blocked_missing_environment",
      next_manual_steps: [
        "Fill missing live Supabase verification environment variables outside the repository.",
        "Do not print, commit, or paste service role keys.",
        "Rerun the live verification smoke after local static SQL/RLS smokes are green."
      ]
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ...base,
      verification_status: "blocked_missing_fetch_runtime",
      errors: ["fetch runtime is not available"]
    };
  }

  const normalizedUrl = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!normalizedUrl.ok) {
    return {
      ...base,
      verification_status: "blocked_invalid_supabase_url",
      errors: [normalizedUrl.error]
    };
  }

  const anonHeaders = supabaseHeaders(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceHeaders = supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const authSettings = await fetchStatus(fetchImpl, `${normalizedUrl.value}/auth/v1/settings`, {
    headers: anonHeaders
  });
  const table_results = [];
  for (const tableName of tableNames) {
    table_results.push(await fetchStatus(
      fetchImpl,
      `${normalizedUrl.value}/rest/v1/${encodeURIComponent(tableName)}?select=*&limit=0`,
      { headers: { ...serviceHeaders, Prefer: "count=exact" } }
    ));
  }
  const storageBucket = await fetchStatus(
    fetchImpl,
    `${normalizedUrl.value}/storage/v1/bucket/${encodeURIComponent(env.ARC_LAB_STORAGE_BUCKET)}`,
    { headers: serviceHeaders }
  );

  const projectReachable = authSettings.ok || table_results.some((result) => result.status !== null);
  const schemaTablesVerified = table_results.every((result) => result.ok);
  const storageVerified = storageBucket.ok;

  return {
    ...base,
    verification_status: projectReachable && schemaTablesVerified && storageVerified
      ? "live_read_only_surface_verified_rls_effect_unverified"
      : "live_read_only_surface_incomplete",
    live_external_services_contacted: true,
    live_supabase_project_verified: projectReachable,
    live_rest_schema_surface_verified: schemaTablesVerified,
    live_storage_bucket_verified: storageVerified,
    probes: {
      auth_settings: authSettings,
      table_results,
      storage_bucket: storageBucket
    },
    next_manual_steps: [
      "Use dedicated coach and student test users to verify RLS policy effects; this read-only surface probe does not prove role behavior.",
      "Upload and delete a controlled private object in arc-lab-videos only after Storage write-path tests are approved.",
      "Run SMS OTP verification separately with the configured provider."
    ]
  };
}

export function validateArcLabSupabaseLiveVerificationGate(input = {}) {
  const errors = [];
  if (input.schema_version !== ARC_LAB_SUPABASE_LIVE_VERIFICATION_SCHEMA_VERSION) {
    errors.push("schema version mismatch");
  }
  if (input.environment?.secret_values_exposed !== false) {
    errors.push("live verification gate must not expose secret values");
  }
  if (input.live_verification_requested !== true && input.live_external_services_contacted !== false) {
    errors.push("live external services must not be contacted without opt-in");
  }
  if (input.live_external_services_contacted === true && input.live_verification_requested !== true) {
    errors.push("live contact requires ARC_LAB_LIVE_SUPABASE_VERIFY=1");
  }
  if (input.live_external_services_contacted === true && input.environment?.missing_variables?.length > 0) {
    errors.push("live contact must not happen while required variables are missing");
  }
  if (input.live_rls_policy_effect_verified !== false) {
    errors.push("read-only surface probe must not claim RLS policy-effect verification");
  }
  if (input.live_sms_provider_verified !== false) {
    errors.push("Supabase live probe must not claim SMS provider verification");
  }
  if (input.boundaries?.no_database_mutation !== true) errors.push("probe must keep no database mutation boundary");
  if (input.boundaries?.no_storage_object_upload !== true) errors.push("probe must keep no storage upload boundary");

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_supabase_live_verification_validation.v1",
    errors,
    checked: {
      required_env: REQUIRED_LIVE_ENV,
      live_external_services_contacted: input.live_external_services_contacted === true,
      table_count: input.checked?.table_count || 0
    },
    boundaries: input.boundaries
  };
}

function hasEnv(env, name) {
  return String(env?.[name] || "").trim().length > 0;
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

function supabaseHeaders(token) {
  return {
    apikey: token,
    authorization: `Bearer ${token}`
  };
}

async function fetchStatus(fetchImpl, url, init = {}) {
  const parsed = new URL(url);
  try {
    const response = await fetchImpl(url, { method: "GET", ...init });
    return {
      path: `${parsed.pathname}${parsed.search}`,
      status: response.status,
      ok: response.status >= 200 && response.status < 300
    };
  } catch (error) {
    return {
      path: `${parsed.pathname}${parsed.search}`,
      status: null,
      ok: false,
      error: firstLine(error?.message || "network_error")
    };
  }
}

function firstLine(value) {
  return String(value).split("\n")[0].slice(0, 160);
}
