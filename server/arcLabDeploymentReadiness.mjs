import { validateArcLabSupabaseProductionContract } from "./arcLabSupabaseProduction.mjs";

export const ARC_LAB_DEPLOYMENT_READINESS_SCHEMA_VERSION = "arc_lab_deployment_readiness.v1";

const REQUIRED_ENV_GROUPS = [
  {
    id: "supabase_project",
    label: "Supabase project",
    variables: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
  },
  {
    id: "supabase_migration_apply",
    label: "Supabase migration apply",
    variables: ["SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD"]
  },
  {
    id: "sms_auth",
    label: "Phone SMS auth",
    variables: ["ARC_LAB_SMS_PROVIDER", "ARC_LAB_SMS_ACCOUNT_ID", "ARC_LAB_SMS_AUTH_TOKEN"]
  },
  {
    id: "storage_boundary",
    label: "Private video storage",
    variables: ["ARC_LAB_STORAGE_BUCKET"]
  }
];

const OPTIONAL_ENV = ["ARC_LAB_APP_BASE_URL", "ARC_LAB_STORAGE_REGION"];

export function auditArcLabDeploymentReadiness({ env = process.env, sql = "" } = {}) {
  const supabase = validateArcLabSupabaseProductionContract(sql);
  const envGroups = REQUIRED_ENV_GROUPS.map((group) => {
    const present = group.variables.filter((name) => hasEnv(env, name));
    const missing = group.variables.filter((name) => !hasEnv(env, name));
    return {
      id: group.id,
      label: group.label,
      required_variables: group.variables,
      present_variables: present,
      missing_variables: missing,
      ready: missing.length === 0
    };
  });
  const missingRequiredEnv = envGroups.flatMap((group) => group.missing_variables);
  const optional = OPTIONAL_ENV.map((name) => ({ name, present: hasEnv(env, name) }));
  const deploymentReady = supabase.ok && missingRequiredEnv.length === 0;

  return {
    ok: true,
    schema_version: ARC_LAB_DEPLOYMENT_READINESS_SCHEMA_VERSION,
    source_contract: "deployment_environment_gate_not_live_external_verification",
    readiness_status: deploymentReady ? "ready_for_manual_live_verification" : "blocked_missing_environment_or_sql_contract",
    deployment_ready_for_manual_apply: deploymentReady,
    live_supabase_project_verified: false,
    live_sms_provider_verified: false,
    live_storage_upload_verified: false,
    supabase_contract: {
      ok: supabase.ok,
      core_table_count: supabase.summary.core_table_count,
      rls_enabled_table_count: supabase.summary.rls_enabled_table_count,
      storage_bucket: supabase.summary.storage_bucket,
      audited_delete_actions: supabase.summary.audited_delete_actions,
      errors: supabase.errors
    },
    environment: {
      required_groups: envGroups,
      missing_required_variables: missingRequiredEnv,
      optional_variables: optional,
      secret_values_exposed: false
    },
    next_manual_steps: deploymentReady
      ? [
          "Apply supabase/migrations/0001_arc_lab_mvp_schema.sql to the target Supabase project.",
          "Run live RLS probes with separate coach and student users.",
          "Upload and delete a private Storage object in arc-lab-videos.",
          "Send a real SMS OTP through the configured provider."
        ]
      : [
          "Fill the missing Supabase, SMS, and Storage environment variables outside the repository.",
          "Keep local smokes green before attempting a live project apply.",
          "Do not expose service role keys or SMS auth tokens in UI, logs, docs, or commits."
        ],
    boundaries: {
      static_sql_contract_checked: true,
      live_external_services_contacted: false,
      live_supabase_project_connected: false,
      sms_provider_configured: envGroups.find((group) => group.id === "sms_auth")?.ready === true,
      storage_bucket_expected: "arc-lab-videos",
      secret_values_exposed: false
    }
  };
}

export function validateArcLabDeploymentReadinessGate(input = {}) {
  const audit = input.schema_version ? input : auditArcLabDeploymentReadiness(input);
  const errors = [];

  if (audit.schema_version !== ARC_LAB_DEPLOYMENT_READINESS_SCHEMA_VERSION) errors.push("schema version mismatch");
  if (audit.live_supabase_project_verified !== false) errors.push("readiness gate must not claim live Supabase verification");
  if (audit.live_sms_provider_verified !== false) errors.push("readiness gate must not claim live SMS verification");
  if (audit.live_storage_upload_verified !== false) errors.push("readiness gate must not claim live Storage verification");
  if (audit.environment?.secret_values_exposed !== false) errors.push("readiness gate must not expose secret values");
  if (audit.supabase_contract?.ok !== true) errors.push("Supabase static contract must pass before deployment readiness");
  for (const group of REQUIRED_ENV_GROUPS) {
    if (!audit.environment?.required_groups?.some((item) => item.id === group.id)) {
      errors.push(`missing env group ${group.id}`);
    }
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_deployment_readiness_validation.v1",
    errors,
    checked: {
      required_env_groups: REQUIRED_ENV_GROUPS.map((group) => group.id),
      optional_env: OPTIONAL_ENV,
      live_external_services_contacted: false
    },
    boundaries: audit.boundaries
  };
}

function hasEnv(env, name) {
  return String(env?.[name] || "").trim().length > 0;
}
