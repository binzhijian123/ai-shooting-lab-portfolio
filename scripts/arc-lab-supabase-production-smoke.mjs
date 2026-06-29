import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateArcLabSupabaseProductionContract } from "../server/arcLabSupabaseProduction.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sql = await readFile(path.join(root, "supabase", "migrations", "0001_arc_lab_mvp_schema.sql"), "utf8");
const validation = validateArcLabSupabaseProductionContract(sql);

assert.equal(validation.ok, true, validation.errors.join("\n"));
assert.equal(validation.summary.rls_enabled_table_count, validation.summary.core_table_count);
assert.equal(validation.boundaries.organization_scoped_rls, true);
assert.equal(validation.boundaries.ai_drafts_coach_only, true);
assert.equal(validation.boundaries.storage_bucket_private, true);
assert.equal(validation.boundaries.storage_object_path_org_athlete_scoped, true);
assert.equal(validation.boundaries.student_storage_requires_visible_session, true);
assert.equal(validation.boundaries.audited_delete_actions_are_separate, true);
assert(validation.checked.delete_functions.includes("arc_lab_mark_video_deleted"));
assert(validation.checked.delete_functions.includes("arc_lab_mark_session_deleted"));
assert(validation.checked.delete_functions.includes("arc_lab_mark_athlete_data_deleted"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_supabase_production_smoke.v1",
  source_contract: "supabase_rls_storage_audited_deletion_sql_contract",
  rls_enabled_table_count: validation.summary.rls_enabled_table_count,
  storage_bucket: validation.summary.storage_bucket,
  storage_object_key_prefix: validation.summary.storage_object_key_prefix,
  audited_delete_actions: validation.summary.audited_delete_actions,
  production_gaps: validation.summary.production_gaps,
  boundaries: validation.boundaries
}, null, 2));
