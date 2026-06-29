import {
  ARC_LAB_MVP_CONTRACT,
  CAMERA_VIEWS,
  DRILL_LIBRARY_SEED,
  PROBLEM_TAGS,
  SHOT_TYPES,
  TRAINING_PLAN_STEP_TYPES,
  VIDEO_SOURCE_TYPES,
  buildTrendKey
} from "./arcLabContracts.mjs";

export const ARC_LAB_WORKFLOW_SCHEMA_VERSION = "arc_lab_workflow_contract.v1";

const VALID_CAMERA_VIEWS = new Set(CAMERA_VIEWS.map((item) => item.id));
const VALID_PROBLEM_TAGS = new Set(PROBLEM_TAGS.map((item) => item.id));
const VALID_SHOT_TYPES = new Set(SHOT_TYPES.map((item) => item.id));
const VALID_SOURCE_TYPES = new Set(VIDEO_SOURCE_TYPES.map((item) => item.id));

export function validateVideoUploadMetadata(input = {}) {
  const errors = [];
  const sourceType = input.source_type;
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    errors.push("source_type must be coach_lesson or athlete_homework");
  }
  if (!VALID_CAMERA_VIEWS.has(input.camera_view)) {
    errors.push("camera_view must be side, front, or back");
  }
  if (!VALID_SHOT_TYPES.has(input.shot_type)) {
    errors.push("shot_type must be a standard MVP shot type");
  }

  if (sourceType === "coach_lesson") {
    if (!VALID_PROBLEM_TAGS.has(input.initial_problem_tag_id)) {
      errors.push("coach_lesson requires a standard initial_problem_tag_id");
    }
  }
  if (sourceType === "athlete_homework") {
    if (!input.linked_task_id) {
      errors.push("athlete_homework requires linked_task_id");
    }
    if (!VALID_CAMERA_VIEWS.has(input.requested_camera_view)) {
      errors.push("athlete_homework requires a standard requested_camera_view");
    }
  }

  const actualProblemTag = input.coach_confirmed_primary_problem_id || input.initial_problem_tag_id || "unconfirmed";
  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_video_upload_metadata_validation.v1",
    source_contract: "lesson_homework_view_shot_type_problem_tag_separated",
    errors,
    normalized: errors.length ? null : {
      source_type: sourceType,
      camera_view: input.camera_view,
      shot_type: input.shot_type,
      initial_problem_tag_id: input.initial_problem_tag_id || null,
      requested_camera_view: input.requested_camera_view || null,
      linked_task_id: input.linked_task_id || null,
      trend_key_preview: buildTrendKey({
        source_type: sourceType,
        camera_view: input.camera_view,
        shot_type: input.shot_type,
        problem_tag_id: actualProblemTag
      })
    }
  };
}

export function validateCoachProblemConfirmation(input = {}) {
  const errors = [];
  const primary = input.primary_problem_tag_id;
  const secondary = Array.isArray(input.secondary_problem_tag_ids) ? input.secondary_problem_tag_ids : [];

  if (!VALID_PROBLEM_TAGS.has(primary)) {
    errors.push("coach confirmation requires exactly one standard primary problem tag");
  }
  if (secondary.length > ARC_LAB_MVP_CONTRACT.coach_confirmation.max_secondary_problems) {
    errors.push("coach confirmation allows at most two secondary problem tags");
  }
  for (const tagId of secondary) {
    if (!VALID_PROBLEM_TAGS.has(tagId)) {
      errors.push(`secondary problem tag is not standard: ${tagId}`);
    }
  }
  if (secondary.includes(primary)) {
    errors.push("secondary problem tags must not repeat the primary problem tag");
  }
  if (new Set(secondary).size !== secondary.length) {
    errors.push("secondary problem tags must be unique");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_coach_problem_confirmation_validation.v1",
    source_contract: "coach_final_tag_confirmation_not_ai_diagnosis",
    errors,
    normalized: errors.length ? null : {
      primary_problem_tag_id: primary,
      secondary_problem_tag_ids: secondary,
      coach_note: typeof input.coach_note === "string" ? input.coach_note : "",
      final_tag_source: "coach_confirmed"
    }
  };
}

export function buildAiTrainingPlanDraft({ primary_problem_tag_id, camera_view = "side", shot_type = "spot_up" } = {}) {
  if (!VALID_PROBLEM_TAGS.has(primary_problem_tag_id)) {
    throw new Error("AI draft requires a standard primary_problem_tag_id");
  }
  if (!VALID_CAMERA_VIEWS.has(camera_view)) {
    throw new Error("AI draft requires a standard camera_view");
  }
  if (!VALID_SHOT_TYPES.has(shot_type)) {
    throw new Error("AI draft requires a standard shot_type");
  }

  const matchedDrills = DRILL_LIBRARY_SEED.filter((drill) => drill.related_problem_tag_ids.includes(primary_problem_tag_id));
  const correction = pickDrill(matchedDrills, "correction") || pickDrill(DRILL_LIBRARY_SEED, "correction");
  const transfer = pickDrill(matchedDrills, "transfer") || pickDrill(DRILL_LIBRARY_SEED, "transfer");

  return {
    schema_version: "arc_lab_training_plan_draft.v1",
    source_contract: "ai_draft_only_requires_coach_publish",
    student_visible: false,
    source_of_truth: "coach_feedback_after_publish",
    primary_problem_tag_id,
    camera_view,
    shot_type,
    steps: [
      buildDrillStep("correction", correction, camera_view, shot_type),
      buildDrillStep("transfer", transfer, camera_view, shot_type),
      {
        step_type: "retest",
        order: 3,
        title: "Retest task",
        drill_slug: null,
        requested_camera_view: camera_view,
        shot_type,
        dosage: "10 attempts, same shot type, same camera view",
        coach_editable: true
      }
    ],
    boundaries: [
      "ai_draft_not_student_final",
      "coach_must_confirm_before_publish",
      "drills_seeded_from_obsidian_contract"
    ]
  };
}

export function publishCoachTrainingPlan({ confirmation, aiDraft, coachFinalPlan } = {}) {
  const confirmationCheck = validateCoachProblemConfirmation(confirmation || {});
  const errors = [...confirmationCheck.errors];
  if (aiDraft?.schema_version !== "arc_lab_training_plan_draft.v1") {
    errors.push("publish requires an AI draft training plan");
  }
  const finalSteps = Array.isArray(coachFinalPlan?.steps) ? coachFinalPlan.steps : aiDraft?.steps;
  const stepTypes = finalSteps?.map((step) => step.step_type) || [];
  for (const required of TRAINING_PLAN_STEP_TYPES.map((item) => item.id)) {
    if (!stepTypes.includes(required)) {
      errors.push(`published plan missing ${required} step`);
    }
  }
  if (errors.length) {
    return {
      ok: false,
      schema_version: "arc_lab_training_plan_publish.v1",
      source_contract: "coach_publish_gate_for_student_visible_plan",
      errors
    };
  }

  return {
    ok: true,
    schema_version: "arc_lab_training_plan_publish.v1",
    source_contract: "coach_publish_gate_for_student_visible_plan",
    student_visible: true,
    source_of_truth: "coach_feedback",
    coach_confirmed_problem_tags: confirmationCheck.normalized,
    final_plan: {
      schema_version: "arc_lab_training_plan_final.v1",
      primary_problem_tag_id: confirmationCheck.normalized.primary_problem_tag_id,
      secondary_problem_tag_ids: confirmationCheck.normalized.secondary_problem_tag_ids,
      steps: finalSteps.map((step, index) => ({
        ...step,
        order: index + 1,
        coach_editable: false
      }))
    },
    hidden_from_student: ["ai_draft_json", "coach_edit_diff_json", "rejected_problem_tags"]
  };
}

export function evaluateHomeworkViewPolicy({ requested_camera_view, actual_camera_view, source_type = "athlete_homework" } = {}) {
  const errors = [];
  if (source_type !== "athlete_homework") {
    errors.push("homework view policy only applies to athlete_homework");
  }
  if (!VALID_CAMERA_VIEWS.has(requested_camera_view)) {
    errors.push("requested_camera_view must be standard");
  }
  if (!VALID_CAMERA_VIEWS.has(actual_camera_view)) {
    errors.push("actual_camera_view must be standard");
  }
  if (errors.length) {
    return {
      ok: false,
      schema_version: "arc_lab_homework_view_policy.v1",
      source_contract: "wrong_view_saved_supplemental_not_completion",
      errors
    };
  }
  const matchesRequestedView = requested_camera_view === actual_camera_view;
  return {
    ok: true,
    schema_version: "arc_lab_homework_view_policy.v1",
    source_contract: "wrong_view_saved_supplemental_not_completion",
    requested_camera_view,
    actual_camera_view,
    counts_as_requested_homework_completion: matchesRequestedView,
    record_role: matchesRequestedView ? "homework_completion_evidence" : "supplemental_wrong_view_record",
    may_enter_actual_view_trend_track: true,
    trend_camera_view: actual_camera_view
  };
}

export function summarizeArcLabWorkflowContract() {
  return {
    schema_version: ARC_LAB_WORKFLOW_SCHEMA_VERSION,
    source_contract: "local_coach_review_workflow_contract_not_auth_or_cloud_implementation",
    validates_lesson_upload_metadata: true,
    validates_homework_upload_metadata: true,
    coach_confirmation: {
      primary_required: true,
      max_secondary: ARC_LAB_MVP_CONTRACT.coach_confirmation.max_secondary_problems,
      standard_tags_only: true
    },
    training_plan: {
      ai_draft_student_visible: false,
      published_source_of_truth: "coach_feedback",
      default_step_types: TRAINING_PLAN_STEP_TYPES.map((item) => item.id)
    },
    homework_wrong_view_policy: {
      saves_supplemental_record: true,
      counts_as_requested_homework_completion: false,
      may_enter_actual_view_trend_track: true
    }
  };
}

export function validateArcLabWorkflowContract() {
  const errors = [];
  const lesson = validateVideoUploadMetadata({
    source_type: "coach_lesson",
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up"
  });
  const confirmation = validateCoachProblemConfirmation({
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point"]
  });
  const draft = buildAiTrainingPlanDraft({
    primary_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up"
  });
  const published = publishCoachTrainingPlan({
    confirmation: confirmation.normalized,
    aiDraft: draft,
    coachFinalPlan: draft
  });
  const wrongView = evaluateHomeworkViewPolicy({
    requested_camera_view: "side",
    actual_camera_view: "front"
  });

  if (!lesson.ok) errors.push(...lesson.errors.map((error) => `lesson.${error}`));
  if (!confirmation.ok) errors.push(...confirmation.errors.map((error) => `confirmation.${error}`));
  if (draft.student_visible !== false) errors.push("AI draft must not be student visible");
  if (!published.ok) errors.push(...published.errors.map((error) => `publish.${error}`));
  if (published.student_visible !== true) errors.push("published coach plan must be student visible");
  if (!published.hidden_from_student?.includes("ai_draft_json")) {
    errors.push("published plan must hide AI draft JSON from students");
  }
  if (wrongView.counts_as_requested_homework_completion !== false) {
    errors.push("wrong-view homework must not count as requested homework completion");
  }
  if (wrongView.record_role !== "supplemental_wrong_view_record") {
    errors.push("wrong-view homework must be saved as supplemental record");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_workflow_validation.v1",
    summary: summarizeArcLabWorkflowContract(),
    errors
  };
}

function pickDrill(drills, category) {
  return drills.find((drill) => drill.category === category) || null;
}

function buildDrillStep(stepType, drill, cameraView, shotType) {
  return {
    step_type: stepType,
    order: TRAINING_PLAN_STEP_TYPES.find((item) => item.id === stepType)?.order || 1,
    title: drill.name,
    drill_slug: drill.slug,
    requested_camera_view: drill.required_view || cameraView,
    shot_type: shotType,
    dosage: drill.default_dosage,
    source_obsidian_path: drill.source_obsidian_path,
    coach_editable: true
  };
}
