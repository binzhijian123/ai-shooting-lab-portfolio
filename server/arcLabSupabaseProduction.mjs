import { ARC_LAB_DATA_MODEL_TABLES } from "./arcLabPlatform.mjs";

export const ARC_LAB_SUPABASE_PRODUCTION_SCHEMA_VERSION = "arc_lab_supabase_production_contract.v1";

const REQUIRED_HELPERS = [
  "arc_lab_is_org_member",
  "arc_lab_is_org_coach",
  "arc_lab_is_bound_athlete",
  "arc_lab_storage_org_id",
  "arc_lab_storage_athlete_id",
  "arc_lab_can_manage_storage_path",
  "arc_lab_can_read_storage_object"
];

const REQUIRED_DELETE_FUNCTIONS = [
  ["arc_lab_mark_video_deleted", "video_deleted"],
  ["arc_lab_mark_session_deleted", "session_deleted"],
  ["arc_lab_mark_athlete_data_deleted", "athlete_data_deleted"]
];

export function summarizeArcLabSupabaseProductionContract(sql = "") {
  const sanity = validateArcLabSupabaseSqlSanity(sql);
  return {
    schema_version: ARC_LAB_SUPABASE_PRODUCTION_SCHEMA_VERSION,
    source_contract: "supabase_schema_rls_storage_audited_deletion_contract_not_live_cloud",
    core_table_count: ARC_LAB_DATA_MODEL_TABLES.length,
    rls_enabled_table_count: ARC_LAB_DATA_MODEL_TABLES.filter((tableName) => hasRls(sql, tableName)).length,
    sql_sanity_ok: sanity.ok,
    sql_sanity_check_count: sanity.checked.check_count,
    storage_bucket: "arc-lab-videos",
    storage_object_key_prefix: "organization_id/athlete_id/",
    audited_delete_actions: REQUIRED_DELETE_FUNCTIONS.map(([, action]) => action),
    production_gaps: [
      "not_applied_to_live_supabase_project",
      "auth_sms_provider_not_configured",
      "storage_object_bytes_not_uploaded_by_local_contract"
    ]
  };
}

export function validateArcLabSupabaseProductionContract(sql = "") {
  const errors = [];
  const sanity = validateArcLabSupabaseSqlSanity(sql);
  if (!sql.trim()) errors.push("migration sql is empty");
  if (!sql.match(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto/i)) {
    errors.push("missing pgcrypto extension for gen_random_uuid");
  }

  for (const tableName of ARC_LAB_DATA_MODEL_TABLES) {
    if (!includesCreateTable(sql, tableName)) errors.push(`missing create table ${tableName}`);
    if (!hasRls(sql, tableName)) errors.push(`missing RLS enable for ${tableName}`);
  }

  for (const helperName of REQUIRED_HELPERS) {
    if (!hasFunction(sql, helperName)) errors.push(`missing helper function ${helperName}`);
  }

  for (const tableName of ["ai_report_drafts", "training_task_drafts"]) {
    if (!hasCoachOnlyPolicy(sql, tableName)) errors.push(`${tableName} must have coach-only policy`);
  }

  if (!sql.includes("storage.buckets")) errors.push("missing Supabase storage bucket setup");
  if (!sql.includes("'arc-lab-videos'")) errors.push("missing private arc-lab-videos bucket");
  if (!sql.match(/values\s*\(\s*'arc-lab-videos'\s*,\s*'arc-lab-videos'\s*,\s*false\s*\)/is)) {
    errors.push("arc-lab-videos bucket must be private");
  }
  for (const action of ["select", "insert", "update", "delete"]) {
    const policyPattern = new RegExp(`create\\s+policy\\s+arc_lab_videos_${action}_[\\s\\S]+on\\s+storage\\.objects`, "i");
    if (!policyPattern.test(sql)) errors.push(`missing storage.objects ${action} policy`);
  }

  for (const [functionName, auditAction] of REQUIRED_DELETE_FUNCTIONS) {
    if (!hasFunction(sql, functionName)) errors.push(`missing audited deletion function ${functionName}`);
    if (!sql.includes(`'${auditAction}'`)) errors.push(`missing audit action ${auditAction}`);
  }
  if (!sql.includes("deleted_at = now()")) errors.push("audited delete flow must soft-delete with deleted_at");
  if (!sql.includes("insert into audit_events")) errors.push("audited delete flow must write audit_events");
  errors.push(...sanity.errors.map((error) => `sql_sanity.${error}`));

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_supabase_production_validation.v1",
    summary: summarizeArcLabSupabaseProductionContract(sql),
    errors,
    checked: {
      tables: ARC_LAB_DATA_MODEL_TABLES,
      helpers: REQUIRED_HELPERS,
      delete_functions: REQUIRED_DELETE_FUNCTIONS.map(([functionName]) => functionName),
      storage_bucket: "arc-lab-videos"
    },
    sql_sanity: sanity,
    boundaries: {
      not_live_supabase_deployment: true,
      organization_scoped_rls: true,
      ai_drafts_coach_only: true,
      student_visible_feedback_requires_coach_publish: true,
      storage_bucket_private: true,
      storage_object_path_org_athlete_scoped: true,
      student_storage_requires_visible_session: true,
      audited_delete_actions_are_separate: true
    }
  };
}

export function validateArcLabSupabaseSqlSanity(sql = "") {
  const errors = [];
  const policyEntries = extractCreatePolicyEntries(sql);
  const policyKeys = policyEntries.map((entry) => `${entry.table}:${entry.name}`);
  const duplicatePolicies = findDuplicates(policyKeys);
  const tableBodies = Object.fromEntries(
    ARC_LAB_DATA_MODEL_TABLES.map((tableName) => [tableName, extractCreateTableBody(sql, tableName)])
  );

  if (countMatches(sql, /\$\$/g) % 2 !== 0) errors.push("unbalanced dollar-quoted function body markers");
  if (duplicatePolicies.length > 0) errors.push(`duplicate policy definitions: ${duplicatePolicies.join(", ")}`);

  for (const tableName of ARC_LAB_DATA_MODEL_TABLES) {
    if (!policyEntries.some((entry) => entry.table === tableName)) {
      errors.push(`RLS table has no policy definitions: ${tableName}`);
    }
  }

  for (const helperName of REQUIRED_HELPERS.filter((name) => !["arc_lab_storage_org_id", "arc_lab_storage_athlete_id"].includes(name))) {
    const body = extractFunctionBlock(sql, helperName);
    if (!body.match(/security\s+definer/i)) errors.push(`${helperName} must be security definer`);
    if (!body.match(/set\s+search_path\s*=\s*public/i)) errors.push(`${helperName} must pin search_path to public`);
  }

  for (const [functionName, auditAction] of REQUIRED_DELETE_FUNCTIONS) {
    const body = extractFunctionBlock(sql, functionName);
    if (!body.match(/security\s+definer/i)) errors.push(`${functionName} must be security definer`);
    if (!body.match(/set\s+search_path\s*=\s*public/i)) errors.push(`${functionName} must pin search_path to public`);
    if (!body.includes("arc_lab_is_org_coach")) errors.push(`${functionName} must require coach permission`);
    if (!body.includes(`'${auditAction}'`)) errors.push(`${functionName} must write ${auditAction} audit action`);
  }

  const storageOrgHelper = extractFunctionBlock(sql, "arc_lab_storage_org_id");
  if (!storageOrgHelper.match(/language\s+sql\s+immutable/i)) {
    errors.push("storage org helper must stay immutable SQL");
  }
  if (!storageOrgHelper.includes("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/")) {
    errors.push("storage org helper must validate UUID-shaped object prefixes before casting");
  }

  const storageAthleteHelper = extractFunctionBlock(sql, "arc_lab_storage_athlete_id");
  if (!storageAthleteHelper.match(/language\s+sql\s+immutable/i)) {
    errors.push("storage athlete helper must stay immutable SQL");
  }
  if (!storageAthleteHelper.includes("split_part(object_name, '/', 2)::uuid")) {
    errors.push("storage athlete helper must parse the second object-key segment");
  }

  const storageManageHelper = extractFunctionBlock(sql, "arc_lab_can_manage_storage_path");
  for (const required of ["from athletes", "arc_lab_storage_org_id", "arc_lab_storage_athlete_id", "arc_lab_is_org_coach"]) {
    if (!storageManageHelper.includes(required)) errors.push(`storage manage helper must include ${required}`);
  }

  const storageReadHelper = extractFunctionBlock(sql, "arc_lab_can_read_storage_object");
  for (const required of [
    "from video_assets",
    "join training_sessions",
    "video_assets.object_key = object_name",
    "video_assets.deleted_at is null",
    "training_sessions.deleted_at is null",
    "training_sessions.visibility_to_athlete is true",
    "arc_lab_is_bound_athlete"
  ]) {
    if (!storageReadHelper.includes(required)) errors.push(`storage read helper must include ${required}`);
  }

  const storagePolicies = policyEntries
    .filter((entry) => entry.table === "objects")
    .map((entry) => entry.body)
    .join("\n");
  if (!storagePolicies.includes("arc_lab_can_read_storage_object(name)")) {
    errors.push("storage select policy must use authorized object viewer helper");
  }
  if (!storagePolicies.includes("arc_lab_can_manage_storage_path(name)")) {
    errors.push("storage mutation policies must use validated coach path helper");
  }
  if (storagePolicies.includes("arc_lab_is_org_member(public.arc_lab_storage_org_id(name))")) {
    errors.push("storage select policy must not grant every organization member access");
  }

  const videoAssetPolicies = policyEntries
    .filter((entry) => entry.table === "video_assets")
    .map((entry) => entry.body)
    .join("\n");
  for (const required of ["training_sessions.deleted_at is null", "training_sessions.visibility_to_athlete is true"]) {
    if (!videoAssetPolicies.includes(required)) errors.push(`student video asset access must require ${required}`);
  }

  const sessionProblemPolicies = policyEntries
    .filter((entry) => entry.table === "session_problem_tags")
    .map((entry) => entry.body)
    .join("\n");
  if (!sessionProblemPolicies.includes("source = 'coach_confirmed'")) {
    errors.push("student-visible session problem tags must be coach-confirmed only");
  }

  const trendPolicies = policyEntries
    .filter((entry) => entry.table === "trend_explanation_drafts")
    .map((entry) => entry.body)
    .join("\n");
  for (const required of ["student_visible is true", "coach_confirmed_json is not null"]) {
    if (!trendPolicies.includes(required)) errors.push(`student trend explanations must require ${required}`);
  }

  for (const draftTable of ["ai_report_drafts", "training_task_drafts"]) {
    const draftPolicies = policyEntries
      .filter((entry) => entry.table === draftTable)
      .map((entry) => entry.body)
      .join("\n");
    if (draftPolicies.includes("arc_lab_is_bound_athlete")) {
      errors.push(`${draftTable} policy must not expose drafts to bound athletes`);
    }
  }

  const feedbackPolicies = policyEntries
    .filter((entry) => entry.table === "coach_feedback")
    .map((entry) => entry.body)
    .join("\n");
  if (!feedbackPolicies.includes("coach_feedback.published_at is not null")) {
    errors.push("student-visible coach feedback must require published_at");
  }

  const trainingTaskPolicies = policyEntries
    .filter((entry) => ["training_tasks", "training_plan_steps"].includes(entry.table))
    .map((entry) => entry.body)
    .join("\n");
  if (!trainingTaskPolicies.includes("training_tasks.published_at is not null")) {
    errors.push("student-visible training tasks and plan steps must require published_at");
  }

  if (tableBodies.knowledge_assistant_usage.match(/\b(question|prompt|message|answer_text|chat_history)\b/i)) {
    errors.push("knowledge_assistant_usage must not store student questions or chat history in MVP");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_supabase_sql_sanity.v1",
    source_contract: "static_sql_compatibility_and_rls_boundary_checks_not_live_execution",
    errors,
    checked: {
      check_count: 18,
      policy_count: policyEntries.length,
      policy_tables: [...new Set(policyEntries.map((entry) => entry.table))].sort(),
      delete_functions: REQUIRED_DELETE_FUNCTIONS.map(([functionName]) => functionName),
      not_live_execution: true
    },
    boundaries: {
      static_sql_only: true,
      no_live_supabase_project: true,
      student_ai_drafts_hidden: true,
      student_feedback_requires_coach_publish: true,
      student_training_tasks_require_coach_publish: true,
      student_trend_explanations_require_coach_confirmation: true,
      storage_object_path_org_athlete_scoped: true,
      student_storage_requires_visible_session: true,
      same_org_cross_athlete_storage_denied: true,
      knowledge_assistant_questions_not_stored: true
    }
  };
}

function includesCreateTable(sql, tableName) {
  return new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${tableName}\\b`, "i").test(sql);
}

function hasRls(sql, tableName) {
  return new RegExp(`alter\\s+table\\s+${tableName}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql);
}

function hasFunction(sql, functionName) {
  return new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b`, "i").test(sql);
}

function hasCoachOnlyPolicy(sql, tableName) {
  const policyBlocks = sql
    .split(/create\s+policy\s+/i)
    .filter((block) => new RegExp(`on\\s+${tableName}\\b`, "i").test(block));
  return policyBlocks.some((block) => block.includes("arc_lab_is_org_coach"));
}

function extractCreatePolicyEntries(sql) {
  const entries = [];
  const pattern = /create\s+policy\s+([a-zA-Z_][\w$]*)\s+on\s+((?:[a-zA-Z_][\w$]*\.)?[a-zA-Z_][\w$]*)([\s\S]*?);/gi;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    entries.push({
      name: match[1],
      table: match[2].split(".").pop(),
      body: match[0]
    });
  }
  return entries;
}

function extractCreateTableBody(sql, tableName) {
  const match = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`, "i").exec(sql);
  return match?.[1] || "";
}

function extractFunctionBlock(sql, functionName) {
  const match = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?\\n\\$\\$;`, "i").exec(sql);
  return match?.[0] || "";
}

function countMatches(sql, pattern) {
  return [...sql.matchAll(pattern)].length;
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}
