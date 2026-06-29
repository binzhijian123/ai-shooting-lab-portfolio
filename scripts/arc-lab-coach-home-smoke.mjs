import assert from "node:assert/strict";
import { validateArcLabCoachHomeFlow } from "../server/arcLabIdentityStore.mjs";

const validation = validateArcLabCoachHomeFlow();

assert.equal(validation.ok, true, validation.errors.join("\n"));
assert.equal(validation.boundaries.retest_first, true);
assert.equal(validation.boundaries.priority_flag_coach_only, true);
assert.equal(validation.boundaries.pre_confirmation_main_problem_hidden, true);
assert.equal(validation.boundaries.in_app_notifications_only, true);
assert(validation.checked_tables.includes("coach_athlete_flags"));
assert(validation.checked_tables.includes("notifications"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_coach_home_smoke.v1",
  source_contract: "coach_org_scoped_urgency_queue_priority_and_in_app_notifications",
  checked_tables: validation.checked_tables,
  boundaries: validation.boundaries
}, null, 2));
