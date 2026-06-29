import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateArcLabSupabaseSqlSanity } from "../server/arcLabSupabaseProduction.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sql = await readFile(path.join(root, "supabase", "migrations", "0001_arc_lab_mvp_schema.sql"), "utf8");
const sanity = validateArcLabSupabaseSqlSanity(sql);

assert.equal(sanity.ok, true, sanity.errors.join("\n"));
assert.equal(sanity.boundaries.static_sql_only, true);
assert.equal(sanity.boundaries.no_live_supabase_project, true);
assert.equal(sanity.boundaries.student_ai_drafts_hidden, true);
assert.equal(sanity.boundaries.student_feedback_requires_coach_publish, true);
assert.equal(sanity.boundaries.student_training_tasks_require_coach_publish, true);
assert.equal(sanity.boundaries.student_trend_explanations_require_coach_confirmation, true);
assert.equal(sanity.boundaries.storage_object_path_org_athlete_scoped, true);
assert.equal(sanity.boundaries.student_storage_requires_visible_session, true);
assert.equal(sanity.boundaries.same_org_cross_athlete_storage_denied, true);
assert.equal(sanity.boundaries.knowledge_assistant_questions_not_stored, true);
assert(sanity.checked.policy_count >= 26);
assert(sanity.checked.policy_tables.includes("ai_report_drafts"));
assert(sanity.checked.policy_tables.includes("training_task_drafts"));
assert(sanity.checked.policy_tables.includes("objects"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_supabase_sql_sanity_smoke.v1",
  source_contract: sanity.source_contract,
  check_count: sanity.checked.check_count,
  policy_count: sanity.checked.policy_count,
  boundaries: sanity.boundaries,
  caveat: "static_sql_only_not_live_supabase_execution"
}, null, 2));
