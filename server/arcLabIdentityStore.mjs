import { randomUUID } from "node:crypto";
import {
  ARC_LAB_MVP_CONTRACT,
  CAMERA_VIEWS,
  DRILL_LIBRARY_SEED,
  PROBLEM_TAGS,
  SHOT_TYPES,
  buildTrendKey
} from "./arcLabContracts.mjs";
import {
  buildAiTrainingPlanDraft,
  evaluateHomeworkViewPolicy,
  publishCoachTrainingPlan,
  validateCoachProblemConfirmation,
  validateVideoUploadMetadata
} from "./arcLabWorkflow.mjs";
import { buildArcLabTrendSnapshot } from "./arcLabTrends.mjs";
import { buildStudentKnowledgeAssistantResponse, buildStudentKnowledgeDirectory } from "./arcLabKnowledgeAssistant.mjs";

export const ARC_LAB_IDENTITY_SCHEMA_VERSION = "arc_lab_identity_invite.v1";
export const ARC_LAB_INVITE_VALIDITY_DAYS = 30;

const DEFAULT_ORG_NAME = "Arc Lab 本地训练机构";
const DEFAULT_REVIEW_STAGES = [
  ["ball_lift", "举球启动"],
  ["lower_body_start", "下肢启动"],
  ["release", "出手"],
  ["follow_through", "随球跟随"]
];

export function createArcLabIdentityStore({ now = () => new Date(), basePath = "/arc-lab.html" } = {}) {
  const state = {
    profiles: [],
    organizations: [],
    organization_members: [],
    athletes: [],
    coach_athlete_relations: [],
    athlete_invites: [],
    training_sessions: [],
    video_assets: [],
    evidence_packets: [],
    ai_report_drafts: [],
    coach_feedback: [],
    training_task_drafts: [],
    training_tasks: [],
    training_plan_steps: [],
    training_plan_step_results: [],
    session_problem_tags: [],
    athlete_metric_snapshots: [],
    trend_explanation_drafts: [],
    knowledge_assistant_usage: [],
    notifications: [],
    coach_athlete_flags: [],
    audit_events: []
  };

  function loginCoach(input = {}) {
    const phone = normalizePhone(input.phone);
    if (!phone) return error("invalid_phone", "Coach phone is required.");
    const timestamp = now().toISOString();
    let profile = state.profiles.find((item) => item.phone === phone && item.role === "coach");
    if (!profile) {
      profile = {
        id: makeId("profile"),
        phone,
        display_name: cleanText(input.display_name) || "本地教练",
        role: "coach",
        created_at: timestamp
      };
      state.profiles.push(profile);
    }

    let organization = state.organizations.find((item) => item.created_by === profile.id);
    if (!organization) {
      organization = {
        id: makeId("org"),
        name: cleanText(input.organization_name) || DEFAULT_ORG_NAME,
        created_by: profile.id,
        created_at: timestamp
      };
      state.organizations.push(organization);
      state.organization_members.push({
        organization_id: organization.id,
        profile_id: profile.id,
        role: "owner",
        created_at: timestamp
      });
      audit({
        organization_id: organization.id,
        actor_profile_id: profile.id,
        action: "default_organization_created",
        target_type: "organization",
        target_id: organization.id,
        created_at: timestamp
      });
    }

    audit({
      organization_id: organization.id,
      actor_profile_id: profile.id,
      action: "coach_local_phone_login",
      target_type: "profile",
      target_id: profile.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
      auth_mode: "local_mock_phone_login",
      profile,
      organization,
      organization_member: state.organization_members.find((item) => item.organization_id === organization.id && item.profile_id === profile.id)
    };
  }

  function addAthlete(input = {}) {
    const coach = requireCoach(input.coach_id);
    if (!coach.ok) return coach;
    const displayName = cleanText(input.display_name);
    if (!displayName) return error("invalid_athlete_name", "Athlete display_name is required.");
    const timestamp = now().toISOString();
    const athlete = {
      id: makeId("athlete"),
      organization_id: coach.organization.id,
      display_name: displayName,
      phone: normalizePhone(input.phone) || null,
      created_at: timestamp,
      deleted_at: null,
      deleted_by: null
    };
    const relation = {
      coach_id: coach.profile.id,
      athlete_id: athlete.id,
      organization_id: coach.organization.id,
      created_at: timestamp
    };
    const invite = buildInvite({
      organization_id: coach.organization.id,
      athlete_id: athlete.id,
      coach_id: coach.profile.id,
      created_at: timestamp
    });
    state.athletes.push(athlete);
    state.coach_athlete_relations.push(relation);
    state.athlete_invites.push(invite);
    audit({
      organization_id: coach.organization.id,
      actor_profile_id: coach.profile.id,
      action: "athlete_created_with_invite",
      target_type: "athlete",
      target_id: athlete.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
      athlete,
      coach_athlete_relation: relation,
      invite: publicInvite(invite),
      invite_link: inviteLink(invite.token)
    };
  }

  function getCoachHome(coachId) {
    const coach = requireCoach(coachId);
    if (!coach.ok) return coach;
    const athletes = state.coach_athlete_relations
      .filter((relation) => relation.coach_id === coach.profile.id && relation.organization_id === coach.organization.id)
      .map((relation) => {
        const athlete = state.athletes.find((item) => item.id === relation.athlete_id);
        if (!athlete || athlete.deleted_at) return null;
        const invite = latestInviteForAthlete(athlete?.id);
        return {
          ...athlete,
          priority_student: isPriorityStudent(coach.profile.id, athlete?.id),
          invite: invite ? publicInvite(invite) : null,
          invite_link: invite ? inviteLink(invite.token) : null
        };
      })
      .filter(Boolean);
    const reviewQueue = buildCoachReviewQueue(coach);
    const notifications = state.notifications
      .filter((item) => item.organization_id === coach.organization.id && item.coach_id === coach.profile.id)
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .map(publicCoachNotification);

    return {
      ok: true,
      schema_version: "arc_lab_coach_home.v1",
      profile: coach.profile,
      organization: coach.organization,
      athletes,
      review_queue: reviewQueue,
      notifications,
      audit_event_count: state.audit_events.filter((event) => event.organization_id === coach.organization.id).length,
      boundaries: {
        ...identityBoundaries(),
        queue_is_organization_scoped: true,
        confirmed_main_problem_visible_before_review: false,
        priority_flags_visible_only_to_owner_coach: true
      }
    };
  }

  function setCoachAthletePriority(input = {}) {
    const relation = requireCoachAthlete(input.coach_id, input.athlete_id);
    if (!relation.ok) return relation;
    const active = input.active !== false;
    const timestamp = now().toISOString();
    let flag = state.coach_athlete_flags.find((item) => item.coach_id === relation.profile.id && item.athlete_id === relation.athlete.id && item.flag_type === "priority");
    if (!flag) {
      flag = {
        id: makeId("coach_flag"),
        organization_id: relation.organization.id,
        coach_id: relation.profile.id,
        athlete_id: relation.athlete.id,
        flag_type: "priority",
        active,
        created_at: timestamp,
        updated_at: timestamp
      };
      state.coach_athlete_flags.push(flag);
    } else {
      flag.active = active;
      flag.updated_at = timestamp;
    }
    audit({
      organization_id: relation.organization.id,
      actor_profile_id: relation.profile.id,
      action: active ? "coach_athlete_priority_enabled" : "coach_athlete_priority_disabled",
      target_type: "coach_athlete_flag",
      target_id: flag.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: "arc_lab_coach_athlete_priority.v1",
      athlete: { id: relation.athlete.id, display_name: relation.athlete.display_name },
      priority_student: active,
      flag: publicCoachFlag(flag),
      next_step: "review_queue_reordered"
    };
  }

  function buildCoachReviewQueue(coach) {
    const pendingStatuses = new Set(["waiting_for_coach_confirmation", "retest_uploaded", "supplemental_wrong_view_record"]);
    return state.training_sessions
      .filter((session) => session.coach_id === coach.profile.id && session.organization_id === coach.organization.id && pendingStatuses.has(session.status))
      .filter((session) => !session.deleted_at)
      .map((session) => {
        const athlete = state.athletes.find((item) => item.id === session.athlete_id);
        const packet = state.evidence_packets.find((item) => item.session_id === session.id);
        const priorityStudent = isPriorityStudent(coach.profile.id, session.athlete_id);
        const repeatedUnresolvedCount = countRepeatedUnresolved(session);
        const ageHours = Math.max(0, Math.floor((now().getTime() - new Date(session.created_at).getTime()) / 3_600_000));
        const sortReasons = [];
        if (session.status === "retest_uploaded") sortReasons.push("retest_uploaded");
        if (repeatedUnresolvedCount > 0) sortReasons.push("repeated_unresolved_problem");
        if (ageHours >= 24) sortReasons.push("waiting_too_long");
        if (priorityStudent) sortReasons.push("priority_student");
        return {
          session_id: session.id,
          athlete_id: session.athlete_id,
          athlete_name: athlete?.display_name || "未知学生",
          uploaded_at: session.created_at,
          source_type: session.source_type,
          status: session.status,
          priority_student: priorityStudent,
          repeated_unresolved_count: repeatedUnresolvedCount,
          waiting_hours: ageHours,
          evidence_hints: (packet?.packet_json?.evidence_hints || []).map((hint) => hint.wording || String(hint)),
          sort_reasons: sortReasons,
          confirmed_main_problem_visible_before_review: false
        };
      })
      .sort(compareQueueItems);
  }

  function countRepeatedUnresolved(session) {
    const problemTagId = coachRelevantProblemTag(session.id);
    if (!problemTagId) return 0;
    return state.training_sessions.filter((item) => {
      if (item.id === session.id || item.organization_id !== session.organization_id || item.athlete_id !== session.athlete_id) return false;
      if (coachRelevantProblemTag(item.id) !== problemTagId) return false;
      const task = state.training_tasks.find((candidate) => candidate.session_id === item.id || candidate.id === item.linked_task_id);
      return ["retest_uploaded", "watching", "ineffective"].includes(task?.status);
    }).length;
  }

  function coachRelevantProblemTag(sessionId) {
    return confirmedPrimaryTag(sessionId)?.problem_tag_id || state.training_sessions.find((item) => item.id === sessionId)?.initial_problem_tag_id || null;
  }

  function isPriorityStudent(coachId, athleteId) {
    return Boolean(state.coach_athlete_flags.find((item) => item.coach_id === coachId && item.athlete_id === athleteId && item.flag_type === "priority" && item.active));
  }

  function publicCoachFlag(flag) {
    return {
      id: flag.id,
      athlete_id: flag.athlete_id,
      flag_type: flag.flag_type,
      active: flag.active,
      updated_at: flag.updated_at
    };
  }

  function createCoachNotification({ organizationId, coachId, athleteId, sessionId, level, reason, createdAt }) {
    state.notifications.push({
      id: makeId("notification"),
      organization_id: organizationId,
      coach_id: coachId,
      athlete_id: athleteId,
      session_id: sessionId,
      level,
      reason,
      visible_to_role: "coach",
      created_at: createdAt
    });
  }

  function publicCoachNotification(notification) {
    const athlete = state.athletes.find((item) => item.id === notification.athlete_id);
    return {
      id: notification.id,
      athlete_name: athlete?.display_name || "未知学生",
      session_id: notification.session_id,
      level: notification.level,
      reason: notification.reason,
      created_at: notification.created_at
    };
  }

  function getInvite(token) {
    const invite = state.athlete_invites.find((item) => item.token === cleanToken(token));
    if (!invite) return error("invite_not_found", "Invite token was not found.", 404);
    const athlete = state.athletes.find((item) => item.id === invite.athlete_id);
    const organization = state.organizations.find((item) => item.id === invite.organization_id);
    return {
      ok: true,
      schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
      invite: publicInvite(invite),
      invite_link: inviteLink(invite.token),
      organization: organization ? { id: organization.id, name: organization.name } : null,
      athlete: athlete ? { id: athlete.id, display_name: athlete.display_name, phone_bound: Boolean(athlete.phone) } : null,
      student_visible_ai_draft: false,
      status: inviteStatus(invite)
    };
  }

  function bindInvitePhone(input = {}) {
    const token = cleanToken(input.token);
    const phone = normalizePhone(input.phone);
    if (!phone) return error("invalid_phone", "Student phone is required.");
    const invite = state.athlete_invites.find((item) => item.token === token);
    if (!invite) return error("invite_not_found", "Invite token was not found.", 404);
    if (inviteStatus(invite) === "expired") return error("invite_expired", "Invite is expired.", 410);
    const athlete = state.athletes.find((item) => item.id === invite.athlete_id);
    if (!athlete) return error("athlete_not_found", "Invite athlete was not found.", 404);
    const timestamp = now().toISOString();
    let profile = state.profiles.find((item) => item.phone === phone && item.role === "student");
    if (!profile) {
      profile = {
        id: makeId("profile"),
        phone,
        display_name: athlete.display_name,
        role: "student",
        created_at: timestamp
      };
      state.profiles.push(profile);
    }
    athlete.phone = phone;
    invite.phone_bound_at = timestamp;
    invite.bound_profile_id = profile.id;
    if (!state.organization_members.some((item) => item.organization_id === invite.organization_id && item.profile_id === profile.id)) {
      state.organization_members.push({
        organization_id: invite.organization_id,
        profile_id: profile.id,
        role: "student",
        created_at: timestamp
      });
    }
    audit({
      organization_id: invite.organization_id,
      actor_profile_id: profile.id,
      action: "student_phone_bound_from_invite",
      target_type: "athlete_invite",
      target_id: invite.id,
      created_at: timestamp
    });

    return {
      ok: true,
      schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
      auth_mode: "local_invite_phone_binding",
      profile,
      athlete: { ...athlete },
      invite: publicInvite(invite),
      student_home: {
        visible_sections: ["coach_published_feedback", "three_step_training_plan", "homework_upload"],
        hidden_from_student: ["ai_report_drafts", "coach_edit_diff_json", "rejected_problem_tags"]
      }
    };
  }

  function uploadCoachLesson(input = {}) {
    const relation = requireCoachAthlete(input.coach_id, input.athlete_id);
    if (!relation.ok) return relation;
    const metadata = validateVideoUploadMetadata({
      source_type: "coach_lesson",
      initial_problem_tag_id: input.initial_problem_tag_id,
      camera_view: input.camera_view,
      shot_type: input.shot_type
    });
    if (!metadata.ok) {
      return {
        ok: false,
        schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
        error: "invalid_lesson_metadata",
        message: metadata.errors.join(" "),
        status: 400,
        validation: metadata
      };
    }

    const timestamp = now().toISOString();
    const session = {
      id: makeId("session"),
      organization_id: relation.organization.id,
      athlete_id: relation.athlete.id,
      coach_id: relation.profile.id,
      source_type: "coach_lesson",
      uploaded_by_role: "coach",
      initial_problem_tag_id: metadata.normalized.initial_problem_tag_id,
      shot_type: metadata.normalized.shot_type,
      camera_view: metadata.normalized.camera_view,
      linked_task_id: null,
      trend_metric_value: normalizeTrendMetricValue(input.trend_metric_value),
      visibility_to_athlete: input.visibility_to_athlete !== false,
      status: "waiting_for_coach_confirmation",
      created_at: timestamp,
      deleted_at: null,
      deleted_by: null
    };
    const videoAsset = {
      id: makeId("video"),
      organization_id: session.organization_id,
      athlete_id: session.athlete_id,
      session_id: session.id,
      storage_provider: "local_contract",
      object_key: cleanObjectKey(input.object_key || input.file_name || `${session.id}.mp4`),
      local_upload_id: cleanText(input.upload_id) || null,
      camera_view: session.camera_view,
      shot_type: session.shot_type,
      uploaded_by: relation.profile.id,
      retention_until: null,
      deleted_at: null,
      deleted_by: null
    };
    const evidencePacket = buildVideoEvidencePacket({ session, videoAsset });
    const aiDraft = buildVideoAiDraft({ session, evidencePacket });
    const suggestedTag = {
      session_id: session.id,
      problem_tag_id: session.initial_problem_tag_id,
      role: "primary",
      source: "evidence_suggested",
      status: "suggested",
      coach_note: "上传时选择的初始问题标签，只作为教练确认前上下文。"
    };

    state.training_sessions.push(session);
    state.video_assets.push(videoAsset);
    state.evidence_packets.push(evidencePacket);
    state.ai_report_drafts.push(aiDraft);
    state.session_problem_tags.push(suggestedTag);
    audit({
      organization_id: relation.organization.id,
      actor_profile_id: relation.profile.id,
      action: "coach_lesson_uploaded_for_review",
      target_type: "training_session",
      target_id: session.id,
      created_at: timestamp
    });
    createCoachNotification({
      organizationId: relation.organization.id,
      coachId: relation.profile.id,
      athleteId: relation.athlete.id,
      sessionId: session.id,
      level: isPriorityStudent(relation.profile.id, relation.athlete.id) ? "important" : "normal",
      reason: "lesson_uploaded_waiting_for_coach_confirmation",
      createdAt: timestamp
    });

    return {
      ok: true,
      schema_version: "arc_lab_coach_lesson_upload.v1",
      source_contract: "coach_lesson_upload_creates_evidence_and_ai_draft_for_coach_only",
      session,
      video_asset: videoAsset,
      evidence_packet: evidencePacket,
      ai_report_draft: {
        ...aiDraft,
        draft_json: {
          ...aiDraft.draft_json,
          evidence_summary: aiDraft.draft_json.evidence_summary
        }
      },
      session_problem_tag: suggestedTag,
      next_step: "coach_confirms_primary_and_secondary_problem_tags",
      student_visible_ai_draft: false
    };
  }

  function listCoachLessons(coachId) {
    const coach = requireCoach(coachId);
    if (!coach.ok) return coach;
    const lessons = state.training_sessions
      .filter((session) => session.coach_id === coach.profile.id && session.organization_id === coach.organization.id && session.source_type === "coach_lesson")
      .filter((session) => !session.deleted_at)
      .map((session) => ({
        session,
        athlete: state.athletes.find((item) => item.id === session.athlete_id) || null,
        video_asset: state.video_assets.find((item) => item.session_id === session.id && !item.deleted_at) || null,
        evidence_packet: state.evidence_packets.find((item) => item.session_id === session.id) || null,
        ai_report_draft: state.ai_report_drafts.find((item) => item.session_id === session.id) || null,
        coach_feedback: state.coach_feedback.find((item) => item.session_id === session.id) || null,
        training_task: state.training_tasks.find((item) => item.session_id === session.id) || null,
        suggested_tags: state.session_problem_tags.filter((item) => item.session_id === session.id)
      }))
      .sort((left, right) => String(right.session.created_at).localeCompare(String(left.session.created_at)));
    return {
      ok: true,
      schema_version: "arc_lab_coach_lesson_list.v1",
      lessons,
      boundaries: {
        source_type: "coach_lesson_only",
        homework_excluded: true,
        student_visible_ai_draft: false
      }
    };
  }

  function uploadStudentHomework(input = {}) {
    const student = requireBoundInvite(input.token);
    if (!student.ok) return student;
    const task = state.training_tasks.find((item) => item.id === cleanText(input.training_task_id) && !item.deleted_at);
    if (!task) return error("training_task_not_found", "Training task was not found.", 404);
    if (task.organization_id !== student.organization.id || task.athlete_id !== student.athlete.id) {
      return error("student_training_task_not_found", "Training task is not assigned to this student.", 403);
    }
    const retestContext = getTaskRetestContext(task);
    if (!retestContext.ok) return retestContext;
    const metadata = validateVideoUploadMetadata({
      source_type: "athlete_homework",
      linked_task_id: task.id,
      requested_camera_view: retestContext.requested_camera_view,
      camera_view: input.camera_view,
      shot_type: input.shot_type,
      coach_confirmed_primary_problem_id: retestContext.primary_problem_tag_id
    });
    if (!metadata.ok) {
      return {
        ok: false,
        schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
        error: "invalid_homework_metadata",
        message: metadata.errors.join(" "),
        status: 400,
        validation: metadata
      };
    }
    const viewPolicy = evaluateHomeworkViewPolicy({
      requested_camera_view: retestContext.requested_camera_view,
      actual_camera_view: metadata.normalized.camera_view
    });
    if (!viewPolicy.ok) return error("invalid_homework_view_policy", viewPolicy.errors.join(" "));

    const timestamp = now().toISOString();
    if (input.self_reported_complete !== false) {
      task.status = "completed_by_self_report";
      task.completed_by_self_report_at = timestamp;
    }
    const session = {
      id: makeId("session"),
      organization_id: student.organization.id,
      athlete_id: student.athlete.id,
      coach_id: task.coach_id,
      source_type: "athlete_homework",
      uploaded_by_role: "athlete",
      initial_problem_tag_id: retestContext.primary_problem_tag_id,
      shot_type: metadata.normalized.shot_type,
      camera_view: metadata.normalized.camera_view,
      linked_task_id: task.id,
      trend_metric_value: normalizeTrendMetricValue(input.trend_metric_value),
      visibility_to_athlete: true,
      status: viewPolicy.counts_as_requested_homework_completion ? "retest_uploaded" : "supplemental_wrong_view_record",
      homework_view_policy: viewPolicy,
      created_at: timestamp,
      deleted_at: null,
      deleted_by: null
    };
    const videoAsset = {
      id: makeId("video"),
      organization_id: session.organization_id,
      athlete_id: session.athlete_id,
      session_id: session.id,
      storage_provider: "local_contract",
      object_key: cleanObjectKey(input.object_key || input.file_name || `${session.id}.mp4`),
      local_upload_id: cleanText(input.upload_id) || null,
      camera_view: session.camera_view,
      shot_type: session.shot_type,
      uploaded_by: student.profile.id,
      retention_until: null,
      deleted_at: null,
      deleted_by: null
    };
    const evidencePacket = buildVideoEvidencePacket({ session, videoAsset });
    const aiDraft = buildVideoAiDraft({ session, evidencePacket });
    const inheritedTag = {
      session_id: session.id,
      problem_tag_id: retestContext.primary_problem_tag_id,
      role: "primary",
      source: "coach_confirmed",
      status: "confirmed",
      coach_note: "作业沿用任务所属的教练确认主问题，用于同轨趋势比较。"
    };

    if (viewPolicy.counts_as_requested_homework_completion) {
      task.status = "retest_uploaded";
      task.retest_uploaded_at = timestamp;
    }
    state.training_sessions.push(session);
    state.video_assets.push(videoAsset);
    state.evidence_packets.push(evidencePacket);
    state.ai_report_drafts.push(aiDraft);
    state.session_problem_tags.push(inheritedTag);
    const metricSnapshot = recordMetricSnapshot({
      session,
      primaryProblemTagId: inheritedTag.problem_tag_id,
      createdAt: timestamp
    });
    audit({
      organization_id: student.organization.id,
      actor_profile_id: student.profile.id,
      action: "student_homework_uploaded",
      target_type: "training_session",
      target_id: session.id,
      created_at: timestamp
    });
    createCoachNotification({
      organizationId: student.organization.id,
      coachId: session.coach_id,
      athleteId: student.athlete.id,
      sessionId: session.id,
      level: session.status === "retest_uploaded" || isPriorityStudent(session.coach_id, student.athlete.id) ? "important" : "normal",
      reason: session.status === "retest_uploaded" ? "retest_uploaded" : "supplemental_wrong_view_uploaded",
      createdAt: timestamp
    });

    return {
      ok: true,
      schema_version: "arc_lab_student_homework_upload.v1",
      source_contract: "student_homework_retest_uses_coach_confirmed_task_context",
      session,
      video_asset: videoAsset,
      evidence_packet: {
        id: evidencePacket.id,
        packet_json: {
          source_type: evidencePacket.packet_json.source_type,
          trend_key_preview: evidencePacket.packet_json.trend_key_preview,
          coach_confirmation_required: evidencePacket.packet_json.coach_confirmation_required
        }
      },
      training_task: {
        id: task.id,
        status: task.status
      },
      view_policy: viewPolicy,
      athlete_metric_snapshot: metricSnapshot,
      student_visible_ai_draft: false,
      next_step: "coach_reviews_effectiveness"
    };
  }

  function listCoachHomework(coachId) {
    const coach = requireCoach(coachId);
    if (!coach.ok) return coach;
    const homework = state.training_sessions
      .filter((session) => session.coach_id === coach.profile.id && session.organization_id === coach.organization.id && session.source_type === "athlete_homework")
      .filter((session) => !session.deleted_at)
      .map((session) => {
        const task = state.training_tasks.find((item) => item.id === session.linked_task_id) || null;
        return {
          session,
          athlete: state.athletes.find((item) => item.id === session.athlete_id) || null,
          video_asset: state.video_assets.find((item) => item.session_id === session.id && !item.deleted_at) || null,
          evidence_packet: state.evidence_packets.find((item) => item.session_id === session.id) || null,
          ai_report_draft: state.ai_report_drafts.find((item) => item.session_id === session.id) || null,
          training_task: task,
          training_plan_steps: task ? state.training_plan_steps.filter((step) => step.training_task_id === task.id) : [],
          step_results: task ? state.training_plan_step_results.filter((result) => result.training_task_id === task.id) : [],
          confirmed_tags: state.session_problem_tags.filter((tag) => tag.session_id === session.id && tag.source === "coach_confirmed")
        };
      })
      .sort((left, right) => String(right.session.created_at).localeCompare(String(left.session.created_at)));
    return {
      ok: true,
      schema_version: "arc_lab_coach_homework_list.v1",
      homework,
      boundaries: {
        source_type: "athlete_homework_only",
        wrong_view_saved_as_supplemental: true,
        ai_draft_student_visible: false
      }
    };
  }

  function reviewCoachHomework(input = {}) {
    const coach = requireCoach(input.coach_id);
    if (!coach.ok) return coach;
    const session = state.training_sessions.find((item) => item.id === cleanText(input.session_id));
    if (!session || session.deleted_at) return error("session_not_found", "Training session was not found.", 404);
    if (session.source_type !== "athlete_homework") return error("session_not_homework", "Only athlete homework can be reviewed here.", 400);
    if (session.coach_id !== coach.profile.id || session.organization_id !== coach.organization.id) {
      return error("coach_homework_not_found", "Homework is not assigned to this coach organization.", 403);
    }
    const task = state.training_tasks.find((item) => item.id === session.linked_task_id);
    if (!task) return error("linked_training_task_not_found", "Homework task was not found.", 404);
    const planSteps = state.training_plan_steps.filter((step) => step.training_task_id === task.id);
    const supplied = Array.isArray(input.step_effectiveness) ? input.step_effectiveness : [];
    const suppliedByType = new Map();
    for (const item of supplied) {
      const stepType = cleanText(item?.step_type);
      const status = cleanText(item?.effectiveness_status);
      if (!planSteps.some((step) => step.step_type === stepType)) {
        return error("invalid_training_plan_step", "Effectiveness review contains an unknown training plan step.");
      }
      if (!["effective", "ineffective", "watching", "unrated"].includes(status)) {
        return error("invalid_effectiveness_status", "Effectiveness status must be effective, ineffective, watching, or unrated.");
      }
      if (suppliedByType.has(stepType)) return error("duplicate_training_plan_step", "Each training plan step can be reviewed once per request.");
      suppliedByType.set(stepType, item);
    }

    const timestamp = now().toISOString();
    const stepResults = planSteps.map((step) => {
      const submitted = suppliedByType.get(step.step_type) || {};
      const existing = state.training_plan_step_results.find((item) => item.training_task_id === task.id && item.step_type === step.step_type);
      const next = {
        id: existing?.id || makeId("step_result"),
        training_task_id: task.id,
        drill_id: step.drill_id,
        step_type: step.step_type,
        effectiveness_status: cleanText(submitted.effectiveness_status) || "unrated",
        coach_note: cleanText(submitted.coach_note || input.coach_note)
      };
      if (existing) Object.assign(existing, next);
      else state.training_plan_step_results.push(next);
      return next;
    });
    const drillStatuses = stepResults.filter((item) => item.drill_id).map((item) => item.effectiveness_status);
    const taskStatus = session.homework_view_policy?.counts_as_requested_homework_completion
      ? summarizeHomeworkTaskStatus(drillStatuses)
      : task.status;
    task.status = taskStatus;
    task.coach_reviewed_at = timestamp;
    session.status = "coach_reviewed";
    session.coach_reviewed_at = timestamp;
    audit({
      organization_id: coach.organization.id,
      actor_profile_id: coach.profile.id,
      action: "coach_homework_effectiveness_reviewed",
      target_type: "training_session",
      target_id: session.id,
      created_at: timestamp
    });
    if (task.status === "ineffective") {
      createCoachNotification({
        organizationId: coach.organization.id,
        coachId: coach.profile.id,
        athleteId: session.athlete_id,
        sessionId: session.id,
        level: "important",
        reason: "ineffective_plan_needs_action",
        createdAt: timestamp
      });
    }

    return {
      ok: true,
      schema_version: "arc_lab_coach_homework_review.v1",
      source_contract: "coach_reviews_drill_effectiveness_after_student_retest",
      session,
      training_task: {
        id: task.id,
        status: task.status
      },
      training_plan_step_results: stepResults,
      counts_as_requested_homework_completion: session.homework_view_policy?.counts_as_requested_homework_completion === true,
      next_step: session.homework_view_policy?.counts_as_requested_homework_completion ? "trend_can_compare_confirmed_task_context" : "student_uploads_requested_view_retest"
    };
  }

  function publishCoachReview(input = {}) {
    const review = requireCoachLessonSession(input.coach_id, input.session_id);
    if (!review.ok) return review;
    const confirmation = validateCoachProblemConfirmation({
      primary_problem_tag_id: input.primary_problem_tag_id,
      secondary_problem_tag_ids: normalizeSecondaryTags(input.secondary_problem_tag_ids),
      coach_note: cleanText(input.coach_note)
    });
    if (!confirmation.ok) {
      return {
        ok: false,
        schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
        error: "invalid_problem_confirmation",
        message: confirmation.errors.join(" "),
        status: 400,
        validation: confirmation
      };
    }
    const existingFeedback = state.coach_feedback.find((item) => item.session_id === review.session.id);
    if (existingFeedback) return error("coach_feedback_already_published", "Coach feedback was already published for this session.", 409);

    const timestamp = now().toISOString();
    const aiTrainingPlanDraft = buildAiTrainingPlanDraft({
      primary_problem_tag_id: confirmation.normalized.primary_problem_tag_id,
      camera_view: review.session.camera_view,
      shot_type: review.session.shot_type
    });
    const coachFinalPlan = buildCoachFinalPlan({
      aiTrainingPlanDraft,
      coachFeedbackText: cleanText(input.coach_feedback_text),
      successTarget: cleanText(input.success_target)
    });
    const published = publishCoachTrainingPlan({
      confirmation: confirmation.normalized,
      aiDraft: aiTrainingPlanDraft,
      coachFinalPlan
    });
    if (!published.ok) {
      return {
        ok: false,
        schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
        error: "publish_validation_failed",
        message: published.errors.join(" "),
        status: 400,
        validation: published
      };
    }

    const coachFeedback = {
      id: makeId("feedback"),
      organization_id: review.session.organization_id,
      session_id: review.session.id,
      coach_id: review.profile.id,
      final_feedback_json: {
        schema_version: "arc_lab_coach_feedback_final.v1",
        source_contract: "coach_confirmed_feedback_student_source_of_truth",
        coach_summary: cleanText(input.coach_feedback_text) || "教练已确认主问题并发布训练计划。",
        coach_confirmed_problem_tags: published.coach_confirmed_problem_tags,
        training_plan: published.final_plan,
        hidden_from_student: published.hidden_from_student
      },
      published_at: timestamp
    };
    const taskDraft = {
      id: makeId("task_draft"),
      organization_id: review.session.organization_id,
      session_id: review.session.id,
      coach_id: review.profile.id,
      athlete_id: review.session.athlete_id,
      ai_draft_json: aiTrainingPlanDraft,
      final_published_json: published.final_plan,
      diff_json: buildCoachEditDiff(aiTrainingPlanDraft, published.final_plan, coachFeedback.final_feedback_json.coach_summary),
      source_candidate_ids: aiTrainingPlanDraft.steps.map((step) => step.drill_slug).filter(Boolean),
      status: "published"
    };
    const trainingTask = {
      id: makeId("task"),
      organization_id: review.session.organization_id,
      athlete_id: review.session.athlete_id,
      coach_id: review.profile.id,
      session_id: review.session.id,
      status: "assigned",
      published_at: timestamp,
      created_at: timestamp
    };
    const planSteps = published.final_plan.steps.map((step, index) => ({
      id: makeId("plan_step"),
      training_task_id: trainingTask.id,
      drill_id: step.drill_slug || null,
      step_type: step.step_type,
      step_order: index + 1,
      dosage: step.dosage,
      cue: step.short_reason || step.title,
      success_target: step.success_target || cleanText(input.success_target) || "按教练要求完成后上传复测。"
    }));
    const confirmedTags = [
      {
        session_id: review.session.id,
        problem_tag_id: confirmation.normalized.primary_problem_tag_id,
        role: "primary",
        source: "coach_confirmed",
        status: "confirmed",
        coach_note: confirmation.normalized.coach_note
      },
      ...confirmation.normalized.secondary_problem_tag_ids.map((tagId) => ({
        session_id: review.session.id,
        problem_tag_id: tagId,
        role: "secondary",
        source: "coach_confirmed",
        status: "confirmed",
        coach_note: confirmation.normalized.coach_note
      }))
    ];

    review.session.status = "coach_feedback_published";
    state.coach_feedback.push(coachFeedback);
    state.training_task_drafts.push(taskDraft);
    state.training_tasks.push(trainingTask);
    state.training_plan_steps.push(...planSteps);
    state.session_problem_tags.push(...confirmedTags);
    const metricSnapshot = recordMetricSnapshot({
      session: review.session,
      primaryProblemTagId: confirmation.normalized.primary_problem_tag_id,
      createdAt: timestamp
    });
    audit({
      organization_id: review.session.organization_id,
      actor_profile_id: review.profile.id,
      action: "coach_feedback_and_training_plan_published",
      target_type: "training_session",
      target_id: review.session.id,
      created_at: timestamp
    });

    return {
      ok: true,
      schema_version: "arc_lab_coach_review_publish.v1",
      source_contract: "coach_confirmation_publishes_student_visible_feedback_not_ai_draft",
      coach_feedback: coachFeedback,
      training_task_draft: taskDraft,
      training_task: trainingTask,
      training_plan_steps: planSteps,
      confirmed_problem_tags: confirmedTags,
      athlete_metric_snapshot: metricSnapshot,
      published_feedback: {
        student_visible: published.student_visible,
        source_of_truth: published.source_of_truth,
        final_plan: published.final_plan,
        hidden_from_student: published.hidden_from_student
      },
      ai_report_draft_student_visible: review.aiReportDraft.student_visible,
      student_result_preview: {
        visible_sections: ["coach_final_conclusion", "coach_feedback", "three_step_training_plan"],
        hidden_from_student: published.hidden_from_student
      }
    };
  }

  function getStudentResultsByInvite(token) {
    const student = requireBoundInvite(token);
    if (!student.ok) return student;
    const { invite, athlete, organization } = student;

    const results = state.training_sessions
      .filter((session) => (
        session.organization_id === invite.organization_id &&
        session.athlete_id === athlete.id &&
        session.source_type === "coach_lesson" &&
        session.status === "coach_feedback_published" &&
        session.visibility_to_athlete !== false &&
        !session.deleted_at
      ))
      .map((session) => {
        const feedback = state.coach_feedback.find((item) => item.session_id === session.id);
        const task = state.training_tasks.find((item) => item.session_id === session.id);
        if (!feedback || !task) return null;
        const video = state.video_assets.find((item) => item.session_id === session.id && !item.deleted_at);
        return {
          session: {
            id: session.id,
            source_type: session.source_type,
            camera_view: session.camera_view,
            shot_type: session.shot_type,
            status: session.status,
            created_at: session.created_at
          },
          video_asset: video ? {
            id: video.id,
            object_key: video.object_key,
            camera_view: video.camera_view,
            shot_type: video.shot_type
          } : null,
          coach_feedback: {
            id: feedback.id,
            published_at: feedback.published_at,
            final_feedback_json: {
              schema_version: feedback.final_feedback_json.schema_version,
              source_contract: feedback.final_feedback_json.source_contract,
              coach_summary: feedback.final_feedback_json.coach_summary,
              coach_confirmed_problem_tags: feedback.final_feedback_json.coach_confirmed_problem_tags,
              training_plan: feedback.final_feedback_json.training_plan
            }
          },
          training_task: {
            id: task.id,
            status: task.status,
            published_at: task.published_at
          },
          training_plan_steps: state.training_plan_steps
            .filter((step) => step.training_task_id === task.id)
            .sort((left, right) => left.step_order - right.step_order)
            .map((step) => ({
              id: step.id,
              step_type: step.step_type,
              step_order: step.step_order,
              drill_id: step.drill_id,
              dosage: step.dosage,
              cue: step.cue,
              success_target: step.success_target
            })),
          source_of_truth: "coach_feedback"
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(right.session.created_at).localeCompare(String(left.session.created_at)));

    return {
      ok: true,
      schema_version: "arc_lab_student_feedback_results.v1",
      source_contract: "student_sees_only_coach_published_feedback",
      student_final_source_of_truth: "coach_feedback",
      organization: organization ? { id: organization.id, name: organization.name } : null,
      athlete: { id: athlete.id, display_name: athlete.display_name },
      invite: publicInvite(invite),
      results,
      hidden_from_student: ["ai_report_drafts", "training_task_drafts", "coach_edit_diff_json", "rejected_problem_tags"]
    };
  }

  function getStudentKnowledgeDirectoryByInvite(input = {}) {
    const student = requireBoundInvite(input.token);
    if (!student.ok) return student;
    const directory = buildStudentKnowledgeDirectory(input.knowledgeBase, { limit: Number.MAX_SAFE_INTEGER });
    return {
      ok: true,
      schema_version: "arc_lab_student_knowledge_directory_access.v1",
      source_contract: "bound_student_clean_knowledge_directory_no_question_log_or_raw_sources",
      organization: { id: student.organization.id, name: student.organization.name },
      athlete: { id: student.athlete.id, display_name: student.athlete.display_name },
      directory,
      boundaries: {
        phone_binding_required: true,
        directory_access_unlimited: true,
        saves_student_question: false,
        chat_history_written: false,
        raw_sources_visible: false,
        personal_video_diagnosis_allowed: false
      }
    };
  }

  function getCoachReviewExperience(input = {}) {
    const relation = requireCoachAthlete(input.coach_id, input.athlete_id);
    if (!relation.ok) return relation;
    const sessions = state.training_sessions
      .filter((session) => session.organization_id === relation.organization.id && session.athlete_id === relation.athlete.id)
      .filter((session) => !session.deleted_at)
      .reverse();
    const current = selectReviewSession(sessions, input.session_id);
    if (!current) return error("review_session_not_found", "No review session was found for this coach and athlete.", 404);
    return buildReviewExperience({
      audience: "coach",
      session: current,
      sessions,
      playbackUrl: `/api/arc-lab/coach-videos?coach_id=${encodeURIComponent(relation.profile.id)}&session_id=${encodeURIComponent(current.id)}`
    });
  }

  function getStudentReviewExperienceByInvite(input = {}) {
    const student = requireBoundInvite(input.token);
    if (!student.ok) return student;
    const sessions = state.training_sessions
      .filter((session) => (
        session.organization_id === student.organization.id &&
        session.athlete_id === student.athlete.id &&
        session.source_type === "coach_lesson" &&
        session.status === "coach_feedback_published" &&
        session.visibility_to_athlete !== false &&
        !session.deleted_at
      ))
      .reverse();
    const current = selectReviewSession(sessions, input.session_id);
    if (!current) return error("student_review_not_found", "No published lesson video is available yet.", 404);
    return buildReviewExperience({
      audience: "student",
      session: current,
      sessions,
      playbackUrl: `/api/arc-lab/student-videos?token=${encodeURIComponent(student.invite.token)}&session_id=${encodeURIComponent(current.id)}`
    });
  }

  function getCoachReviewVideo(input = {}) {
    const session = state.training_sessions.find((item) => item.id === cleanText(input.session_id));
    if (!session || session.deleted_at) return error("review_session_not_found", "Review session was not found.", 404);
    const relation = requireCoachAthlete(input.coach_id, session.athlete_id);
    if (!relation.ok) return relation;
    if (session.organization_id !== relation.organization.id) return error("coach_session_not_found", "Session is not assigned to this coach organization.", 403);
    return reviewVideoForSession(session);
  }

  function getStudentReviewVideo(input = {}) {
    const student = requireBoundInvite(input.token);
    if (!student.ok) return student;
    const session = state.training_sessions.find((item) => item.id === cleanText(input.session_id));
    if (!session || session.deleted_at || session.organization_id !== student.organization.id || session.athlete_id !== student.athlete.id || session.source_type !== "coach_lesson" || session.status !== "coach_feedback_published" || session.visibility_to_athlete === false) {
      return error("student_review_not_found", "Published lesson video was not found.", 404);
    }
    return reviewVideoForSession(session);
  }

  function getCoachTrends(input = {}) {
    const relation = requireCoachAthlete(input.coach_id, input.athlete_id);
    if (!relation.ok) return relation;
    const trend = buildAthleteTrendSnapshot({
      organizationId: relation.organization.id,
      athleteId: relation.athlete.id,
      currentTrendKey: cleanText(input.current_trend_key) || null
    });
    return {
      ok: trend.ok,
      schema_version: "arc_lab_coach_trends.v1",
      source_contract: "coach_sees_org_scoped_confirmed_trends_with_evidence_context",
      organization: { id: relation.organization.id, name: relation.organization.name },
      athlete: { id: relation.athlete.id, display_name: relation.athlete.display_name },
      trend,
      explanation_drafts: state.trend_explanation_drafts
        .filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id)
        .map((item) => ({
          id: item.id,
          trend_key: item.draft_json.trend_key,
          coach_confirmed: Boolean(item.coach_confirmed_json),
          student_visible: item.student_visible,
          created_at: item.created_at
        })),
      boundaries: {
        organization_scoped: true,
        coach_confirmed_problem_tags_only: true,
        lesson_homework_split: true,
        camera_view_and_shot_type_split: true
      }
    };
  }

  function confirmCoachTrendExplanation(input = {}) {
    const relation = requireCoachAthlete(input.coach_id, input.athlete_id);
    if (!relation.ok) return relation;
    const text = cleanText(input.text);
    if (!text) return error("trend_explanation_required", "Coach trend explanation is required.");
    const trend = buildAthleteTrendSnapshot({
      organizationId: relation.organization.id,
      athleteId: relation.athlete.id,
      currentTrendKey: cleanText(input.trend_key) || null
    });
    const trendKey = trend.student_view.current_track_key;
    if (!trendKey) return error("trend_track_not_found", "A confirmed metric trend is required before publishing an explanation.", 409);
    const timestamp = now().toISOString();
    const record = {
      id: makeId("trend_explanation"),
      organization_id: relation.organization.id,
      athlete_id: relation.athlete.id,
      draft_json: {
        schema_version: "arc_lab_trend_explanation_draft.v1",
        source_contract: "coach_confirmation_required_before_student_visibility",
        trend_key: trendKey
      },
      coach_confirmed_json: {
        trend_key: trendKey,
        text,
        confirmed_at: timestamp,
        coach_id: relation.profile.id
      },
      student_visible: true,
      created_at: timestamp
    };
    state.trend_explanation_drafts.push(record);
    audit({
      organization_id: relation.organization.id,
      actor_profile_id: relation.profile.id,
      action: "coach_trend_explanation_confirmed",
      target_type: "trend_explanation_draft",
      target_id: record.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: "arc_lab_coach_trend_explanation_confirm.v1",
      source_contract: "student_trend_explanation_is_coach_confirmed",
      trend_explanation: {
        id: record.id,
        trend_key: trendKey,
        text,
        student_visible: true
      },
      trend: buildAthleteTrendSnapshot({
        organizationId: relation.organization.id,
        athleteId: relation.athlete.id,
        currentTrendKey: trendKey
      })
    };
  }

  function getStudentTrendsByInvite(token) {
    const student = requireBoundInvite(token);
    if (!student.ok) return student;
    const trend = buildAthleteTrendSnapshot({
      organizationId: student.organization.id,
      athleteId: student.athlete.id
    });
    return {
      ok: trend.ok,
      schema_version: "arc_lab_student_trends.v1",
      source_contract: "student_sees_simplified_coach_confirmed_trend_only",
      athlete: { id: student.athlete.id, display_name: student.athlete.display_name },
      trend: trend.student_view,
      hidden_from_student: ["all_trend_tracks", "full_evidence_confidence_detail", "ai_trend_explanation_draft", "coach_edit_diff_json"]
    };
  }

  function answerStudentKnowledgeQuestion(input = {}) {
    const student = requireBoundInvite(input.token);
    if (!student.ok) return student;
    const question = cleanText(input.question);
    if (!question) return error("knowledge_question_required", "Knowledge assistant question is required.");
    const usage = getKnowledgeUsageRecord({
      organizationId: student.organization.id,
      athleteId: student.athlete.id
    });
    const response = buildStudentKnowledgeAssistantResponse({
      question,
      knowledgeBase: input.knowledgeBase || {},
      ai_answer_count_today: usage.ai_answer_count
    });
    if (response.ok) {
      usage.ai_answer_count += 1;
      usage.updated_at = now().toISOString();
      response.usage.ai_answer_count_today = usage.ai_answer_count - 1;
      response.usage.ai_answer_count_after_response = usage.ai_answer_count;
      audit({
        organization_id: student.organization.id,
        actor_profile_id: student.profile.id,
        action: "student_knowledge_assistant_answered",
        target_type: "knowledge_assistant_usage",
        target_id: usage.id,
        created_at: usage.updated_at
      });
    }
    return {
      ok: response.ok,
      schema_version: "arc_lab_student_knowledge_assistant_usage.v1",
      source_contract: "student_training_knowledge_answer_with_daily_counter_no_question_storage",
      status: response.answer_type === "boundary_refusal" || response.answer_type === "rate_limited" ? 200 : undefined,
      athlete: { id: student.athlete.id, display_name: student.athlete.display_name },
      answer: response,
      usage: publicKnowledgeUsage(usage),
      hidden_from_student: ["raw_source_cards", "source_card_ids", "student_question_log", "chat_history", "personal_video_diagnosis"]
    };
  }

  function deleteCoachVideoAsset(input = {}) {
    const asset = state.video_assets.find((item) => item.id === cleanText(input.video_asset_id));
    if (!asset) return error("video_asset_not_found", "Video asset was not found.", 404);
    const relation = requireCoachAthlete(input.coach_id, asset.athlete_id);
    if (!relation.ok) return relation;
    if (asset.organization_id !== relation.organization.id) return error("coach_video_asset_not_found", "Video asset is not assigned to this coach organization.", 403);
    if (asset.deleted_at) return error("video_asset_already_deleted", "Video asset is already deleted.", 409);
    const timestamp = now().toISOString();
    asset.deleted_at = timestamp;
    asset.deleted_by = relation.profile.id;
    audit({
      organization_id: relation.organization.id,
      actor_profile_id: relation.profile.id,
      action: "video_deleted",
      target_type: "video_asset",
      target_id: asset.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: "arc_lab_audited_delete.v1",
      source_contract: "local_arc_lab_video_soft_delete_separate_audit_action",
      action: "video_deleted",
      video_asset: publicDeletedRecord(asset),
      deleted_physical_upload: false,
      session_deleted: false,
      next_step: "review_video_playback_unavailable"
    };
  }

  function deleteCoachSession(input = {}) {
    const session = state.training_sessions.find((item) => item.id === cleanText(input.session_id));
    if (!session) return error("session_not_found", "Training session was not found.", 404);
    const relation = requireCoachAthlete(input.coach_id, session.athlete_id);
    if (!relation.ok) return relation;
    if (session.organization_id !== relation.organization.id) return error("coach_session_not_found", "Session is not assigned to this coach organization.", 403);
    if (session.deleted_at) return error("session_already_deleted", "Session is already deleted.", 409);
    const timestamp = now().toISOString();
    session.deleted_at = timestamp;
    session.deleted_by = relation.profile.id;
    session.status = "deleted";
    audit({
      organization_id: relation.organization.id,
      actor_profile_id: relation.profile.id,
      action: "session_deleted",
      target_type: "training_session",
      target_id: session.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: "arc_lab_audited_delete.v1",
      source_contract: "local_arc_lab_session_soft_delete_separate_audit_action",
      action: "session_deleted",
      session: publicDeletedRecord(session),
      video_asset_deleted: false,
      athlete_data_deleted: false,
      next_step: "session_hidden_from_review_and_trends"
    };
  }

  function deleteCoachAthleteData(input = {}) {
    const relation = requireCoachAthlete(input.coach_id, input.athlete_id);
    if (!relation.ok) return relation;
    if (relation.athlete.deleted_at) return error("athlete_data_already_deleted", "Athlete data is already deleted.", 409);
    const timestamp = now().toISOString();
    relation.athlete.deleted_at = timestamp;
    relation.athlete.deleted_by = relation.profile.id;
    const affected = {
      training_sessions: markDeleted(state.training_sessions.filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id), relation.profile.id, timestamp, { status: "deleted" }),
      video_assets: markDeleted(state.video_assets.filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id), relation.profile.id, timestamp),
      coach_feedback: markDeleted(state.coach_feedback.filter((item) => item.organization_id === relation.organization.id && state.training_sessions.some((session) => session.id === item.session_id && session.athlete_id === relation.athlete.id)), relation.profile.id, timestamp),
      training_tasks: markDeleted(state.training_tasks.filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id), relation.profile.id, timestamp),
      metric_snapshots: markDeleted(state.athlete_metric_snapshots.filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id), relation.profile.id, timestamp),
      trend_explanations: markDeleted(state.trend_explanation_drafts.filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id), relation.profile.id, timestamp),
      knowledge_usage: markDeleted(state.knowledge_assistant_usage.filter((item) => item.organization_id === relation.organization.id && item.athlete_id === relation.athlete.id), relation.profile.id, timestamp)
    };
    audit({
      organization_id: relation.organization.id,
      actor_profile_id: relation.profile.id,
      action: "athlete_data_deleted",
      target_type: "athlete",
      target_id: relation.athlete.id,
      created_at: timestamp
    });
    return {
      ok: true,
      schema_version: "arc_lab_audited_delete.v1",
      source_contract: "local_arc_lab_athlete_data_soft_delete_separate_audit_action",
      action: "athlete_data_deleted",
      athlete: publicDeletedRecord(relation.athlete),
      affected,
      deleted_physical_uploads: false,
      boundaries: {
        organization_scoped: true,
        separate_from_single_video_delete: true,
        separate_from_single_session_delete: true,
        audit_event_action: "athlete_data_deleted"
      }
    };
  }

  function buildReviewExperience({ audience, session, sessions, playbackUrl }) {
    const video = state.video_assets.find((item) => item.session_id === session.id && !item.deleted_at) || null;
    const primaryTag = confirmedPrimaryTag(session.id);
    const metric = state.athlete_metric_snapshots.find((item) => item.session_id === session.id) || null;
    const playbackAvailable = Boolean(video?.local_upload_id);
    return {
      ok: true,
      schema_version: "arc_lab_review_experience.v1",
      source_contract: audience === "coach"
        ? "coach_org_scoped_video_review_with_evidence_not_final_diagnosis"
        : "student_published_lesson_review_without_ai_draft_or_edit_diff",
      audience,
      current_session: publicReviewSession(session, { audience, primaryTag, metric }),
      player: {
        square_video_area: true,
        full_playback_default: true,
        playback_available: playbackAvailable,
        playback_url: playbackAvailable ? playbackUrl : null,
        unavailable_reason: playbackAvailable ? null : "local_video_file_not_attached_to_session"
      },
      annotations: reviewAnnotations({ cameraView: session.camera_view, primaryTagId: primaryTag?.problem_tag_id || null }),
      stages: defaultReviewStages(),
      comparison: {
        layout: "current_session_plus_two_previous_sessions",
        sessions: sessions.slice(0, 3).map((item) => publicReviewSession(item, {
          audience,
          primaryTag: confirmedPrimaryTag(item.id),
          metric: state.athlete_metric_snapshots.find((snapshot) => snapshot.session_id === item.id) || null
        }))
      },
      boundaries: {
        coach_confirmation_required_for_final_conclusion: true,
        ai_draft_included: false,
        coach_edit_diff_included: false,
        student_only_receives_published_lessons: audience === "student"
      }
    };
  }

  function reviewVideoForSession(session) {
    const video = state.video_assets.find((item) => item.session_id === session.id && !item.deleted_at) || null;
    if (!video?.local_upload_id) return error("review_video_unavailable", "This session has no locally attached video file.", 404);
    return { ok: true, upload_id: video.local_upload_id, file_name: video.object_key };
  }

  function confirmedPrimaryTag(sessionId) {
    return state.session_problem_tags.find((tag) => (
      tag.session_id === sessionId &&
      tag.role === "primary" &&
      tag.source === "coach_confirmed" &&
      tag.status === "confirmed"
    )) || null;
  }

  function selectReviewSession(sessions, requestedSessionId) {
    const requested = cleanText(requestedSessionId);
    return requested ? sessions.find((session) => session.id === requested) || null : sessions[0] || null;
  }

  function publicReviewSession(session, { audience, primaryTag, metric }) {
    return {
      id: session.id,
      source_type: session.source_type,
      camera_view: session.camera_view,
      shot_type: session.shot_type,
      status: session.status,
      created_at: session.created_at,
      primary_problem_tag_id: audience === "coach" || session.status === "coach_feedback_published" ? primaryTag?.problem_tag_id || null : null,
      core_metric: metric ? {
        label: metric.metric_label,
        value: metric.metric_value,
        unit: metric.metric_unit,
        improvement_direction: metric.improvement_direction
      } : null
    };
  }

  function reviewAnnotations({ cameraView, primaryTagId }) {
    const byTag = primaryTagId === "hand_leads_before_lower_body"
      ? [{ id: "timing", label: "下肢启动与起球时序", scope: "仅作教练复核证据" }]
      : primaryTagId === "low_release_point"
        ? [{ id: "release", label: "出手高度与释放点", scope: "仅作教练复核证据" }]
        : [{ id: "view", label: `${cameraView} 视角动作观察`, scope: "等待教练确认" }];
    return { overlay_scope: "current_primary_problem_relevant_lines_and_angles", items: byTag };
  }

  function snapshot() {
    return structuredClone(state);
  }

  function publicDeletedRecord(record) {
    return {
      id: record.id,
      deleted_at: record.deleted_at,
      deleted_by: record.deleted_by
    };
  }

  function markDeleted(records, deletedBy, deletedAt, extra = {}) {
    let count = 0;
    for (const record of records) {
      if (record.deleted_at) continue;
      record.deleted_at = deletedAt;
      record.deleted_by = deletedBy;
      Object.assign(record, extra);
      count += 1;
    }
    return count;
  }

  function getKnowledgeUsageRecord({ organizationId, athleteId }) {
    const usageDate = now().toISOString().slice(0, 10);
    let record = state.knowledge_assistant_usage.find((item) => (
      item.organization_id === organizationId
      && item.athlete_id === athleteId
      && item.usage_date === usageDate
    ));
    if (!record) {
      const timestamp = now().toISOString();
      record = {
        id: makeId("knowledge_usage"),
        organization_id: organizationId,
        athlete_id: athleteId,
        usage_date: usageDate,
        ai_answer_count: 0,
        created_at: timestamp,
        updated_at: timestamp
      };
      state.knowledge_assistant_usage.push(record);
    }
    return record;
  }

  function publicKnowledgeUsage(usage) {
    return {
      id: usage.id,
      organization_id: usage.organization_id,
      athlete_id: usage.athlete_id,
      usage_date: usage.usage_date,
      ai_answer_count: usage.ai_answer_count,
      daily_limit: ARC_LAB_MVP_CONTRACT.knowledge_assistant.default_daily_ai_answer_limit,
      saves_student_question: false,
      chat_history_written: false,
      question_log_visible_to_coach: false
    };
  }

  function buildAthleteTrendSnapshot({ organizationId, athleteId, currentTrendKey = null }) {
    const sessions = state.athlete_metric_snapshots
      .filter((item) => item.organization_id === organizationId && item.athlete_id === athleteId)
      .filter((item) => !item.deleted_at)
      .map((item) => ({
        session_id: item.session_id,
        occurred_at: item.created_at,
        source_type: item.source_type,
        camera_view: item.camera_view,
        shot_type: item.shot_type,
        coach_confirmed_primary_problem_id: item.problem_tag_id,
        metrics: [{
          metric_id: item.metric_id,
          label: item.metric_label,
          value: item.metric_value,
          unit: item.metric_unit,
          improvement_direction: item.improvement_direction
        }],
        evidence_confidence: item.evidence_confidence
      }));
    const selectedTrendKey = currentTrendKey || null;
    const explanation = getCoachConfirmedTrendExplanation({
      organizationId,
      athleteId,
      trendKey: selectedTrendKey
    });
    let trend = buildArcLabTrendSnapshot({
      sessions,
      current_trend_key: selectedTrendKey,
      coach_confirmed_explanation: explanation
    });
    if (!selectedTrendKey && trend.student_view.current_track_key) {
      trend = buildArcLabTrendSnapshot({
        sessions,
        current_trend_key: trend.student_view.current_track_key,
        coach_confirmed_explanation: getCoachConfirmedTrendExplanation({
          organizationId,
          athleteId,
          trendKey: trend.student_view.current_track_key
        })
      });
    }
    return trend;
  }

  function getCoachConfirmedTrendExplanation({ organizationId, athleteId, trendKey }) {
    const record = state.trend_explanation_drafts
      .filter((item) => (
        item.organization_id === organizationId
        && item.athlete_id === athleteId
        && item.student_visible === true
        && item.coach_confirmed_json?.trend_key === trendKey
      ))
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0];
    return record ? { status: "coach_confirmed", text: record.coach_confirmed_json.text } : null;
  }

  function recordMetricSnapshot({ session, primaryProblemTagId, createdAt }) {
    if (!Number.isFinite(session.trend_metric_value)) return null;
    const metric = trendMetricForProblemTag(primaryProblemTagId);
    const existing = state.athlete_metric_snapshots.find((item) => item.session_id === session.id && item.problem_tag_id === primaryProblemTagId && item.metric_id === metric.metric_id);
    if (existing) return existing;
    const snapshot = {
      id: makeId("metric_snapshot"),
      organization_id: session.organization_id,
      athlete_id: session.athlete_id,
      session_id: session.id,
      source_type: session.source_type,
      camera_view: session.camera_view,
      shot_type: session.shot_type,
      problem_tag_id: primaryProblemTagId,
      metric_id: metric.metric_id,
      metric_label: metric.label,
      metric_unit: metric.unit,
      improvement_direction: metric.improvement_direction,
      metric_value: session.trend_metric_value,
      evidence_confidence: session.source_type === "coach_lesson" ? "coach_recorded" : "athlete_submitted",
      created_at: createdAt
    };
    state.athlete_metric_snapshots.push(snapshot);
    return snapshot;
  }

  function buildInvite({ organization_id, athlete_id, coach_id, created_at }) {
    const createdDate = new Date(created_at);
    const expiresAt = new Date(createdDate.getTime() + ARC_LAB_INVITE_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return {
      id: makeId("invite"),
      organization_id,
      athlete_id,
      coach_id,
      token: randomUUID().replace(/-/g, "").slice(0, 20),
      expires_at: expiresAt,
      phone_bound_at: null,
      bound_profile_id: null,
      created_at
    };
  }

  function latestInviteForAthlete(athleteId) {
    return state.athlete_invites
      .filter((invite) => invite.athlete_id === athleteId)
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0] || null;
  }

  function requireCoach(coachId) {
    const profile = state.profiles.find((item) => item.id === cleanText(coachId) && item.role === "coach");
    if (!profile) return error("coach_not_found", "Coach was not found.", 404);
    const member = state.organization_members.find((item) => item.profile_id === profile.id && (item.role === "owner" || item.role === "coach"));
    const organization = state.organizations.find((item) => item.id === member?.organization_id);
    if (!member || !organization) return error("coach_organization_not_found", "Coach organization was not found.", 404);
    return { ok: true, profile, organization };
  }

  function requireBoundInvite(token) {
    const invite = state.athlete_invites.find((item) => item.token === cleanToken(token));
    if (!invite) return error("invite_not_found", "Invite token was not found.", 404);
    if (inviteStatus(invite) !== "phone_bound") return error("student_phone_not_bound", "Student phone must be bound before viewing results.", 403);
    const athlete = state.athletes.find((item) => item.id === invite.athlete_id);
    const organization = state.organizations.find((item) => item.id === invite.organization_id);
    const profile = state.profiles.find((item) => item.id === invite.bound_profile_id && item.role === "student");
    if (!athlete || athlete.deleted_at) return error("athlete_not_found", "Invite athlete was not found.", 404);
    if (!organization) return error("organization_not_found", "Invite organization was not found.", 404);
    if (!profile) return error("student_profile_not_found", "Student profile was not found.", 404);
    return { ok: true, invite, athlete, organization, profile };
  }

  function getTaskRetestContext(task) {
    const lesson = state.training_sessions.find((item) => item.id === task.session_id && item.source_type === "coach_lesson");
    const feedback = lesson ? state.coach_feedback.find((item) => item.session_id === lesson.id) : null;
    const plan = feedback?.final_feedback_json?.training_plan;
    const retestStep = plan?.steps?.find((step) => step.step_type === "retest");
    if (!lesson || !plan?.primary_problem_tag_id || !retestStep?.requested_camera_view) {
      return error("training_task_retest_context_not_found", "Published training task is missing retest context.", 409);
    }
    return {
      ok: true,
      primary_problem_tag_id: plan.primary_problem_tag_id,
      requested_camera_view: retestStep.requested_camera_view,
      requested_shot_type: retestStep.shot_type || lesson.shot_type
    };
  }

  function requireCoachAthlete(coachId, athleteId) {
    const coach = requireCoach(coachId);
    if (!coach.ok) return coach;
    const athlete = state.athletes.find((item) => item.id === cleanText(athleteId));
    if (!athlete || athlete.deleted_at) return error("athlete_not_found", "Athlete was not found.", 404);
    const relation = state.coach_athlete_relations.find((item) => (
      item.coach_id === coach.profile.id &&
      item.athlete_id === athlete.id &&
      item.organization_id === coach.organization.id &&
      athlete.organization_id === coach.organization.id
    ));
    if (!relation) return error("coach_athlete_relation_not_found", "Athlete is not assigned to this coach organization.", 403);
    return {
      ok: true,
      profile: coach.profile,
      organization: coach.organization,
      athlete,
      relation
    };
  }

  function requireCoachLessonSession(coachId, sessionId) {
    const coach = requireCoach(coachId);
    if (!coach.ok) return coach;
    const session = state.training_sessions.find((item) => item.id === cleanText(sessionId));
    if (!session || session.deleted_at) return error("session_not_found", "Training session was not found.", 404);
    if (session.source_type !== "coach_lesson") return error("session_not_coach_lesson", "Only coach_lesson can be published through this review flow.", 400);
    if (session.coach_id !== coach.profile.id || session.organization_id !== coach.organization.id) {
      return error("coach_session_not_found", "Session is not assigned to this coach organization.", 403);
    }
    const aiReportDraft = state.ai_report_drafts.find((item) => item.session_id === session.id);
    if (!aiReportDraft) return error("ai_draft_not_found", "AI draft was not found for this lesson.", 404);
    return {
      ok: true,
      profile: coach.profile,
      organization: coach.organization,
      session,
      aiReportDraft
    };
  }

  function publicInvite(invite) {
    return {
      id: invite.id,
      organization_id: invite.organization_id,
      athlete_id: invite.athlete_id,
      coach_id: invite.coach_id,
      token: invite.token,
      expires_at: invite.expires_at,
      phone_bound_at: invite.phone_bound_at,
      status: inviteStatus(invite)
    };
  }

  function inviteStatus(invite) {
    if (invite.phone_bound_at) return "phone_bound";
    if (new Date(invite.expires_at).getTime() < now().getTime()) return "expired";
    return "active";
  }

  function inviteLink(token) {
    return `${basePath}?invite=${encodeURIComponent(token)}`;
  }

  function audit(event) {
    state.audit_events.push({
      id: makeId("audit"),
      ...event
    });
  }

  return {
    loginCoach,
    addAthlete,
    getCoachHome,
    setCoachAthletePriority,
    getInvite,
    bindInvitePhone,
    uploadCoachLesson,
    listCoachLessons,
    uploadStudentHomework,
    listCoachHomework,
    reviewCoachHomework,
    publishCoachReview,
    getStudentResultsByInvite,
    getStudentKnowledgeDirectoryByInvite,
    getCoachReviewExperience,
    getStudentReviewExperienceByInvite,
    getCoachReviewVideo,
    getStudentReviewVideo,
    getCoachTrends,
    confirmCoachTrendExplanation,
    getStudentTrendsByInvite,
    answerStudentKnowledgeQuestion,
    deleteCoachVideoAsset,
    deleteCoachSession,
    deleteCoachAthleteData,
    snapshot
  };
}

export function getArcLabLessonUploadOptions() {
  return {
    schema_version: "arc_lab_lesson_upload_options.v1",
    source_contract: "standard_problem_tag_camera_view_shot_type_options",
    problem_tags: PROBLEM_TAGS.map(({ id, label_zh, category, primary_view }) => ({ id, label_zh, category, primary_view })),
    camera_views: CAMERA_VIEWS.map(({ id, label, role, trend_track }) => ({ id, label, role, trend_track })),
    shot_types: SHOT_TYPES.map(({ id, label }) => ({ id, label }))
  };
}

export function validateArcLabIdentityInviteFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const invite = store.getInvite(added.invite.token);
  const bound = store.bindInvitePhone({ token: added.invite.token, phone: "13900000000" });
  const home = store.getCoachHome(login.profile.id);
  const snapshot = store.snapshot();
  const errors = [];

  requireEqual(errors, login.ok, true, "coach login must pass");
  requireEqual(errors, login.organization.created_by, login.profile.id, "coach first login must create default organization");
  requireEqual(errors, added.ok, true, "coach must add athlete");
  requireEqual(errors, added.athlete.organization_id, login.organization.id, "athlete must stay inside coach organization");
  requireEqual(errors, added.coach_athlete_relation.organization_id, login.organization.id, "relation must preserve organization boundary");
  requireEqual(errors, invite.status, "active", "invite must be active before binding");
  requireEqual(errors, bound.ok, true, "student must bind phone through invite");
  requireEqual(errors, bound.invite.status, "phone_bound", "invite status must reflect phone binding");
  requireEqual(errors, bound.student_home.hidden_from_student.includes("ai_report_drafts"), true, "student home must hide AI drafts");
  requireEqual(errors, home.athletes.length, 1, "coach home must show added athlete");
  requireEqual(errors, snapshot.audit_events.length >= 3, true, "identity actions must be audited");
  for (const tableName of [
    "profiles",
    "organizations",
    "organization_members",
    "athletes",
    "coach_athlete_relations",
    "athlete_invites",
    "audit_events"
  ]) {
    if (!Array.isArray(snapshot[tableName])) errors.push(`missing local store table ${tableName}`);
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_identity_invite_validation.v1",
    errors,
    checked_tables: [
      "profiles",
      "organizations",
      "organization_members",
      "athletes",
      "coach_athlete_relations",
      "athlete_invites",
      "audit_events"
    ],
    boundaries: identityBoundaries()
  };
}

export function validateArcLabCoachLessonUploadFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const upload = store.uploadCoachLesson({
    coach_id: login.profile.id,
    athlete_id: added.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "lesson-side-spot-up.mp4"
  });
  const lessons = store.listCoachLessons(login.profile.id);
  const snapshot = store.snapshot();
  const errors = [];

  requireEqual(errors, upload.ok, true, "coach lesson upload must pass");
  requireEqual(errors, upload.session.source_type, "coach_lesson", "session source_type must be coach_lesson");
  requireEqual(errors, upload.session.uploaded_by_role, "coach", "lesson uploaded_by_role must be coach");
  requireEqual(errors, upload.session.organization_id, login.organization.id, "session must stay inside organization");
  requireEqual(errors, upload.video_asset.camera_view, "side", "video asset must preserve camera view");
  requireEqual(errors, upload.video_asset.shot_type, "spot_up", "video asset must preserve shot type");
  requireEqual(errors, upload.evidence_packet.packet_json.source_type, "coach_lesson", "evidence packet must preserve source type");
  requireEqual(errors, upload.evidence_packet.packet_json.trend_key_preview, "coach_lesson:side:spot_up:hand_leads_before_lower_body", "trend key must separate lesson/view/shot/problem");
  requireEqual(errors, upload.ai_report_draft.student_visible, false, "AI report draft must be hidden from students");
  requireEqual(errors, upload.session_problem_tag.source, "evidence_suggested", "initial tag must be a suggestion only");
  requireEqual(errors, upload.session_problem_tag.status, "suggested", "initial tag must wait for coach confirmation");
  requireEqual(errors, lessons.lessons.length, 1, "coach lesson list must include uploaded lesson");
  for (const tableName of [
    "training_sessions",
    "video_assets",
    "evidence_packets",
    "ai_report_drafts",
    "session_problem_tags"
  ]) {
    if (!Array.isArray(snapshot[tableName]) || snapshot[tableName].length !== 1) {
      errors.push(`local store table ${tableName} should contain one coach lesson record`);
    }
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_coach_lesson_upload_validation.v1",
    errors,
    checked_tables: [
      "training_sessions",
      "video_assets",
      "evidence_packets",
      "ai_report_drafts",
      "session_problem_tags"
    ],
    boundaries: {
      coach_lesson_homework_separated: true,
      trend_key_fields: ["source_type", "camera_view", "shot_type", "problem_tag_id"],
      initial_problem_tag_is_not_final: true,
      ai_report_draft_student_visible: false
    }
  };
}

export function validateArcLabCoachReviewPublishFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const upload = store.uploadCoachLesson({
    coach_id: login.profile.id,
    athlete_id: added.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "lesson-side-spot-up.mp4"
  });
  const published = store.publishCoachReview({
    coach_id: login.profile.id,
    session_id: upload.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point"],
    coach_note: "教练结合侧面视角证据和课堂上下文后确认。",
    coach_feedback_text: "主问题是起球早于下肢启动，本周先重建脚带手顺序。",
    success_target: "按同一侧面视角上传 10 次定点投篮。"
  });
  const snapshot = store.snapshot();
  const errors = [];

  requireEqual(errors, published.ok, true, "coach review publish must pass");
  requireEqual(errors, published.coach_feedback.final_feedback_json.source_contract, "coach_confirmed_feedback_student_source_of_truth", "coach feedback must be source of truth");
  requireEqual(errors, published.published_feedback.student_visible, true, "coach published feedback must be student visible");
  requireEqual(errors, published.ai_report_draft_student_visible, false, "AI report draft must remain hidden");
  requireEqual(errors, published.training_plan_steps.length, 3, "published plan must have 3 steps");
  requireEqual(errors, published.confirmed_problem_tags.filter((item) => item.role === "primary").length, 1, "exactly one primary tag must be confirmed");
  requireEqual(errors, published.confirmed_problem_tags.filter((item) => item.role === "secondary").length, 2, "at most two secondary tags should be confirmed in fixture");
  requireEqual(errors, published.training_task.status, "assigned", "student training task must be assigned after publish");
  requireEqual(errors, snapshot.training_sessions[0].status, "coach_feedback_published", "session status must be published");
  requireEqual(errors, snapshot.ai_report_drafts[0].student_visible, false, "stored AI draft must remain hidden");
  for (const tableName of [
    "coach_feedback",
    "training_task_drafts",
    "training_tasks"
  ]) {
    if (!Array.isArray(snapshot[tableName]) || snapshot[tableName].length !== 1) {
      errors.push(`local store table ${tableName} should contain one published record`);
    }
  }
  if (!Array.isArray(snapshot.training_plan_steps) || snapshot.training_plan_steps.length !== 3) {
    errors.push("local store table training_plan_steps should contain three plan steps");
  }
  if (snapshot.session_problem_tags.filter((item) => item.source === "coach_confirmed" && item.status === "confirmed").length !== 3) {
    errors.push("session_problem_tags should contain coach-confirmed primary and secondary tags");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_coach_review_publish_validation.v1",
    errors,
    checked_tables: [
      "ai_report_drafts",
      "coach_feedback",
      "training_task_drafts",
      "training_tasks",
      "training_plan_steps",
      "session_problem_tags"
    ],
    boundaries: {
      coach_final_confirmation_required: true,
      student_final_source_of_truth: "coach_feedback",
      ai_report_draft_student_visible: false,
      default_training_plan_step_count: 3
    }
  };
}

export function validateArcLabStudentFeedbackFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const upload = store.uploadCoachLesson({
    coach_id: login.profile.id,
    athlete_id: added.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "lesson-side-spot-up.mp4"
  });
  store.publishCoachReview({
    coach_id: login.profile.id,
    session_id: upload.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point"],
    coach_note: "教练结合侧面视角证据和课堂上下文后确认。",
    coach_feedback_text: "主问题是起球早于下肢启动，本周先重建脚带手顺序。",
    success_target: "按同一侧面视角上传 10 次定点投篮。"
  });
  store.bindInvitePhone({ token: added.invite.token, phone: "13900000000" });
  const studentResults = store.getStudentResultsByInvite(added.invite.token);
  const payload = JSON.stringify(studentResults);
  const firstResult = studentResults.results?.[0] || {};
  const errors = [];

  requireEqual(errors, studentResults.ok, true, "student feedback lookup must pass after phone binding");
  requireEqual(errors, studentResults.student_final_source_of_truth, "coach_feedback", "student result source must be coach feedback");
  requireEqual(errors, studentResults.results?.length, 1, "student should see one published coach lesson result");
  requireEqual(errors, firstResult.session?.source_type, "coach_lesson", "student result must be a coach lesson");
  requireEqual(errors, firstResult.session?.status, "coach_feedback_published", "student result must be published");
  requireEqual(errors, firstResult.training_plan_steps?.length, 3, "student should see three training plan steps");
  requireEqual(errors, firstResult.coach_feedback?.final_feedback_json?.source_contract, "coach_confirmed_feedback_student_source_of_truth", "student feedback must carry coach source contract");
  for (const forbiddenKey of ['"ai_draft_json"', '"diff_json"']) {
    if (payload.includes(forbiddenKey)) errors.push(`student feedback payload must not expose ${forbiddenKey}`);
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_student_feedback_validation.v1",
    errors,
    checked_tables: [
      "athlete_invites",
      "training_sessions",
      "video_assets",
      "coach_feedback",
      "training_tasks",
      "training_plan_steps"
    ],
    boundaries: {
      student_phone_binding_required: true,
      student_final_source_of_truth: "coach_feedback",
      ai_report_draft_student_visible: false,
      coach_edit_diff_student_visible: false
    }
  };
}

export function validateArcLabHomeworkReviewFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const lesson = store.uploadCoachLesson({
    coach_id: login.profile.id,
    athlete_id: added.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "lesson-side-spot-up.mp4"
  });
  const published = store.publishCoachReview({
    coach_id: login.profile.id,
    session_id: lesson.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect"],
    coach_note: "教练确认后发布。",
    coach_feedback_text: "本周先重建脚带手顺序。"
  });
  const unboundUpload = store.uploadStudentHomework({
    token: added.invite.token,
    training_task_id: published.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "homework-before-bind.mp4"
  });
  store.bindInvitePhone({ token: added.invite.token, phone: "13900000000" });
  const wrongView = store.uploadStudentHomework({
    token: added.invite.token,
    training_task_id: published.training_task.id,
    camera_view: "front",
    shot_type: "spot_up",
    file_name: "homework-front.mp4"
  });
  const correctView = store.uploadStudentHomework({
    token: added.invite.token,
    training_task_id: published.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "homework-side.mp4"
  });
  const reviewed = store.reviewCoachHomework({
    coach_id: login.profile.id,
    session_id: correctView.session.id,
    step_effectiveness: [
      { step_type: "correction", effectiveness_status: "effective", coach_note: "节奏更连贯。" },
      { step_type: "transfer", effectiveness_status: "watching", coach_note: "继续观察实战迁移。" }
    ]
  });
  const homework = store.listCoachHomework(login.profile.id);
  const snapshot = store.snapshot();
  const errors = [];

  requireEqual(errors, unboundUpload.ok, false, "unbound student must not upload homework");
  requireEqual(errors, unboundUpload.status, 403, "unbound homework upload must be rejected");
  requireEqual(errors, wrongView.ok, true, "wrong-view homework upload must be saved");
  requireEqual(errors, wrongView.view_policy.counts_as_requested_homework_completion, false, "wrong-view homework must not complete requested task");
  requireEqual(errors, wrongView.session.status, "supplemental_wrong_view_record", "wrong-view homework must be supplemental");
  requireEqual(errors, wrongView.training_task.status, "completed_by_self_report", "wrong-view task must remain self-reported only");
  requireEqual(errors, correctView.ok, true, "correct-view homework upload must pass");
  requireEqual(errors, correctView.view_policy.counts_as_requested_homework_completion, true, "correct-view homework must complete requested retest upload");
  requireEqual(errors, correctView.training_task.status, "retest_uploaded", "correct-view task must become retest uploaded");
  requireEqual(errors, correctView.evidence_packet.packet_json.trend_key_preview, "athlete_homework:side:spot_up:hand_leads_before_lower_body", "homework trend key must keep source/view/shot/problem separated");
  requireEqual(errors, correctView.student_visible_ai_draft, false, "homework AI draft must remain hidden");
  requireEqual(errors, reviewed.ok, true, "coach homework review must pass");
  requireEqual(errors, reviewed.training_task.status, "watching", "coach drill statuses must determine task status");
  requireEqual(errors, reviewed.training_plan_step_results.length, 3, "coach review must persist every plan step result");
  requireEqual(errors, homework.homework.length, 2, "coach homework queue must include both uploads");
  if (snapshot.training_sessions.filter((item) => item.source_type === "athlete_homework").length !== 2) {
    errors.push("training_sessions must store both homework uploads");
  }
  if (snapshot.training_plan_step_results.length !== 3) {
    errors.push("training_plan_step_results must store one result per training plan step");
  }
  if (!snapshot.audit_events.some((event) => event.action === "student_homework_uploaded")) {
    errors.push("student homework upload must be audited");
  }
  if (!snapshot.audit_events.some((event) => event.action === "coach_homework_effectiveness_reviewed")) {
    errors.push("coach homework review must be audited");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_homework_review_validation.v1",
    errors,
    checked_tables: [
      "training_sessions",
      "video_assets",
      "evidence_packets",
      "ai_report_drafts",
      "training_tasks",
      "training_plan_steps",
      "training_plan_step_results",
      "session_problem_tags",
      "audit_events"
    ],
    boundaries: {
      coach_lesson_homework_separated: true,
      student_phone_binding_required: true,
      wrong_view_saved_supplemental_not_completion: true,
      homework_trend_uses_coach_confirmed_task_context: true,
      ai_report_draft_student_visible: false,
      coach_final_effectiveness_review_required: true
    }
  };
}

export function validateArcLabCoachHomeFlow() {
  let clock = Date.parse("2026-06-26T08:00:00.000Z");
  const store = createArcLabIdentityStore({ now: () => new Date(clock += 3_600_000) });
  const coach = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const priorityAthlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "优先学生" });
  const retestAthlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "复测学生" });
  const priority = store.setCoachAthletePriority({ coach_id: coach.profile.id, athlete_id: priorityAthlete.athlete.id, active: true });
  const firstLesson = store.uploadCoachLesson({
    coach_id: coach.profile.id,
    athlete_id: priorityAthlete.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "priority-baseline.mp4"
  });
  const firstPublished = store.publishCoachReview({
    coach_id: coach.profile.id,
    session_id: firstLesson.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    coach_feedback_text: "教练确认后发布训练计划。"
  });
  store.bindInvitePhone({ token: priorityAthlete.invite.token, phone: "13900000000" });
  const ineffectiveHomework = store.uploadStudentHomework({
    token: priorityAthlete.invite.token,
    training_task_id: firstPublished.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "priority-retest.mp4"
  });
  store.reviewCoachHomework({
    coach_id: coach.profile.id,
    session_id: ineffectiveHomework.session.id,
    coach_note: "需要调整训练计划。",
    step_effectiveness: [{ step_type: "correction", effectiveness_status: "ineffective" }]
  });
  const repeatedLesson = store.uploadCoachLesson({
    coach_id: coach.profile.id,
    athlete_id: priorityAthlete.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "priority-repeat.mp4"
  });
  const retestLesson = store.uploadCoachLesson({
    coach_id: coach.profile.id,
    athlete_id: retestAthlete.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "retest-baseline.mp4"
  });
  const retestPublished = store.publishCoachReview({
    coach_id: coach.profile.id,
    session_id: retestLesson.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    coach_feedback_text: "教练确认后发布训练计划。"
  });
  store.bindInvitePhone({ token: retestAthlete.invite.token, phone: "13900000001" });
  const retestHomework = store.uploadStudentHomework({
    token: retestAthlete.invite.token,
    training_task_id: retestPublished.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    file_name: "retest-pending.mp4"
  });
  const home = store.getCoachHome(coach.profile.id);
  const otherCoach = store.loginCoach({ phone: "13700000000", display_name: "李教练" });
  const denied = store.setCoachAthletePriority({ coach_id: otherCoach.profile.id, athlete_id: priorityAthlete.athlete.id, active: true });
  const snapshot = store.snapshot();
  const errors = [];

  requireEqual(errors, priority.ok, true, "coach must be able to flag an assigned athlete as priority");
  requireEqual(errors, home.ok, true, "coach home must load for the owning coach");
  requireEqual(errors, home.review_queue[0]?.session_id, retestHomework.session.id, "retest video must sort before other review work");
  requireEqual(errors, home.review_queue[1]?.session_id, repeatedLesson.session.id, "repeated unresolved priority lesson must remain in the review queue");
  requireEqual(errors, home.review_queue[1]?.repeated_unresolved_count > 0, true, "repeated unresolved problems must add queue urgency");
  requireEqual(errors, home.review_queue[1]?.priority_student, true, "priority flag must remain coach-specific in the queue");
  requireEqual(errors, home.review_queue.every((item) => item.confirmed_main_problem_visible_before_review === false), true, "review queue must not expose confirmed main problem before review");
  requireEqual(errors, home.notifications.some((item) => item.reason === "retest_uploaded" && item.level === "important"), true, "retest upload must create an important coach notification");
  requireEqual(errors, home.notifications.some((item) => item.reason === "ineffective_plan_needs_action" && item.level === "important"), true, "ineffective plan must create an important coach notification");
  requireEqual(errors, denied.status, 403, "other organization coach must not set a priority flag");
  requireEqual(errors, snapshot.audit_events.some((event) => event.action === "coach_athlete_priority_enabled"), true, "priority changes must be audited");

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_coach_home_validation.v1",
    errors,
    checked_tables: ["training_sessions", "evidence_packets", "session_problem_tags", "training_tasks", "coach_athlete_flags", "notifications", "audit_events"],
    boundaries: {
      review_queue_organization_scoped: true,
      retest_first: true,
      priority_flag_coach_only: true,
      pre_confirmation_main_problem_hidden: true,
      in_app_notifications_only: true
    }
  };
}

export function validateArcLabReviewExperienceFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const coach = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const athlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "复盘学生" });
  const sessionIds = [];
  for (const metric of [145, 121, 96]) {
    const lesson = store.uploadCoachLesson({
      coach_id: coach.profile.id,
      athlete_id: athlete.athlete.id,
      initial_problem_tag_id: "hand_leads_before_lower_body",
      camera_view: "side",
      shot_type: "spot_up",
      trend_metric_value: metric,
      file_name: "review-local.mp4",
      upload_id: "upload_local_review"
    });
    sessionIds.push(lesson.session.id);
    store.publishCoachReview({
      coach_id: coach.profile.id,
      session_id: lesson.session.id,
      primary_problem_tag_id: "hand_leads_before_lower_body",
      coach_feedback_text: "教练确认后发布课堂复盘。"
    });
  }
  const coachReview = store.getCoachReviewExperience({
    coach_id: coach.profile.id,
    athlete_id: athlete.athlete.id,
    session_id: sessionIds[2]
  });
  store.bindInvitePhone({ token: athlete.invite.token, phone: "13900000000" });
  const studentReview = store.getStudentReviewExperienceByInvite({ token: athlete.invite.token, session_id: sessionIds[2] });
  const outsider = store.loginCoach({ phone: "13700000000" });
  const denied = store.getCoachReviewExperience({ coach_id: outsider.profile.id, athlete_id: athlete.athlete.id });
  const errors = [];

  requireEqual(errors, coachReview.ok, true, "coach review payload must be available inside the coach organization");
  requireEqual(errors, coachReview.player?.square_video_area, true, "review player must preserve the square video area");
  requireEqual(errors, coachReview.player?.full_playback_default, true, "review player must default to full playback");
  requireEqual(errors, coachReview.player?.playback_available, true, "attached local video must be playable in the local review contract");
  requireEqual(errors, coachReview.stages?.length, 4, "review payload must expose four default stages");
  requireEqual(errors, coachReview.comparison?.sessions?.length, 3, "review payload must expose recent three sessions");
  requireEqual(errors, studentReview.ok, true, "bound student must receive published lesson review payload");
  requireEqual(errors, studentReview.boundaries?.student_only_receives_published_lessons, true, "student review must only expose published lessons");
  requireEqual(errors, JSON.stringify(studentReview).includes("ai_draft_json"), false, "student review must hide AI draft JSON");
  requireEqual(errors, JSON.stringify(studentReview).includes("diff_json"), false, "student review must hide coach edit diff JSON");
  requireEqual(errors, denied.status, 403, "cross-organization coach review access must be denied");

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_review_experience_validation.v1",
    errors,
    checked_tables: ["training_sessions", "video_assets", "session_problem_tags", "athlete_metric_snapshots", "coach_feedback"],
    boundaries: {
      coach_org_scoped_playback: true,
      student_published_lessons_only: true,
      ai_draft_hidden_from_student: true,
      recent_three_sessions: true
    }
  };
}

export function validateArcLabLiveTrendFlow() {
  let tick = Date.parse("2026-06-26T08:00:00.000Z");
  const store = createArcLabIdentityStore({
    now: () => new Date(tick += 60_000)
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const firstLesson = createPublishedLesson(store, login.profile.id, added.athlete.id, 150, "lesson-one.mp4");
  const secondLesson = createPublishedLesson(store, login.profile.id, added.athlete.id, 110, "lesson-two.mp4");
  store.bindInvitePhone({ token: added.invite.token, phone: "13900000000" });
  const firstHomework = store.uploadStudentHomework({
    token: added.invite.token,
    training_task_id: firstLesson.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    trend_metric_value: 135,
    file_name: "homework-one.mp4"
  });
  const wrongViewHomework = store.uploadStudentHomework({
    token: added.invite.token,
    training_task_id: firstLesson.training_task.id,
    camera_view: "front",
    shot_type: "spot_up",
    trend_metric_value: 128,
    file_name: "homework-front.mp4"
  });
  const secondHomework = store.uploadStudentHomework({
    token: added.invite.token,
    training_task_id: secondLesson.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    trend_metric_value: 92,
    file_name: "homework-two.mp4"
  });
  const beforeConfirmation = store.getStudentTrendsByInvite(added.invite.token);
  const sideHomeworkKey = "athlete_homework:side:spot_up:hand_leads_before_lower_body";
  const confirmed = store.confirmCoachTrendExplanation({
    coach_id: login.profile.id,
    athlete_id: added.athlete.id,
    trend_key: sideHomeworkKey,
    text: "课后复测的起球延迟继续下降，保持当前节奏训练。"
  });
  const studentTrend = store.getStudentTrendsByInvite(added.invite.token);
  const coachTrend = store.getCoachTrends({ coach_id: login.profile.id, athlete_id: added.athlete.id });
  const otherCoach = store.loginCoach({ phone: "13700000000", display_name: "李教练" });
  const crossOrg = store.getCoachTrends({ coach_id: otherCoach.profile.id, athlete_id: added.athlete.id });
  const snapshot = store.snapshot();
  const errors = [];

  requireEqual(errors, firstLesson.athlete_metric_snapshot?.problem_tag_id, "hand_leads_before_lower_body", "lesson metric must wait for coach-confirmed primary tag");
  requireEqual(errors, firstHomework.athlete_metric_snapshot?.source_type, "athlete_homework", "homework metric must preserve source type");
  requireEqual(errors, wrongViewHomework.session.status, "supplemental_wrong_view_record", "wrong-view homework must remain supplemental");
  requireEqual(errors, wrongViewHomework.athlete_metric_snapshot?.camera_view, "front", "wrong-view homework must enter its actual camera track");
  requireEqual(errors, secondHomework.athlete_metric_snapshot?.camera_view, "side", "requested-view homework must keep side track");
  requireEqual(errors, beforeConfirmation.trend.interpretive_explanation.status, "hidden_until_coach_confirmation", "student explanation must stay hidden before coach confirmation");
  requireEqual(errors, confirmed.ok, true, "coach trend explanation must publish");
  requireEqual(errors, studentTrend.trend.interpretive_explanation.status, "coach_confirmed", "student explanation must be coach confirmed");
  requireEqual(errors, studentTrend.trend.current_track_key, sideHomeworkKey, "student trend must select latest side homework track");
  requireEqual(errors, coachTrend.trend.tracks.length, 3, "coach trend must keep lesson, side homework, and front homework tracks separate");
  requireEqual(errors, coachTrend.trend.coach_view.transfer_summary[0]?.transfer_state, "lesson_improved_homework_improved", "coach trend must show lesson-to-homework transfer");
  requireEqual(errors, crossOrg.ok, false, "other organization coach must not read athlete trends");
  requireEqual(errors, crossOrg.status, 403, "cross organization trend access must be rejected");
  if (JSON.stringify(studentTrend).includes("draft_json")) errors.push("student trend payload must not expose trend explanation draft");
  if (snapshot.athlete_metric_snapshots.length !== 5) errors.push("metric snapshots must include two lessons and three homework uploads");
  if (snapshot.trend_explanation_drafts.length !== 1) errors.push("trend explanation confirmation must persist one record");
  if (!snapshot.audit_events.some((event) => event.action === "coach_trend_explanation_confirmed")) {
    errors.push("coach trend explanation confirmation must be audited");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_live_trend_validation.v1",
    errors,
    checked_tables: ["training_sessions", "session_problem_tags", "athlete_metric_snapshots", "trend_explanation_drafts", "audit_events"],
    boundaries: {
      coach_confirmed_problem_tags_only: true,
      lesson_homework_separated: true,
      camera_view_and_shot_type_separated: true,
      student_explanation_requires_coach_confirmation: true,
      cross_organization_trend_access: false
    }
  };
}

export function validateArcLabStudentKnowledgeUsageFlow(knowledgeBase = {}) {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const login = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const added = store.addAthlete({ coach_id: login.profile.id, display_name: "小明" });
  const unbound = store.answerStudentKnowledgeQuestion({
    token: added.invite.token,
    question: "低位到高位起球怎么做？",
    knowledgeBase
  });
  const bound = store.bindInvitePhone({ token: added.invite.token, phone: "13900000000" });
  const first = store.answerStudentKnowledgeQuestion({
    token: added.invite.token,
    question: "低位到高位起球怎么做？",
    knowledgeBase
  });
  const personal = store.answerStudentKnowledgeQuestion({
    token: added.invite.token,
    question: "我的投篮视频有什么问题？",
    knowledgeBase
  });
  let limited;
  for (let index = 0; index < 19; index += 1) {
    limited = store.answerStudentKnowledgeQuestion({
      token: added.invite.token,
      question: "怎么拍 side view 投篮视频？",
      knowledgeBase
    });
  }
  const overLimit = store.answerStudentKnowledgeQuestion({
    token: added.invite.token,
    question: "近筐节奏投为什么重要？",
    knowledgeBase
  });
  const snapshot = store.snapshot();
  const usage = snapshot.knowledge_assistant_usage[0];
  const errors = [];

  requireEqual(errors, unbound.ok, false, "unbound invite must not use knowledge assistant");
  requireEqual(errors, unbound.status, 403, "unbound invite must require phone binding");
  requireEqual(errors, bound.ok, true, "student invite binding must pass");
  requireEqual(errors, first.ok, true, "general knowledge answer must pass");
  requireEqual(errors, first.usage.ai_answer_count, 1, "first answer must increment daily count");
  requireEqual(errors, personal.ok, false, "personal video diagnosis must be refused");
  requireEqual(errors, personal.answer.answer_type, "boundary_refusal", "personal video diagnosis must be boundary refusal");
  requireEqual(errors, personal.usage.ai_answer_count, 1, "boundary refusal must not consume AI answer count");
  requireEqual(errors, limited.usage.ai_answer_count, 20, "twentieth general answer must reach daily limit");
  requireEqual(errors, overLimit.ok, false, "over-limit answer must not pass");
  requireEqual(errors, overLimit.answer.answer_type, "rate_limited", "over-limit answer must be rate limited");
  requireEqual(errors, overLimit.usage.ai_answer_count, 20, "over-limit answer must not increment count");
  requireEqual(errors, snapshot.knowledge_assistant_usage.length, 1, "usage table must have one daily athlete record");
  requireEqual(errors, usage.ai_answer_count, 20, "usage table must persist daily AI answer count");
  if (JSON.stringify(snapshot.knowledge_assistant_usage).match(/低位|side view|近筐|视频有什么问题/)) {
    errors.push("knowledge_assistant_usage must not store student question text");
  }
  if (!snapshot.audit_events.some((event) => event.action === "student_knowledge_assistant_answered")) {
    errors.push("successful knowledge assistant answers must be auditable");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_student_knowledge_usage_validation.v1",
    errors,
    checked_tables: ["athlete_invites", "profiles", "athletes", "knowledge_assistant_usage", "audit_events"],
    boundaries: {
      student_phone_binding_required: true,
      daily_ai_answer_limit: 20,
      personal_video_diagnosis_allowed: false,
      saves_student_questions: false,
      chat_history_in_mvp: false
    }
  };
}

export function validateArcLabStudentKnowledgeDirectoryFlow(knowledgeBase = {}) {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const coach = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const athlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "知识学生" });
  const unbound = store.getStudentKnowledgeDirectoryByInvite({ token: athlete.invite.token, knowledgeBase });
  store.bindInvitePhone({ token: athlete.invite.token, phone: "13900000000" });
  const directory = store.getStudentKnowledgeDirectoryByInvite({ token: athlete.invite.token, knowledgeBase });
  const errors = [];

  requireEqual(errors, unbound.ok, false, "unbound invite must not access the student knowledge directory");
  requireEqual(errors, unbound.status, 403, "student knowledge directory must require phone binding");
  requireEqual(errors, directory.ok, true, "bound student must access the cleaned knowledge directory");
  requireEqual(errors, directory.directory.student_visible, true, "knowledge directory must be student visible");
  requireEqual(errors, directory.directory.articles.length >= DRILL_LIBRARY_SEED.length, true, "knowledge directory must include the drill library");
  requireEqual(errors, directory.boundaries.saves_student_question, false, "knowledge directory access must not save student questions");
  requireEqual(errors, directory.directory.hidden_from_student.includes("source_card_id"), true, "knowledge directory must declare source cards hidden");
  for (const article of directory.directory.articles) {
    for (const forbidden of ["source_url", "source_card_id", "raw_rule_cards", "diagnosis_rules", "false_positives"]) {
      if (Object.hasOwn(article, forbidden)) errors.push(`student knowledge directory article must not expose ${forbidden}`);
    }
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_student_knowledge_directory_validation.v1",
    errors,
    checked_tables: ["athlete_invites", "profiles", "athletes", "knowledge_articles"],
    boundaries: {
      phone_binding_required: true,
      full_clean_directory_visible: true,
      no_raw_source_cards: true,
      no_student_question_storage: true,
      no_personal_video_diagnosis: true
    }
  };
}

export function validateArcLabAuditedDeletionFlow() {
  const store = createArcLabIdentityStore({
    now: () => new Date("2026-06-26T08:00:00.000Z")
  });
  const coach = store.loginCoach({ phone: "13800000000", display_name: "王教练" });
  const videoAthlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "视频删除学生" });
  const sessionAthlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "Session 删除学生" });
  const dataAthlete = store.addAthlete({ coach_id: coach.profile.id, display_name: "数据删除学生" });
  const videoLesson = createPublishedLesson(store, coach.profile.id, videoAthlete.athlete.id, 120, "video-delete.mp4");
  const sessionLesson = createPublishedLesson(store, coach.profile.id, sessionAthlete.athlete.id, 121, "session-delete.mp4");
  const dataLesson = createPublishedLesson(store, coach.profile.id, dataAthlete.athlete.id, 122, "athlete-delete.mp4");
  store.bindInvitePhone({ token: dataAthlete.invite.token, phone: "13900000002" });
  const videoAsset = store.snapshot().video_assets.find((item) => item.session_id === videoLesson.training_task.session_id);
  const outsider = store.loginCoach({ phone: "13700000000", display_name: "李教练" });
  const crossOrg = store.deleteCoachVideoAsset({ coach_id: outsider.profile.id, video_asset_id: videoAsset.id });
  const videoDeleted = store.deleteCoachVideoAsset({ coach_id: coach.profile.id, video_asset_id: videoAsset.id });
  const afterVideoReview = store.getCoachReviewExperience({
    coach_id: coach.profile.id,
    athlete_id: videoAthlete.athlete.id,
    session_id: videoLesson.training_task.session_id
  });
  const sessionDeleted = store.deleteCoachSession({ coach_id: coach.profile.id, session_id: sessionLesson.training_task.session_id });
  const afterSessionLessons = store.listCoachLessons(coach.profile.id);
  store.bindInvitePhone({ token: sessionAthlete.invite.token, phone: "13900000001" });
  const afterSessionStudentResults = store.getStudentResultsByInvite(sessionAthlete.invite.token);
  const athleteDeleted = store.deleteCoachAthleteData({ coach_id: coach.profile.id, athlete_id: dataAthlete.athlete.id });
  const afterAthleteAccess = store.getStudentResultsByInvite(dataAthlete.invite.token);
  const duplicateAthleteDelete = store.deleteCoachAthleteData({ coach_id: coach.profile.id, athlete_id: dataAthlete.athlete.id });
  const snapshot = store.snapshot();
  const errors = [];
  const actions = snapshot.audit_events.map((event) => event.action);

  requireEqual(errors, crossOrg.status, 403, "cross-organization video deletion must be denied");
  requireEqual(errors, videoDeleted.ok, true, "owning coach must delete a video asset");
  requireEqual(errors, videoDeleted.action, "video_deleted", "video delete must use the video_deleted audit action");
  requireEqual(errors, videoDeleted.session_deleted, false, "video delete must not delete the session");
  requireEqual(errors, afterVideoReview.player?.playback_available, false, "deleted video must no longer be playable");
  requireEqual(errors, sessionDeleted.ok, true, "owning coach must delete a session");
  requireEqual(errors, sessionDeleted.action, "session_deleted", "session delete must use the session_deleted audit action");
  requireEqual(errors, sessionDeleted.video_asset_deleted, false, "session delete must not delete the video asset");
  requireEqual(errors, afterSessionLessons.lessons.some((lesson) => lesson.session.id === sessionLesson.training_task.session_id), false, "deleted session must be hidden from coach lesson list");
  requireEqual(errors, afterSessionStudentResults.results.length, 0, "deleted session must be hidden from student results");
  requireEqual(errors, athleteDeleted.ok, true, "owning coach must delete athlete data");
  requireEqual(errors, athleteDeleted.action, "athlete_data_deleted", "athlete data delete must use the athlete_data_deleted audit action");
  requireEqual(errors, athleteDeleted.boundaries.separate_from_single_video_delete, true, "athlete data deletion must be separate from video deletion");
  requireEqual(errors, afterAthleteAccess.ok, false, "deleted athlete data must block student result access");
  requireEqual(errors, duplicateAthleteDelete.ok, false, "athlete data deletion must not silently repeat");
  for (const action of ["video_deleted", "session_deleted", "athlete_data_deleted"]) {
    if (!actions.includes(action)) errors.push(`missing audit event action ${action}`);
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_audited_deletion_validation.v1",
    errors,
    checked_tables: ["athletes", "training_sessions", "video_assets", "coach_feedback", "training_tasks", "athlete_metric_snapshots", "audit_events"],
    boundaries: {
      organization_scoped_delete: true,
      video_session_athlete_data_actions_are_separate: true,
      deleted_video_unplayable: true,
      deleted_session_hidden_from_student: true,
      deleted_athlete_access_blocked: true,
      physical_file_delete_not_claimed: true
    }
  };
}

export function identityBoundaries() {
  return {
    auth_mode: "local_mock_phone_login",
    sms_provider: "not_implemented",
    default_organization_per_coach: true,
    invite_validity_days: ARC_LAB_INVITE_VALIDITY_DAYS,
    student_final_source_of_truth: "coach_published_feedback",
    ai_final_diagnosis_allowed: false,
    cross_organization_sharing_in_mvp: false
  };
}

function normalizePhone(value) {
  const phone = String(value || "").trim().replace(/[^\d+]/g, "");
  if (/^\+?\d{8,15}$/.test(phone)) return phone;
  return "";
}

function normalizeTrendMetricValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function trendMetricForProblemTag(problemTagId) {
  if (problemTagId === "hand_leads_before_lower_body") {
    return { metric_id: "ball_lift_delay_ms", label: "起球延迟", unit: "ms", improvement_direction: "decrease" };
  }
  if (problemTagId === "low_release_point") {
    return { metric_id: "release_height_delta_cm", label: "释放点差值", unit: "cm", improvement_direction: "decrease" };
  }
  return { metric_id: "coach_observed_core_metric", label: "教练记录核心指标", unit: "score", improvement_direction: "decrease" };
}

function createPublishedLesson(store, coachId, athleteId, trendMetricValue, fileName) {
  const lesson = store.uploadCoachLesson({
    coach_id: coachId,
    athlete_id: athleteId,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    trend_metric_value: trendMetricValue,
    file_name: fileName
  });
  return store.publishCoachReview({
    coach_id: coachId,
    session_id: lesson.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    coach_feedback_text: "教练确认后发布趋势记录。"
  });
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanToken(value) {
  return cleanText(value).replace(/[^\w-]/g, "");
}

function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function buildVideoEvidencePacket({ session, videoAsset }) {
  return {
    id: makeId("evidence"),
    organization_id: session.organization_id,
    session_id: session.id,
    packet_json: {
      schema_version: "arc_lab_evidence_packet_stub.v1",
      source_contract: "local_video_upload_evidence_summary_not_final_diagnosis",
      source_type: session.source_type,
      uploaded_by_role: session.uploaded_by_role,
      athlete_id: session.athlete_id,
      camera_view: session.camera_view,
      shot_type: session.shot_type,
      initial_problem_tag_id: session.initial_problem_tag_id,
      trend_key_preview: buildTrendKey({
        source_type: session.source_type,
        camera_view: session.camera_view,
        shot_type: session.shot_type,
        problem_tag_id: session.initial_problem_tag_id
      }),
      video_asset_id: videoAsset.id,
      evidence_hints: evidenceHintsFor(session.initial_problem_tag_id),
      coach_confirmation_required: true,
      final_diagnosis: false
    },
    created_at: session.created_at
  };
}

function buildVideoAiDraft({ session, evidencePacket }) {
  return {
    id: makeId("ai_draft"),
    organization_id: session.organization_id,
    session_id: session.id,
    draft_json: {
      schema_version: "arc_lab_ai_report_draft_stub.v1",
      source_contract: "ai_draft_for_coach_review_not_student_result",
      draft_type: session.source_type === "coach_lesson" ? "coach_lesson_review_prompt" : "athlete_homework_review_prompt",
      suggested_primary_problem_tag_id: session.initial_problem_tag_id,
      camera_view: session.camera_view,
      shot_type: session.shot_type,
      evidence_summary: evidencePacket.packet_json.evidence_hints,
      coach_must_confirm: true,
      student_visible: false
    },
    student_visible: false,
    created_at: session.created_at
  };
}

function buildCoachFinalPlan({ aiTrainingPlanDraft, coachFeedbackText, successTarget }) {
  return {
    steps: aiTrainingPlanDraft.steps.map((step) => ({
      ...step,
      short_reason: coachFeedbackText || reasonForStep(step.step_type),
      success_target: step.step_type === "retest"
        ? successTarget || "按同一视角、同一投篮类型上传 10 次复测。"
        : successTarget || successTargetForStep(step.step_type)
    }))
  };
}

function buildCoachEditDiff(aiDraft, finalPlan, coachSummary) {
  return {
    schema_version: "arc_lab_coach_edit_diff.v1",
    ai_step_count: aiDraft.steps.length,
    final_step_count: finalPlan.steps.length,
    coach_added_summary: Boolean(coachSummary),
    changed_fields: ["coach_summary", "short_reason", "success_target"]
  };
}

function normalizeSecondaryTags(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || "")
    .split(",")
    .map(cleanText)
    .filter(Boolean);
}

function summarizeHomeworkTaskStatus(drillStatuses) {
  if (drillStatuses.includes("ineffective")) return "ineffective";
  if (drillStatuses.includes("watching")) return "watching";
  if (drillStatuses.length > 0 && drillStatuses.every((status) => status === "effective")) return "effective";
  return "coach_reviewed";
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

function evidenceHintsFor(problemTagId) {
  const tag = PROBLEM_TAGS.find((item) => item.id === problemTagId);
  const signals = tag?.related_signal_ids?.length ? tag.related_signal_ids : ["manual_coach_review_required"];
  return signals.map((signalId) => ({
    signal_id: signalId,
    problem_tag_id: problemTagId,
    wording: "建议教练确认，不是系统最终诊断。"
  }));
}

function defaultReviewStages() {
  return DEFAULT_REVIEW_STAGES.map(([id, label], index) => ({
    id,
    label,
    order: index + 1
  }));
}

function compareQueueItems(left, right) {
  const leftRetest = left.status === "retest_uploaded" ? 1 : 0;
  const rightRetest = right.status === "retest_uploaded" ? 1 : 0;
  if (leftRetest !== rightRetest) return rightRetest - leftRetest;
  if (left.repeated_unresolved_count !== right.repeated_unresolved_count) return right.repeated_unresolved_count - left.repeated_unresolved_count;
  if (left.waiting_hours !== right.waiting_hours) return right.waiting_hours - left.waiting_hours;
  if (left.priority_student !== right.priority_student) return Number(right.priority_student) - Number(left.priority_student);
  return String(right.uploaded_at).localeCompare(String(left.uploaded_at));
}

function cleanObjectKey(value) {
  const clean = cleanText(value).replace(/[^\w.\-\/]/g, "_");
  return clean || `${makeId("lesson")}.mp4`;
}

function error(code, message, status = 400) {
  return {
    ok: false,
    schema_version: ARC_LAB_IDENTITY_SCHEMA_VERSION,
    error: code,
    message,
    status
  };
}

function requireEqual(errors, actual, expected, message) {
  if (actual !== expected) errors.push(`${message}: expected ${expected}, got ${actual}`);
}
