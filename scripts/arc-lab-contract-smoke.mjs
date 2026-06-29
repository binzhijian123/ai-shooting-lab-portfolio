import assert from "node:assert/strict";
import {
  ARC_LAB_MVP_CONTRACT,
  buildTrendKey,
  summarizeArcLabContract,
  validateArcLabContract
} from "../server/arcLabContracts.mjs";

const validation = validateArcLabContract(ARC_LAB_MVP_CONTRACT);
assert.equal(validation.ok, true, validation.errors.join("\n"));

const summary = summarizeArcLabContract(ARC_LAB_MVP_CONTRACT);
assert.equal(summary.schema_version, "arc_lab_mvp_contract.v1");
assert.equal(summary.ai_final_diagnosis_allowed, false);
assert.equal(summary.student_visible_final_source, "coach_feedback");
assert.equal(summary.problem_tag_count, 18);
assert.equal(summary.drill_count, 9);
assert.deepEqual(summary.default_training_plan_steps, ["correction", "transfer", "retest"]);
assert.equal(summary.knowledge_assistant_personal_video_diagnosis_allowed, false);

for (const required of ["coach_lesson", "athlete_homework"]) {
  assert(summary.video_source_types.includes(required), `missing video source type ${required}`);
}
for (const required of ["side", "front", "back"]) {
  assert(summary.camera_views.includes(required), `missing camera view ${required}`);
}
for (const required of ["spot_up", "catch_and_shoot", "pull_up_after_dribble", "stop_jump", "free_throw"]) {
  assert(summary.shot_types.includes(required), `missing shot type ${required}`);
}

const lessonSide = buildTrendKey({
  source_type: "coach_lesson",
  camera_view: "side",
  shot_type: "spot_up",
  problem_tag_id: "hand_leads_before_lower_body"
});
const homeworkSide = buildTrendKey({
  source_type: "athlete_homework",
  camera_view: "side",
  shot_type: "spot_up",
  problem_tag_id: "hand_leads_before_lower_body"
});
const lessonFront = buildTrendKey({
  source_type: "coach_lesson",
  camera_view: "front",
  shot_type: "spot_up",
  problem_tag_id: "hand_leads_before_lower_body"
});
const lessonSideFreeThrow = buildTrendKey({
  source_type: "coach_lesson",
  camera_view: "side",
  shot_type: "free_throw",
  problem_tag_id: "hand_leads_before_lower_body"
});

assert.notEqual(lessonSide, homeworkSide, "lesson and homework trend keys must not mix");
assert.notEqual(lessonSide, lessonFront, "camera views must not mix in trend keys");
assert.notEqual(lessonSide, lessonSideFreeThrow, "shot types must not mix in trend keys");

const homeworkPolicy = ARC_LAB_MVP_CONTRACT.video_source_types.find((item) => item.id === "athlete_homework")?.wrong_view_policy;
assert.equal(homeworkPolicy?.save_as_supplemental_record, true);
assert.equal(homeworkPolicy?.counts_as_requested_homework_completion, false);
assert.equal(homeworkPolicy?.may_enter_actual_view_trend_track, true);

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_contract_smoke.v1",
  source_contract: "coach_led_mvp_domain_contract_static_smoke",
  problem_tag_count: summary.problem_tag_count,
  drill_count: summary.drill_count,
  trend_key_examples: {
    lesson_side: lessonSide,
    homework_side: homeworkSide,
    lesson_front: lessonFront,
    lesson_side_free_throw: lessonSideFreeThrow
  },
  boundaries: [
    "ai_draft_not_final_diagnosis",
    "coach_feedback_student_source_of_truth",
    "lesson_homework_view_shot_type_problem_tag_not_mixed",
    "knowledge_assistant_no_personal_video_diagnosis"
  ]
}, null, 2));
