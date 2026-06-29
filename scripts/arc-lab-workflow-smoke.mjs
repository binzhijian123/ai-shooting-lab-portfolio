import assert from "node:assert/strict";
import {
  buildAiTrainingPlanDraft,
  evaluateHomeworkViewPolicy,
  publishCoachTrainingPlan,
  summarizeArcLabWorkflowContract,
  validateArcLabWorkflowContract,
  validateCoachProblemConfirmation,
  validateVideoUploadMetadata
} from "../server/arcLabWorkflow.mjs";

const validation = validateArcLabWorkflowContract();
assert.equal(validation.ok, true, validation.errors.join("\n"));

const summary = summarizeArcLabWorkflowContract();
assert.equal(summary.schema_version, "arc_lab_workflow_contract.v1");
assert.equal(summary.coach_confirmation.primary_required, true);
assert.equal(summary.coach_confirmation.max_secondary, 2);
assert.equal(summary.coach_confirmation.standard_tags_only, true);
assert.equal(summary.training_plan.ai_draft_student_visible, false);
assert.deepEqual(summary.training_plan.default_step_types, ["correction", "transfer", "retest"]);

const lesson = validateVideoUploadMetadata({
  source_type: "coach_lesson",
  initial_problem_tag_id: "hand_leads_before_lower_body",
  camera_view: "side",
  shot_type: "spot_up"
});
assert.equal(lesson.ok, true, lesson.errors.join("\n"));
assert.match(lesson.normalized.trend_key_preview, /^coach_lesson:side:spot_up:hand_leads_before_lower_body$/);

const invalidLesson = validateVideoUploadMetadata({
  source_type: "coach_lesson",
  camera_view: "side",
  shot_type: "spot_up"
});
assert.equal(invalidLesson.ok, false);
assert(invalidLesson.errors.some((error) => error.includes("initial_problem_tag_id")));

const homework = validateVideoUploadMetadata({
  source_type: "athlete_homework",
  linked_task_id: "task_001",
  requested_camera_view: "side",
  camera_view: "front",
  shot_type: "spot_up"
});
assert.equal(homework.ok, true, homework.errors.join("\n"));

const confirmation = validateCoachProblemConfirmation({
  primary_problem_tag_id: "hand_leads_before_lower_body",
  secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point"],
  coach_note: "Primary issue confirmed after coach review."
});
assert.equal(confirmation.ok, true, confirmation.errors.join("\n"));
assert.equal(confirmation.normalized.final_tag_source, "coach_confirmed");

const invalidConfirmation = validateCoachProblemConfirmation({
  primary_problem_tag_id: "hand_leads_before_lower_body",
  secondary_problem_tag_ids: [
    "lower_body_ball_transfer_disconnect",
    "low_release_point",
    "guide_hand_interference"
  ]
});
assert.equal(invalidConfirmation.ok, false);
assert(invalidConfirmation.errors.some((error) => error.includes("at most two secondary")));

const draft = buildAiTrainingPlanDraft({
  primary_problem_tag_id: confirmation.normalized.primary_problem_tag_id,
  camera_view: "side",
  shot_type: "spot_up"
});
assert.equal(draft.schema_version, "arc_lab_training_plan_draft.v1");
assert.equal(draft.student_visible, false);
assert.equal(draft.steps.length, 3);
assert.deepEqual(draft.steps.map((step) => step.step_type), ["correction", "transfer", "retest"]);
assert(draft.steps.some((step) => step.source_obsidian_path?.includes("obsidian/投篮规则知识图谱/训练/")));

const rejectedPublish = publishCoachTrainingPlan({
  confirmation: {
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point", "guide_hand_interference"]
  },
  aiDraft: draft,
  coachFinalPlan: draft
});
assert.equal(rejectedPublish.ok, false);
assert.equal(rejectedPublish.student_visible, undefined);

const published = publishCoachTrainingPlan({
  confirmation: confirmation.normalized,
  aiDraft: draft,
  coachFinalPlan: {
    steps: draft.steps.map((step) => ({
      ...step,
      coach_note: `coach approved ${step.step_type}`
    }))
  }
});
assert.equal(published.ok, true, published.errors?.join("\n"));
assert.equal(published.student_visible, true);
assert.equal(published.source_of_truth, "coach_feedback");
assert.equal(published.final_plan.schema_version, "arc_lab_training_plan_final.v1");
assert.equal(published.final_plan.steps.length, 3);
assert(published.hidden_from_student.includes("ai_draft_json"));
assert(published.hidden_from_student.includes("coach_edit_diff_json"));
assert.equal(Object.hasOwn(published, "aiDraft"), false);

const wrongView = evaluateHomeworkViewPolicy({
  requested_camera_view: "side",
  actual_camera_view: "front"
});
assert.equal(wrongView.ok, true);
assert.equal(wrongView.counts_as_requested_homework_completion, false);
assert.equal(wrongView.record_role, "supplemental_wrong_view_record");
assert.equal(wrongView.may_enter_actual_view_trend_track, true);
assert.equal(wrongView.trend_camera_view, "front");

const correctView = evaluateHomeworkViewPolicy({
  requested_camera_view: "side",
  actual_camera_view: "side"
});
assert.equal(correctView.counts_as_requested_homework_completion, true);
assert.equal(correctView.record_role, "homework_completion_evidence");

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_workflow_smoke.v1",
  source_contract: "coach_review_publish_workflow_local_contract",
  lesson_trend_key_preview: lesson.normalized.trend_key_preview,
  draft: {
    student_visible: draft.student_visible,
    step_types: draft.steps.map((step) => step.step_type),
    drill_slugs: draft.steps.map((step) => step.drill_slug).filter(Boolean)
  },
  published: {
    student_visible: published.student_visible,
    source_of_truth: published.source_of_truth,
    final_step_count: published.final_plan.steps.length,
    hidden_from_student: published.hidden_from_student
  },
  homework_wrong_view_policy: {
    counts_as_requested_homework_completion: wrongView.counts_as_requested_homework_completion,
    record_role: wrongView.record_role,
    trend_camera_view: wrongView.trend_camera_view
  },
  boundaries: [
    "coach_confirms_primary_and_secondary_problem_tags",
    "ai_training_plan_is_draft_only",
    "student_sees_only_coach_published_final_plan",
    "wrong_view_homework_saved_supplemental_not_completion"
  ]
}, null, 2));
