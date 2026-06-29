import {
  CAMERA_VIEWS,
  DRILL_LIBRARY_SEED,
  PROBLEM_TAGS,
  SHOT_TYPES,
  TRAINING_PLAN_STEP_TYPES,
  VIDEO_SOURCE_TYPES
} from "./arcLabContracts.mjs";
import {
  buildAiTrainingPlanDraft,
  evaluateHomeworkViewPolicy,
  publishCoachTrainingPlan,
  validateCoachProblemConfirmation,
  validateVideoUploadMetadata
} from "./arcLabWorkflow.mjs";
import { buildArcLabTrendSnapshot } from "./arcLabTrends.mjs";
import {
  buildStudentKnowledgeAssistantResponse,
  buildStudentKnowledgeDirectory
} from "./arcLabKnowledgeAssistant.mjs";

export const ARC_LAB_PLATFORM_SCHEMA_VERSION = "arc_lab_platform_mvp_blueprint.v1";

export const ARC_LAB_DATA_MODEL_TABLES = [
  "profiles",
  "organizations",
  "organization_members",
  "coach_athlete_relations",
  "athletes",
  "athlete_invites",
  "problem_tags",
  "drill_library",
  "training_sessions",
  "video_assets",
  "evidence_packets",
  "ai_report_drafts",
  "coach_feedback",
  "training_task_drafts",
  "training_tasks",
  "training_plan_steps",
  "training_plan_step_results",
  "session_problem_tags",
  "athlete_metric_snapshots",
  "trend_explanation_drafts",
  "knowledge_articles",
  "knowledge_assistant_usage",
  "notifications",
  "coach_athlete_flags",
  "audit_events",
  "consents"
];

const REVIEW_STATUS = {
  waiting: "waiting_for_coach_confirmation",
  draft: "ai_draft_ready_for_coach_edit",
  published: "coach_feedback_published",
  homework: "homework_retest_uploaded"
};

export function buildArcLabPlatformMvp({ knowledgeBase = {} } = {}) {
  const lesson = validateVideoUploadMetadata({
    source_type: "coach_lesson",
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up"
  });
  const homeworkWrongView = evaluateHomeworkViewPolicy({
    requested_camera_view: "side",
    actual_camera_view: "front"
  });
  const confirmation = validateCoachProblemConfirmation({
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point"],
    coach_note: "教练结合侧面视角证据和课堂上下文后确认。"
  });
  const aiDraft = buildAiTrainingPlanDraft({
    primary_problem_tag_id: confirmation.normalized.primary_problem_tag_id,
    camera_view: "side",
    shot_type: "spot_up"
  });
  const published = publishCoachTrainingPlan({
    confirmation: confirmation.normalized,
    aiDraft,
    coachFinalPlan: {
      steps: aiDraft.steps.map((step) => ({
        ...step,
        short_reason: reasonForStep(step.step_type),
        success_target: successTargetForStep(step.step_type)
      }))
    }
  });
  const trendSnapshot = buildArcLabTrendSnapshot({
    sessions: platformTrendFixture(),
    current_trend_key: "coach_lesson:side:spot_up:hand_leads_before_lower_body",
    coach_confirmed_explanation: {
      status: "coach_confirmed",
      text: "侧面线下课证据已经改善，作业复测开始出现迁移。"
    }
  });
  const knowledgeDirectory = buildStudentKnowledgeDirectory(knowledgeBase, { limit: 6 });
  const knowledgeAnswer = buildStudentKnowledgeAssistantResponse({
    question: "怎么拍侧面投篮视频？",
    knowledgeBase,
    ai_answer_count_today: 3
  });
  const personalDiagnosisRefusal = buildStudentKnowledgeAssistantResponse({
    question: "我的投篮视频有什么问题？",
    knowledgeBase,
    ai_answer_count_today: 3
  });
  const reviewQueue = buildReviewQueue();

  return {
    ok: true,
    schema_version: ARC_LAB_PLATFORM_SCHEMA_VERSION,
    source_contract: "coach_led_mvp_platform_blueprint_preserves_analysis_lab",
    product_positioning: {
      north_star: [
        "student_video",
        "action_evidence",
        "knowledge_retrieval",
        "ai_draft",
        "coach_confirmation",
        "student_training_plan",
        "retest_video",
        "long_term_progress_trend"
      ],
      ai_final_diagnosis_allowed: false,
      student_final_source_of_truth: "coach_feedback",
      analysis_lab_preserved: true,
      public_saas_marketplace_in_mvp: false
    },
    target_repo_shape: {
      coach_platform: "apps/coach-platform",
      analysis_lab: "apps/analysis-lab",
      analysis_engine: "packages/analysis-engine",
      supabase: "supabase"
    },
    roles: buildRoles(),
    identity_access: {
      coach_login: "phone",
      coach_first_login_creates_default_organization: true,
      student_entry: "invite_link",
      student_first_access_binds_phone: true,
      invite_validity_default_days: 30,
      invite_policy_status: "default_until_final_confirmation"
    },
    coach_home: {
      schema_version: "arc_lab_coach_home.v1",
      review_queue: reviewQueue,
      training_plan_draft_box: {
        visible: true,
        ai_draft_student_visible: aiDraft.student_visible,
        coach_must_publish_before_student_visible: true,
        draft_step_types: aiDraft.steps.map((step) => step.step_type)
      },
      notifications: buildNotifications(reviewQueue)
    },
    coach_session_review: {
      upload_metadata_validation: lesson,
      evidence_hints_before_confirmation: [
        "起球时序证据可用",
        "出手高度证据可用"
      ],
      forbidden_pre_confirmation_copy: [
        "主问题：手快脚慢"
      ],
      coach_confirmation: confirmation.normalized,
      ai_draft: {
        schema_version: aiDraft.schema_version,
        student_visible: aiDraft.student_visible,
        step_types: aiDraft.steps.map((step) => step.step_type),
        hidden_from_student: ["ai_draft_json"]
      },
      published_feedback: {
        student_visible: published.student_visible,
        source_of_truth: published.source_of_truth,
        final_plan: published.final_plan,
        hidden_from_student: published.hidden_from_student
      }
    },
    student_experience: buildStudentExperience({ published, trendSnapshot, knowledgeDirectory, knowledgeAnswer, personalDiagnosisRefusal }),
    homework: {
      completion_flow: [
        "student_views_training_plan",
        "student_marks_complete",
        "student_uploads_retest_video",
        "coach_reviews_effectiveness"
      ],
      statuses: ["assigned", "started", "completed_by_self_report", "retest_uploaded", "coach_reviewed", "effective", "ineffective", "watching"],
      step_effectiveness_statuses: ["effective", "ineffective", "watching", "unrated"],
      wrong_view_policy: homeworkWrongView,
      ineffective_plan_policy: "show_related_drill_alternatives_coach_final_choice"
    },
    trend: {
      snapshot: trendSnapshot,
      separated_dimensions: ["source_type", "camera_view", "shot_type", "problem_tag_id"],
      lesson_homework_transfer_visible_to_coach: true,
      student_interpretive_explanation_requires_coach_confirmation: true
    },
    review_experience: {
      square_video_area: true,
      full_playback_default: true,
      angle_overlay: true,
      stage_labels: ["举球启动", "下肢启动", "出手", "随球跟随"],
      keyframe_switching: true,
      recent_3_session_comparison: true,
      default_overlay_scope: "current_primary_problem_relevant_lines_and_angles"
    },
    mvp_pages: {
      coach: ["phone_login", "coach_home", "add_student_invite", "lesson_upload", "session_review", "training_plan_publish", "student_profile_trends"],
      student: ["invite_entry", "phone_binding", "homework", "retest_upload", "feedback_result", "simplified_progress", "knowledge_directory", "knowledge_assistant"],
      admin: ["minimal_organization_context"]
    },
    data_model: buildDataModel(),
    productionization: {
      supabase_schema_migration: "supabase/migrations/0001_arc_lab_mvp_schema.sql",
      rls_policy_contract: "organization_scoped_auth_uid_policies",
      storage_boundary: {
        bucket: "arc-lab-videos",
        public: false,
        object_key_prefix: "organization_id/athlete_id/session_or_video_path"
      },
      audited_delete_actions: ["video_deleted", "session_deleted", "athlete_data_deleted"],
      live_supabase_project_connected: false
    },
    privacy_boundaries: {
      ai_drafts_are_not_student_final_decisions: true,
      coach_feedback_student_source_of_truth: true,
      llm_receives_raw_video: false,
      organization_optimization_scope: "same_organization_only",
      cross_organization_sharing_in_mvp: false,
      student_video_public_by_default: false,
      audited_delete_actions: ["video", "session", "athlete_data"],
      student_knowledge_questions_saved: false,
      knowledge_assistant_personal_video_diagnosis_allowed: false
    },
    analysis_engine_bridge: {
      preserves_existing_lab: true,
      exports: ["metrics", "evidence_packets", "knowledge_retrieval", "report_contracts", "prompt_helpers"],
      current_local_modules: [
        "server/metricsEngine.mjs",
        "server/visionPipeline.mjs",
        "server/angleKnowledgeRetrieval.mjs",
        "server/reportContracts.mjs",
        "server/promptPolicy.mjs"
      ]
    }
  };
}

export function summarizeArcLabPlatformMvp() {
  return {
    schema_version: ARC_LAB_PLATFORM_SCHEMA_VERSION,
    source_contract: "coach_led_mvp_platform_blueprint_preserves_analysis_lab",
    roles: ["coach", "student", "admin_minimal"],
    mvp_page_groups: ["coach", "student", "admin"],
    core_table_count: ARC_LAB_DATA_MODEL_TABLES.length,
    analysis_lab_preserved: true,
    ai_final_diagnosis_allowed: false,
    student_final_source_of_truth: "coach_feedback"
  };
}

export function validateArcLabPlatformMvp(knowledgeBase = {}) {
  const blueprint = buildArcLabPlatformMvp({ knowledgeBase });
  const errors = [];

  requireEqual(errors, blueprint.product_positioning.ai_final_diagnosis_allowed, false, "AI final diagnosis must remain disabled");
  requireEqual(errors, blueprint.product_positioning.analysis_lab_preserved, true, "analysis lab must be preserved");
  requireEqual(errors, blueprint.identity_access.coach_first_login_creates_default_organization, true, "coach first login must create default organization");
  requireEqual(errors, blueprint.identity_access.student_first_access_binds_phone, true, "student invite entry must bind phone");
  requireIncludes(errors, blueprint.coach_home.review_queue.map((item) => item.status), REVIEW_STATUS.homework, "review queue must prioritize retest uploads");
  requireEqual(errors, blueprint.coach_session_review.ai_draft.student_visible, false, "AI draft must not be student visible");
  requireEqual(errors, blueprint.coach_session_review.published_feedback.student_visible, true, "coach-published feedback must be student visible");
  requireIncludes(errors, blueprint.coach_session_review.published_feedback.hidden_from_student, "ai_draft_json", "student view must hide AI draft JSON");
  requireEqual(errors, blueprint.student_experience.feedback_result.hidden_from_student.includes("coach_edit_diff_json"), true, "student view must hide coach edit diffs");
  requireEqual(errors, blueprint.student_experience.knowledge_assistant.personal_diagnosis_refusal.answer_type, "boundary_refusal", "personal diagnosis must be refused");
  requireEqual(errors, blueprint.student_experience.knowledge_assistant.general_answer.usage.saves_student_question, false, "assistant must not save student questions");
  requireEqual(errors, blueprint.student_experience.knowledge_assistant.usage_counter.daily_limit, 20, "assistant usage counter must keep the 20-answer daily limit");
  requireEqual(errors, blueprint.student_experience.knowledge_assistant.usage_counter.saves_student_question, false, "assistant usage counter must not save student question text");
  requireEqual(errors, blueprint.trend.snapshot.student_view.recent_sessions.length, 3, "student trend must expose recent 3 sessions");
  requireEqual(errors, blueprint.homework.wrong_view_policy.counts_as_requested_homework_completion, false, "wrong-view homework must not complete requested task");
  requireEqual(errors, blueprint.privacy_boundaries.cross_organization_sharing_in_mvp, false, "MVP must not share across organizations");
  requireEqual(errors, blueprint.productionization.storage_boundary.public, false, "Supabase storage bucket must stay private");
  requireEqual(
    errors,
    blueprint.productionization.storage_boundary.object_key_prefix,
    "organization_id/athlete_id/session_or_video_path",
    "Supabase storage object keys must keep organization and athlete scopes"
  );
  requireEqual(errors, blueprint.productionization.live_supabase_project_connected, false, "local smoke must not claim a live Supabase project");
  for (const action of ["video_deleted", "session_deleted", "athlete_data_deleted"]) {
    requireIncludes(errors, blueprint.productionization.audited_delete_actions, action, `missing audited delete action ${action}`);
  }

  for (const requiredTable of ARC_LAB_DATA_MODEL_TABLES) {
    if (!blueprint.data_model.tables.some((table) => table.name === requiredTable)) {
      errors.push(`missing data model table ${requiredTable}`);
    }
  }
  for (const group of ["coach", "student", "admin"]) {
    if (!Array.isArray(blueprint.mvp_pages[group]) || blueprint.mvp_pages[group].length === 0) {
      errors.push(`missing MVP pages for ${group}`);
    }
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_platform_mvp_validation.v1",
    summary: summarizeArcLabPlatformMvp(),
    errors
  };
}

function buildRoles() {
  return {
    coach: {
      login: "phone",
      jobs: [
        "add_students",
        "generate_invite_links",
        "upload_lesson_videos",
        "review_homework_videos",
        "confirm_problem_tags",
        "edit_ai_drafts",
        "publish_feedback_and_training_plans",
        "review_trends"
      ]
    },
    student: {
      entry: "invite_link",
      first_access: "phone_binding",
      jobs: [
        "watch_lesson_videos",
        "view_coach_feedback",
        "complete_homework_plans",
        "upload_homework_retest_videos",
        "view_simplified_progress",
        "browse_paid_training_knowledge"
      ]
    },
    admin: {
      scope: "minimal_organization_context",
      full_dashboard_in_mvp: false
    }
  };
}

function buildReviewQueue() {
  return [
    {
      review_id: "review_retest_001",
      athlete_name: "小明",
      uploaded_at: "2026-06-26T09:30:00.000Z",
      source_type: "athlete_homework",
      status: REVIEW_STATUS.homework,
      priority_student: true,
      evidence_hints: ["复测视频已上传", "起球时序证据可用"],
      sort_score: 100,
      confirmed_main_problem_visible_before_review: false
    },
    {
      review_id: "review_lesson_001",
      athlete_name: "小凯",
      uploaded_at: "2026-06-25T11:20:00.000Z",
      source_type: "coach_lesson",
      status: REVIEW_STATUS.waiting,
      priority_student: false,
      evidence_hints: ["出手高度证据可用"],
      sort_score: 72,
      confirmed_main_problem_visible_before_review: false
    },
    {
      review_id: "review_draft_001",
      athlete_name: "小林",
      uploaded_at: "2026-06-24T15:00:00.000Z",
      source_type: "coach_lesson",
      status: REVIEW_STATUS.draft,
      priority_student: false,
      evidence_hints: ["AI 草稿待教练编辑"],
      sort_score: 60,
      confirmed_main_problem_visible_before_review: false
    }
  ].sort((left, right) => right.sort_score - left.sort_score);
}

function buildNotifications(reviewQueue) {
  return reviewQueue.map((item) => ({
    id: `notification_${item.review_id}`,
    level: item.priority_student || item.status === REVIEW_STATUS.homework ? "important" : "normal",
    reason: item.status === REVIEW_STATUS.homework ? "retest_uploaded" : "waiting_for_coach_confirmation",
    visible_to_role: "coach"
  }));
}

function buildStudentExperience({ published, trendSnapshot, knowledgeDirectory, knowledgeAnswer, personalDiagnosisRefusal }) {
  return {
    feedback_result: {
      order: [
        "coach_final_conclusion",
        "next_3_step_training_plan",
        "annotated_video",
        "recent_3_session_comparison",
        "evidence_detail"
      ],
      coach_final_conclusion: {
        primary_problem_tag_id: published.final_plan.primary_problem_tag_id,
        source_of_truth: published.source_of_truth
      },
      training_plan_cards: published.final_plan.steps.map((step) => ({
        step_type: step.step_type,
        drill_name: step.title,
        dosage: step.dosage,
        short_reason: step.short_reason || reasonForStep(step.step_type),
        success_target: step.success_target || successTargetForStep(step.step_type),
        retest_upload_request: step.step_type === "retest"
      })),
      hidden_from_student: [
        "ai_raw_draft",
        "full_evidence_trace_by_default",
        "rejected_tags",
        "coach_edit_diff_json",
        "organization_recommendation_labels"
      ]
    },
    simplified_progress: trendSnapshot.student_view,
    knowledge_directory: {
      article_count: knowledgeDirectory.articles.length,
      articles: knowledgeDirectory.articles.slice(0, 6),
      hidden_from_student: knowledgeDirectory.hidden_from_student
    },
    knowledge_assistant: {
      general_answer: knowledgeAnswer,
      personal_diagnosis_refusal: personalDiagnosisRefusal,
      usage_counter: {
        table: "knowledge_assistant_usage",
        daily_limit: knowledgeAnswer.usage.daily_limit,
        ai_answer_count_today: knowledgeAnswer.usage.ai_answer_count_after_response,
        saves_student_question: false,
        chat_history_written: false,
        question_log_visible_to_coach: false
      }
    }
  };
}

function buildDataModel() {
  const fields = {
    training_sessions: ["id", "organization_id", "athlete_id", "coach_id", "source_type", "uploaded_by_role", "initial_problem_tag_id", "shot_type", "camera_view", "linked_task_id", "visibility_to_athlete", "status", "created_at"],
    video_assets: ["id", "organization_id", "athlete_id", "session_id", "storage_provider", "object_key", "camera_view", "shot_type", "uploaded_by", "retention_until", "deleted_at"],
    session_problem_tags: ["session_id", "problem_tag_id", "role", "source", "status", "coach_note"],
    training_task_drafts: ["session_id", "coach_id", "athlete_id", "ai_draft_json", "final_published_json", "diff_json", "source_candidate_ids", "status"],
    training_plan_step_results: ["training_task_id", "drill_id", "step_type", "effectiveness_status", "coach_note"],
    knowledge_articles: ["id", "slug", "title", "category", "student_summary", "student_body", "related_problem_tag_ids", "related_drill_ids", "source_type", "source_path", "visible_to_students"],
    knowledge_assistant_usage: ["id", "organization_id", "athlete_id", "usage_date", "ai_answer_count", "created_at", "updated_at"]
  };
  return {
    schema_version: "arc_lab_data_model_blueprint.v1",
    tables: ARC_LAB_DATA_MODEL_TABLES.map((name) => ({
      name,
      key_fields: fields[name] || ["id", "organization_id", "created_at"]
    })),
    seed_sources: {
      problem_tags: PROBLEM_TAGS.length,
      drill_library: DRILL_LIBRARY_SEED.length,
      camera_views: CAMERA_VIEWS.map((item) => item.id),
      shot_types: SHOT_TYPES.map((item) => item.id),
      video_source_types: VIDEO_SOURCE_TYPES.map((item) => item.id),
      training_plan_step_types: TRAINING_PLAN_STEP_TYPES.map((item) => item.id)
    }
  };
}

function platformTrendFixture() {
  const metric = (value) => ({
    metric_id: "ball_lift_delay_ms",
    label: "起球延迟",
    value,
    unit: "ms",
    improvement_direction: "decrease"
  });
  return [
    { session_id: "lesson_3", occurred_at: "2026-06-25T09:00:00.000Z", source_type: "coach_lesson", camera_view: "side", shot_type: "spot_up", coach_confirmed_primary_problem_id: "hand_leads_before_lower_body", metrics: [metric(105)], evidence_confidence: "medium" },
    { session_id: "lesson_2", occurred_at: "2026-06-18T09:00:00.000Z", source_type: "coach_lesson", camera_view: "side", shot_type: "spot_up", coach_confirmed_primary_problem_id: "hand_leads_before_lower_body", metrics: [metric(145)], evidence_confidence: "medium" },
    { session_id: "lesson_1", occurred_at: "2026-06-11T09:00:00.000Z", source_type: "coach_lesson", camera_view: "side", shot_type: "spot_up", coach_confirmed_primary_problem_id: "hand_leads_before_lower_body", metrics: [metric(210)], evidence_confidence: "low" },
    { session_id: "homework_2", occurred_at: "2026-06-24T19:00:00.000Z", source_type: "athlete_homework", camera_view: "side", shot_type: "spot_up", coach_confirmed_primary_problem_id: "hand_leads_before_lower_body", metrics: [metric(135)], evidence_confidence: "low" },
    { session_id: "homework_1", occurred_at: "2026-06-17T19:00:00.000Z", source_type: "athlete_homework", camera_view: "side", shot_type: "spot_up", coach_confirmed_primary_problem_id: "hand_leads_before_lower_body", metrics: [metric(170)], evidence_confidence: "low" },
    { session_id: "front_lesson_1", occurred_at: "2026-06-23T09:00:00.000Z", source_type: "coach_lesson", camera_view: "front", shot_type: "spot_up", coach_confirmed_primary_problem_id: "elbow_wrist_line_not_straight", metrics: [{ ...metric(12), metric_id: "release_line_offset_cm", label: "出手力线偏移", unit: "cm" }], evidence_confidence: "medium" }
  ];
}

function reasonForStep(stepType) {
  if (stepType === "correction") return "用于重建当前主问题对应的动作模式。";
  if (stepType === "transfer") return "用于把纠正动作迁移到真实投篮节奏。";
  return "用于用同一视角和同一投篮类型复测。";
}

function successTargetForStep(stepType) {
  if (stepType === "correction") return "按稳定顺序完成训练次数。";
  if (stepType === "transfer") return "连续命中时保持节奏稳定。";
  return "按指定视角上传 10 次投篮。";
}

function requireEqual(errors, actual, expected, message) {
  if (actual !== expected) errors.push(`${message}: expected ${expected}, got ${actual}`);
}

function requireIncludes(errors, values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    errors.push(`${message}: missing ${expected}`);
  }
}
