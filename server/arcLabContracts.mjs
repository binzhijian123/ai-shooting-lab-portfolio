export const ARC_LAB_SCHEMA_VERSION = "arc_lab_mvp_contract.v1";

export const CAMERA_VIEWS = [
  {
    id: "side",
    label: "Side view",
    trend_track: "side_view_trend",
    role: "primary",
    best_for: ["ball_lift_timing", "lower_body_timing", "knee_angle", "trunk_lean", "release_height"]
  },
  {
    id: "front",
    label: "Front view",
    trend_track: "front_view_trend",
    role: "supplemental",
    best_for: ["elbow_flare", "left_right_ball_path", "guide_hand_interference", "shoulder_elbow_wrist_line"]
  },
  {
    id: "back",
    label: "Back view",
    trend_track: "back_view_trend",
    role: "supplemental",
    best_for: ["release_line_direction", "ball_path_direction", "stance_direction", "shooting_line_consistency"]
  }
];

export const SHOT_TYPES = [
  { id: "spot_up", label: "Spot-up" },
  { id: "catch_and_shoot", label: "Catch-and-shoot" },
  { id: "pull_up_after_dribble", label: "Pull-up after dribble" },
  { id: "stop_jump", label: "Stop-jump" },
  { id: "free_throw", label: "Free throw" }
];

export const VIDEO_SOURCE_TYPES = [
  {
    id: "coach_lesson",
    label: "Coach lesson",
    uploaded_by_role: "coach",
    default_visibility_to_athlete: true,
    trend_role: "primary_lesson_trend",
    requires: ["initial_problem_tag_id", "camera_view", "shot_type"]
  },
  {
    id: "athlete_homework",
    label: "Athlete homework",
    uploaded_by_role: "athlete",
    default_visibility_to_athlete: true,
    trend_role: "supporting_homework_transfer_trend",
    requires: ["linked_task_id", "requested_camera_view", "camera_view", "shot_type"],
    wrong_view_policy: {
      save_as_supplemental_record: true,
      counts_as_requested_homework_completion: false,
      may_enter_actual_view_trend_track: true
    }
  }
];

export const PROBLEM_TAGS = [
  {
    id: "hand_leads_before_lower_body",
    label_zh: "手快脚慢",
    category: "timing_sync",
    primary_view: "side",
    source_problem_id: "problem.upper_body_rush_early_lift",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: ["coordination.ball_lift_lower_body_timing"]
  },
  {
    id: "lower_body_ball_transfer_disconnect",
    label_zh: "上下肢脱节",
    category: "timing_sync",
    primary_view: "side",
    source_problem_id: "problem.lower_body_ball_transfer_disconnect",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: ["coordination.ball_lift_lower_body_timing"]
  },
  {
    id: "hip_extension_contribution_low",
    label_zh: "伸髋不足",
    category: "power_chain",
    primary_view: "side",
    source_problem_id: "problem.hip_extension_contribution_low",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: ["lower_body.preparatory_flexion_pattern"]
  },
  {
    id: "jump_is_slow",
    label_zh: "起跳慢",
    category: "lower_body_efficiency",
    primary_view: "side",
    source_problem_id: "problem.triple_extension_discontinuity",
    source: "obsidian_problem_node + body_angle_problem_mapping",
    related_signal_ids: ["lower_body.preparatory_flexion_pattern"]
  },
  {
    id: "lower_body_load_insufficient",
    label_zh: "下肢准备负荷不足",
    category: "lower_body_efficiency",
    primary_view: "side",
    source_problem_id: "problem.lower_body_load_insufficient",
    source: "body_angle_problem_mapping",
    related_signal_ids: ["lower_body.preparatory_flexion_pattern"]
  },
  {
    id: "excessive_slow_loading",
    label_zh: "下肢加载过深且转化偏慢",
    category: "lower_body_efficiency",
    primary_view: "side",
    source_problem_id: "problem.excessive_slow_loading",
    source: "body_angle_problem_mapping",
    related_signal_ids: ["lower_body.preparatory_flexion_pattern"]
  },
  {
    id: "knee_dominant_extension",
    label_zh: "膝主导伸展",
    category: "power_chain",
    primary_view: "side",
    source_problem_id: "problem.knee_dominant_extension",
    source: "body_angle_problem_mapping",
    related_signal_ids: ["lower_body.preparatory_flexion_pattern"]
  },
  {
    id: "ankle_terminal_output_low",
    label_zh: "足踝末端输出不足",
    category: "power_chain",
    primary_view: "side",
    source_problem_id: "problem.ankle_terminal_output_low",
    source: "body_angle_problem_mapping",
    related_signal_ids: ["lower_body.preparatory_flexion_pattern"]
  },
  {
    id: "triple_extension_discontinuity",
    label_zh: "三关节伸展连续性不足",
    category: "power_chain",
    primary_view: "side",
    source_problem_id: "problem.triple_extension_discontinuity",
    source: "body_angle_problem_mapping",
    related_signal_ids: ["coordination.ball_lift_lower_body_timing"]
  },
  {
    id: "forward_trunk_drift_low_release",
    label_zh: "重心前冲",
    category: "trunk_center_stability",
    primary_view: "side",
    source_problem_id: "problem.forward_trunk_drift_low_release",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: ["posture.forward_trunk_lean_at_release", "release.low_release_height"]
  },
  {
    id: "low_release_point",
    label_zh: "释放点低",
    category: "release_space",
    primary_view: "side",
    source_problem_id: "problem.upper_arm_low_release_space",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: ["release.low_release_height"]
  },
  {
    id: "upper_arm_low_release_space",
    label_zh: "大臂抬起不足",
    category: "release_space",
    primary_view: "side",
    source_problem_id: "problem.upper_arm_low_release_space",
    source: "body_angle_problem_mapping",
    related_signal_ids: ["release.low_release_height"]
  },
  {
    id: "elbow_wrist_line_not_straight",
    label_zh: "肘腕力线不直",
    category: "upper_body_release_line",
    primary_view: "front",
    source_problem_id: "problem.elbow_forearm_line_deviation",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: ["release.low_release_height"]
  },
  {
    id: "elbow_forearm_line_deviation",
    label_zh: "肘前臂释放力线偏移",
    category: "upper_body_release_line",
    primary_view: "front",
    source_problem_id: "problem.elbow_forearm_line_deviation",
    source: "body_angle_problem_mapping",
    related_signal_ids: []
  },
  {
    id: "lateral_ball_path",
    label_zh: "球路侧偏",
    category: "upper_body_release_line",
    primary_view: "front",
    source_problem_id: "problem.elbow_forearm_line_deviation",
    source: "body_angle_problem_mapping + obsidian_problem_node",
    related_signal_ids: []
  },
  {
    id: "late_wrist_lateral_compensation",
    label_zh: "手腕横向补偿",
    category: "upper_body_release_line",
    primary_view: "front",
    source_problem_id: "problem.late_wrist_lateral_compensation",
    source: "body_angle_problem_mapping",
    related_signal_ids: []
  },
  {
    id: "release_coordination_instability",
    label_zh: "肘腕释放协同稳定性不足",
    category: "upper_body_release_line",
    primary_view: "front",
    source_problem_id: "problem.release_coordination_instability",
    source: "body_angle_problem_mapping",
    related_signal_ids: []
  },
  {
    id: "guide_hand_interference",
    label_zh: "辅助手发力",
    category: "guide_hand",
    primary_view: "front",
    source_problem_id: null,
    source: "obsidian_problem_node",
    related_signal_ids: []
  }
];

export const TRAINING_PLAN_STEP_TYPES = [
  { id: "correction", label: "Correction drill", order: 1 },
  { id: "transfer", label: "Transfer drill", order: 2 },
  { id: "retest", label: "Retest task", order: 3 }
];

export const DRILL_LIBRARY_SEED = [
  {
    slug: "hip-extension-ball-lift",
    name: "伸髋带动起球",
    category: "correction",
    related_problem_tag_ids: ["hip_extension_contribution_low", "lower_body_ball_transfer_disconnect"],
    required_view: "side",
    default_dosage: "3 sets x 8 reps",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/伸髋带动起球.md"
  },
  {
    slug: "low-to-high-ball-lift",
    name: "低位到高位起球",
    category: "correction",
    related_problem_tag_ids: ["hand_leads_before_lower_body", "low_release_point"],
    required_view: "side",
    default_dosage: "3 sets x 10 reps",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/低位到高位起球.md"
  },
  {
    slug: "one-hand-straight-line-shot",
    name: "单手直线投篮",
    category: "correction",
    related_problem_tag_ids: ["elbow_wrist_line_not_straight", "lateral_ball_path"],
    required_view: "front",
    default_dosage: "3 sets x 8 makes",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/单手直线投篮.md"
  },
  {
    slug: "elastic-jump-compression",
    name: "压弹式起跳训练",
    category: "transfer",
    related_problem_tag_ids: ["jump_is_slow", "excessive_slow_loading"],
    required_view: "side",
    default_dosage: "3 sets x 6 reps",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/压弹式起跳训练.md"
  },
  {
    slug: "quick-hop-ground-contact",
    name: "垫步触地即弹",
    category: "transfer",
    related_problem_tag_ids: ["jump_is_slow", "ankle_terminal_output_low"],
    required_view: "side",
    default_dosage: "3 sets x 6 reps",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/垫步触地即弹.md"
  },
  {
    slug: "no-ball-foot-drive-ball-lift-sync",
    name: "无球蹬地起球同步",
    category: "correction",
    related_problem_tag_ids: ["hand_leads_before_lower_body", "lower_body_ball_transfer_disconnect"],
    required_view: "side",
    default_dosage: "3 sets x 8 reps",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/无球蹬地起球同步.md"
  },
  {
    slug: "anti-forward-drift-spot-shot",
    name: "核心抗前冲定点投",
    category: "transfer",
    related_problem_tag_ids: ["forward_trunk_drift_low_release", "low_release_point"],
    required_view: "side",
    default_dosage: "3 sets x 6 makes",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/核心抗前冲定点投.md"
  },
  {
    slug: "guide-hand-isolation",
    name: "辅助手隔离训练",
    category: "correction",
    related_problem_tag_ids: ["guide_hand_interference", "lateral_ball_path"],
    required_view: "front",
    default_dosage: "3 sets x 8 reps",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/辅助手隔离训练.md"
  },
  {
    slug: "close-range-rhythm-shot",
    name: "近筐节奏投",
    category: "transfer",
    related_problem_tag_ids: ["hand_leads_before_lower_body", "release_coordination_instability"],
    required_view: "side",
    default_dosage: "3 sets x 10 makes",
    source_obsidian_path: "obsidian/投篮规则知识图谱/训练/近筐节奏投.md"
  }
];

export const ARC_LAB_MVP_CONTRACT = {
  schema_version: ARC_LAB_SCHEMA_VERSION,
  source_contract: "coach_led_mvp_domain_boundaries_not_auth_or_cloud_implementation",
  ai_role: {
    evidence_extraction: true,
    knowledge_retrieval: true,
    draft_feedback: true,
    final_diagnosis_allowed: false,
    student_visible_final_source: "coach_feedback"
  },
  coach_confirmation: {
    primary_problem_required: true,
    max_secondary_problems: 2,
    suggested_tag_source_status: "recommended_for_coach_confirmation",
    student_can_see_ai_raw_draft: false
  },
  video_source_types: VIDEO_SOURCE_TYPES,
  camera_views: CAMERA_VIEWS,
  shot_types: SHOT_TYPES,
  problem_tags: PROBLEM_TAGS,
  training_plan: {
    ai_generates_draft_only: true,
    coach_must_edit_or_confirm_before_student_visible: true,
    default_step_types: TRAINING_PLAN_STEP_TYPES,
    step_effectiveness_statuses: ["effective", "ineffective", "watching", "unrated"],
    coach_preference_min_published_tasks: 10
  },
  drill_library_seed: DRILL_LIBRARY_SEED,
  trend_policy: {
    latest_session_primary: true,
    recent_session_compare_count: 3,
    trend_key_fields: ["source_type", "camera_view", "shot_type", "problem_tag_id"],
    no_mixed_camera_view_tracks: true,
    no_mixed_shot_type_tracks: true,
    lesson_and_homework_split_required: true,
    student_interpretive_explanation_requires_coach_confirmation: true
  },
  knowledge_assistant: {
    can_answer_general_training_questions: true,
    personal_video_diagnosis_allowed: false,
    saves_student_questions: false,
    chat_history_in_mvp: false,
    exposes_raw_source_cards_to_students: false,
    default_daily_ai_answer_limit: 20
  },
  privacy_boundary: {
    llm_receives_raw_video: false,
    organization_optimization_scope: "same_organization_only",
    cross_organization_sharing_in_mvp: false,
    student_video_public_by_default: false,
    audited_delete_actions: ["video", "session", "athlete_data"]
  }
};

export function summarizeArcLabContract(contract = ARC_LAB_MVP_CONTRACT) {
  return {
    schema_version: contract.schema_version,
    source_contract: contract.source_contract,
    ai_final_diagnosis_allowed: contract.ai_role.final_diagnosis_allowed,
    student_visible_final_source: contract.ai_role.student_visible_final_source,
    video_source_types: contract.video_source_types.map((item) => item.id),
    camera_views: contract.camera_views.map((item) => item.id),
    shot_types: contract.shot_types.map((item) => item.id),
    problem_tag_count: contract.problem_tags.length,
    problem_tags: contract.problem_tags.map((item) => item.id),
    drill_count: contract.drill_library_seed.length,
    drill_names: contract.drill_library_seed.map((item) => item.name),
    default_training_plan_steps: contract.training_plan.default_step_types.map((item) => item.id),
    trend_key_fields: contract.trend_policy.trend_key_fields,
    knowledge_assistant_personal_video_diagnosis_allowed: contract.knowledge_assistant.personal_video_diagnosis_allowed
  };
}

export function buildTrendKey({ source_type, camera_view, shot_type, problem_tag_id }) {
  return [source_type, camera_view, shot_type, problem_tag_id].map(assertTrendPart).join(":");
}

export function validateArcLabContract(contract = ARC_LAB_MVP_CONTRACT) {
  const errors = [];
  const warnings = [];
  const problemTagIds = contract.problem_tags.map((tag) => tag.id);
  const drillNames = contract.drill_library_seed.map((drill) => drill.name);

  requireIds(errors, "video_source_types", contract.video_source_types, ["coach_lesson", "athlete_homework"]);
  requireIds(errors, "camera_views", contract.camera_views, ["side", "front", "back"]);
  requireIds(errors, "shot_types", contract.shot_types, ["spot_up", "catch_and_shoot", "pull_up_after_dribble", "stop_jump", "free_throw"]);
  requireIds(errors, "training_plan.default_step_types", contract.training_plan.default_step_types, ["correction", "transfer", "retest"]);
  requireUnique(errors, "problem_tags.id", problemTagIds);
  requireUnique(errors, "drill_library_seed.slug", contract.drill_library_seed.map((drill) => drill.slug));

  if (contract.problem_tags.length < 15 || contract.problem_tags.length > 20) {
    errors.push(`problem_tags must contain 15-20 built-in tags, got ${contract.problem_tags.length}`);
  }
  if (contract.coach_confirmation.max_secondary_problems !== 2) {
    errors.push("coach_confirmation.max_secondary_problems must be 2");
  }
  if (contract.coach_confirmation.primary_problem_required !== true) {
    errors.push("coach_confirmation.primary_problem_required must be true");
  }
  if (contract.ai_role.final_diagnosis_allowed !== false) {
    errors.push("AI final diagnosis must not be allowed");
  }
  if (contract.coach_confirmation.student_can_see_ai_raw_draft !== false) {
    errors.push("student must not see raw AI drafts");
  }
  if (contract.ai_role.student_visible_final_source !== "coach_feedback") {
    errors.push("student-facing final source must be coach_feedback");
  }
  if (contract.training_plan.ai_generates_draft_only !== true) {
    errors.push("training plan AI role must be draft-only");
  }
  if (contract.training_plan.coach_must_edit_or_confirm_before_student_visible !== true) {
    errors.push("coach confirmation must gate student-visible training plan");
  }
  if (contract.training_plan.coach_preference_min_published_tasks < 10) {
    errors.push("coach preference ranking must wait for at least 10 published tasks");
  }
  if (contract.trend_policy.recent_session_compare_count !== 3) {
    errors.push("trend recent comparison count must be 3");
  }
  for (const field of ["source_type", "camera_view", "shot_type", "problem_tag_id"]) {
    if (!contract.trend_policy.trend_key_fields.includes(field)) {
      errors.push(`trend_key_fields missing ${field}`);
    }
  }
  if (contract.trend_policy.no_mixed_camera_view_tracks !== true || contract.trend_policy.no_mixed_shot_type_tracks !== true) {
    errors.push("trend tracks must not mix camera views or shot types");
  }
  if (contract.trend_policy.lesson_and_homework_split_required !== true) {
    errors.push("trend policy must keep lesson and homework split");
  }
  if (contract.knowledge_assistant.personal_video_diagnosis_allowed !== false) {
    errors.push("knowledge assistant must not diagnose personal videos");
  }
  if (contract.knowledge_assistant.saves_student_questions !== false) {
    errors.push("knowledge assistant must not save student questions in MVP");
  }
  if (contract.knowledge_assistant.exposes_raw_source_cards_to_students !== false) {
    errors.push("student knowledge assistant must not expose raw source cards");
  }
  if (contract.privacy_boundary.llm_receives_raw_video !== false) {
    errors.push("LLM must receive structured evidence, not raw video");
  }
  if (contract.privacy_boundary.cross_organization_sharing_in_mvp !== false) {
    errors.push("MVP must not share data across organizations");
  }

  const missingDrills = [
    "伸髋带动起球",
    "低位到高位起球",
    "单手直线投篮",
    "压弹式起跳训练",
    "垫步触地即弹",
    "无球蹬地起球同步",
    "核心抗前冲定点投",
    "辅助手隔离训练",
    "近筐节奏投"
  ].filter((name) => !drillNames.includes(name));
  for (const name of missingDrills) {
    errors.push(`missing Obsidian drill node: ${name}`);
  }

  for (const drill of contract.drill_library_seed) {
    for (const tagId of drill.related_problem_tag_ids || []) {
      if (!problemTagIds.includes(tagId)) {
        errors.push(`drill ${drill.slug} references unknown problem tag ${tagId}`);
      }
    }
  }

  const problemTagsWithoutSource = contract.problem_tags.filter((tag) => !tag.source).map((tag) => tag.id);
  if (problemTagsWithoutSource.length) {
    warnings.push(`problem tags without source: ${problemTagsWithoutSource.join(", ")}`);
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_contract_validation.v1",
    summary: summarizeArcLabContract(contract),
    errors,
    warnings
  };
}

function requireIds(errors, label, items, expectedIds) {
  const ids = items.map((item) => item.id);
  for (const expected of expectedIds) {
    if (!ids.includes(expected)) errors.push(`${label} missing ${expected}`);
  }
  requireUnique(errors, `${label}.id`, ids);
}

function requireUnique(errors, label, values) {
  const seen = new Set();
  for (const value of values) {
    if (!value) errors.push(`${label} contains empty value`);
    if (seen.has(value)) errors.push(`${label} contains duplicate value ${value}`);
    seen.add(value);
  }
}

function assertTrendPart(value) {
  if (!value || typeof value !== "string") {
    throw new Error("trend key parts must be non-empty strings");
  }
  if (value.includes(":")) {
    throw new Error(`trend key part must not contain colon: ${value}`);
  }
  return value;
}
