import assert from "node:assert/strict";
import { validateArcLabLiveTrendFlow } from "../server/arcLabIdentityStore.mjs";

const validation = validateArcLabLiveTrendFlow();
assert.equal(validation.ok, true, validation.errors.join("\n"));
assert(validation.checked_tables.includes("athlete_metric_snapshots"));
assert(validation.checked_tables.includes("trend_explanation_drafts"));
assert.equal(validation.boundaries.coach_confirmed_problem_tags_only, true);
assert.equal(validation.boundaries.lesson_homework_separated, true);
assert.equal(validation.boundaries.camera_view_and_shot_type_separated, true);
assert.equal(validation.boundaries.student_explanation_requires_coach_confirmation, true);
assert.equal(validation.boundaries.cross_organization_trend_access, false);

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_live_trend_smoke.v1",
  source_contract: "local_store_confirmed_metrics_to_coach_student_trends",
  checked_tables: validation.checked_tables,
  boundaries: validation.boundaries
}, null, 2));
