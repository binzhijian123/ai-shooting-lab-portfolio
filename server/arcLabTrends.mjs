import {
  CAMERA_VIEWS,
  PROBLEM_TAGS,
  SHOT_TYPES,
  VIDEO_SOURCE_TYPES,
  buildTrendKey
} from "./arcLabContracts.mjs";

export const ARC_LAB_TREND_SCHEMA_VERSION = "arc_lab_trend_contract.v1";

const VALID_CAMERA_VIEWS = new Set(CAMERA_VIEWS.map((item) => item.id));
const VALID_PROBLEM_TAGS = new Set(PROBLEM_TAGS.map((item) => item.id));
const VALID_SHOT_TYPES = new Set(SHOT_TYPES.map((item) => item.id));
const VALID_SOURCE_TYPES = new Set(VIDEO_SOURCE_TYPES.map((item) => item.id));

export function buildArcLabTrendSnapshot({ sessions = [], current_trend_key = null, coach_confirmed_explanation = null } = {}) {
  const errors = [];
  const normalizedSessions = [];
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const normalized = normalizeTrendSession(session);
    if (normalized.errors.length) {
      errors.push(...normalized.errors.map((error) => `${session.session_id || "unknown_session"}.${error}`));
      continue;
    }
    normalizedSessions.push(normalized.session);
  }

  const tracks = groupTrendTracks(normalizedSessions);
  const latestTrackKey = current_trend_key || pickLatestTrackKey(tracks);
  const currentTrack = tracks.find((track) => track.trend_key === latestTrackKey) || null;
  const currentRecentSessions = currentTrack ? currentTrack.sessions.slice(0, 3) : [];
  const currentMetric = currentRecentSessions[0]?.metrics?.[0] || null;

  return {
    ok: errors.length === 0,
    schema_version: ARC_LAB_TREND_SCHEMA_VERSION,
    source_contract: "coach_confirmed_problem_trends_not_ai_diagnosis",
    errors,
    trend_policy: {
      latest_session_primary: true,
      recent_session_compare_count: 3,
      trend_key_fields: ["source_type", "camera_view", "shot_type", "problem_tag_id"],
      lesson_homework_split_required: true,
      no_mixed_camera_view_tracks: true,
      no_mixed_shot_type_tracks: true,
      student_interpretive_explanation_requires_coach_confirmation: true
    },
    tracks,
    coach_view: buildCoachTrendView(tracks),
    student_view: buildStudentTrendView({
      currentTrack,
      recentSessions: currentRecentSessions,
      currentMetric,
      coachConfirmedExplanation: coach_confirmed_explanation
    })
  };
}

export function summarizeArcLabTrendContract() {
  return {
    schema_version: ARC_LAB_TREND_SCHEMA_VERSION,
    source_contract: "local_trend_contract_not_database_or_production_ui",
    trend_key_fields: ["source_type", "camera_view", "shot_type", "problem_tag_id"],
    recent_session_compare_count: 3,
    lesson_homework_split_required: true,
    student_view: {
      simplified: true,
      shows_one_current_tag: true,
      shows_one_core_metric: true,
      interpretive_explanation_requires_coach_confirmation: true
    },
    coach_view: {
      full_tracks: true,
      evidence_confidence_visible: true,
      lesson_homework_transfer_visible: true
    }
  };
}

export function validateArcLabTrendContract() {
  const snapshot = buildArcLabTrendSnapshot({
    sessions: trendContractFixture(),
    coach_confirmed_explanation: {
      status: "coach_confirmed",
      text: "Lesson and homework both improved; current training is transferring."
    }
  });
  const errors = [...snapshot.errors];
  const sideLesson = snapshot.tracks.find((track) => track.trend_key === "coach_lesson:side:spot_up:hand_leads_before_lower_body");
  const sideHomework = snapshot.tracks.find((track) => track.trend_key === "athlete_homework:side:spot_up:hand_leads_before_lower_body");
  const frontLesson = snapshot.tracks.find((track) => track.trend_key === "coach_lesson:front:spot_up:hand_leads_before_lower_body");

  if (!sideLesson) errors.push("missing side lesson trend track");
  if (!sideHomework) errors.push("missing side homework trend track");
  if (!frontLesson) errors.push("missing front lesson trend track");
  if (sideLesson && sideHomework && sideLesson.trend_key === sideHomework.trend_key) {
    errors.push("lesson and homework trend tracks must not mix");
  }
  if (sideLesson && frontLesson && sideLesson.trend_key === frontLesson.trend_key) {
    errors.push("camera view trend tracks must not mix");
  }
  if ((sideLesson?.sessions.length || 0) !== 3) {
    errors.push("side lesson trend track must keep the latest 3 sessions");
  }
  if (snapshot.student_view.recent_sessions.length !== 3) {
    errors.push("student view must expose recent 3-session comparison");
  }
  if (snapshot.student_view.current_problem_tag_id !== "hand_leads_before_lower_body") {
    errors.push("student view must show the current main problem tag");
  }
  if (snapshot.student_view.core_metric?.metric_id !== "ball_lift_delay_ms") {
    errors.push("student view must expose one core metric for the current tag");
  }
  if (snapshot.student_view.interpretive_explanation.status !== "coach_confirmed") {
    errors.push("student trend explanation must require coach confirmation");
  }
  if (!snapshot.coach_view.transfer_summary.some((item) => item.transfer_state === "lesson_improved_homework_improved")) {
    errors.push("coach view must include lesson vs homework transfer summary");
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_trend_validation.v1",
    summary: summarizeArcLabTrendContract(),
    errors
  };
}

function normalizeTrendSession(input) {
  const errors = [];
  if (!input.session_id) errors.push("session_id is required");
  if (!input.occurred_at) errors.push("occurred_at is required");
  if (!VALID_SOURCE_TYPES.has(input.source_type)) errors.push("source_type must be standard");
  if (!VALID_CAMERA_VIEWS.has(input.camera_view)) errors.push("camera_view must be standard");
  if (!VALID_SHOT_TYPES.has(input.shot_type)) errors.push("shot_type must be standard");
  if (!VALID_PROBLEM_TAGS.has(input.coach_confirmed_primary_problem_id)) {
    errors.push("coach_confirmed_primary_problem_id must be a standard coach-confirmed tag");
  }
  const metrics = Array.isArray(input.metrics) ? input.metrics.filter(isValidMetric) : [];
  if (!metrics.length) errors.push("at least one numeric metric is required");
  if (errors.length) return { errors, session: null };

  const trendKey = buildTrendKey({
    source_type: input.source_type,
    camera_view: input.camera_view,
    shot_type: input.shot_type,
    problem_tag_id: input.coach_confirmed_primary_problem_id
  });
  return {
    errors: [],
    session: {
      session_id: input.session_id,
      occurred_at: input.occurred_at,
      source_type: input.source_type,
      camera_view: input.camera_view,
      shot_type: input.shot_type,
      coach_confirmed_primary_problem_id: input.coach_confirmed_primary_problem_id,
      coach_confirmed_secondary_problem_ids: Array.isArray(input.coach_confirmed_secondary_problem_ids)
        ? input.coach_confirmed_secondary_problem_ids.filter((tagId) => VALID_PROBLEM_TAGS.has(tagId)).slice(0, 2)
        : [],
      metrics,
      evidence_confidence: input.evidence_confidence || "unknown",
      trend_key: trendKey
    }
  };
}

function groupTrendTracks(sessions) {
  const trackMap = new Map();
  for (const session of sessions) {
    if (!trackMap.has(session.trend_key)) {
      trackMap.set(session.trend_key, {
        trend_key: session.trend_key,
        source_type: session.source_type,
        camera_view: session.camera_view,
        shot_type: session.shot_type,
        problem_tag_id: session.coach_confirmed_primary_problem_id,
        sessions: []
      });
    }
    trackMap.get(session.trend_key).sessions.push(session);
  }
  return [...trackMap.values()]
    .map((track) => {
      const sortedSessions = track.sessions.sort(compareNewestFirst).slice(0, 3);
      return {
        ...track,
        sessions: sortedSessions,
        core_metric_delta: buildMetricDelta(sortedSessions)
      };
    })
    .sort((left, right) => compareNewestFirst(left.sessions[0], right.sessions[0]));
}

function buildCoachTrendView(tracks) {
  return {
    schema_version: "arc_lab_coach_trend_view.v1",
    source_contract: "coach_full_history_with_evidence_and_transfer_context",
    tracks,
    transfer_summary: buildTransferSummary(tracks),
    visibility: {
      all_confirmed_tags: true,
      evidence_confidence_detail: true,
      ai_draft_vs_coach_final_diff_allowed: true
    }
  };
}

function buildStudentTrendView({ currentTrack, recentSessions, currentMetric, coachConfirmedExplanation }) {
  return {
    schema_version: "arc_lab_student_trend_view.v1",
    source_contract: "student_simplified_coach_confirmed_trend_only",
    current_problem_tag_id: currentTrack?.problem_tag_id || null,
    current_track_key: currentTrack?.trend_key || null,
    current_source_type: currentTrack?.source_type || null,
    current_camera_view: currentTrack?.camera_view || null,
    current_shot_type: currentTrack?.shot_type || null,
    core_metric: currentMetric ? {
      metric_id: currentMetric.metric_id,
      label: currentMetric.label,
      value: currentMetric.value,
      unit: currentMetric.unit,
      direction: directionFromDelta(currentTrack?.core_metric_delta)
    } : null,
    recent_sessions: recentSessions.map((session) => ({
      session_id: session.session_id,
      occurred_at: session.occurred_at,
      value: session.metrics[0].value
    })),
    interpretive_explanation: coachConfirmedExplanation?.status === "coach_confirmed"
      ? { status: "coach_confirmed", text: coachConfirmedExplanation.text }
      : { status: "hidden_until_coach_confirmation", text: null },
    hidden_from_student: [
      "full_evidence_confidence_detail",
      "ai_trend_explanation_draft",
      "all_historical_tracks",
      "coach_edit_diff_json"
    ]
  };
}

function buildMetricDelta(sessions) {
  if (sessions.length < 2) {
    return { status: "insufficient_history", metric_id: sessions[0]?.metrics?.[0]?.metric_id || null };
  }
  const latest = sessions[0].metrics[0];
  const previous = sessions[1].metrics.find((metric) => metric.metric_id === latest.metric_id);
  if (!previous) return { status: "missing_previous_metric", metric_id: latest.metric_id };
  return {
    status: "compared_to_previous_session",
    metric_id: latest.metric_id,
    latest_value: latest.value,
    previous_value: previous.value,
    delta: Number((latest.value - previous.value).toFixed(3)),
    direction: directionFromValues(latest.value, previous.value, latest.improvement_direction)
  };
}

function buildTransferSummary(tracks) {
  const summaries = [];
  const lessonTracks = tracks.filter((track) => track.source_type === "coach_lesson");
  for (const lessonTrack of lessonTracks) {
    const homeworkTrack = tracks.find((track) => (
      track.source_type === "athlete_homework"
      && track.camera_view === lessonTrack.camera_view
      && track.shot_type === lessonTrack.shot_type
      && track.problem_tag_id === lessonTrack.problem_tag_id
    ));
    if (!homeworkTrack) continue;
    summaries.push({
      trend_key_base: `${lessonTrack.camera_view}:${lessonTrack.shot_type}:${lessonTrack.problem_tag_id}`,
      lesson_direction: lessonTrack.core_metric_delta.direction,
      homework_direction: homeworkTrack.core_metric_delta.direction,
      transfer_state: classifyTransferState(lessonTrack.core_metric_delta.direction, homeworkTrack.core_metric_delta.direction)
    });
  }
  return summaries;
}

function classifyTransferState(lessonDirection, homeworkDirection) {
  if (lessonDirection === "improved" && homeworkDirection === "improved") {
    return "lesson_improved_homework_improved";
  }
  if (lessonDirection === "improved" && homeworkDirection !== "improved") {
    return "lesson_improved_homework_not_improved";
  }
  if (lessonDirection !== "improved" && homeworkDirection === "improved") {
    return "homework_improved_lesson_not_improved";
  }
  return "lesson_and_homework_not_improved";
}

function pickLatestTrackKey(tracks) {
  return tracks[0]?.trend_key || null;
}

function compareNewestFirst(left, right) {
  return new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
}

function isValidMetric(metric) {
  return Boolean(metric?.metric_id) && Number.isFinite(metric.value);
}

function directionFromDelta(delta) {
  return delta?.direction || "not_enough_history";
}

function directionFromValues(latest, previous, improvementDirection = "decrease") {
  if (latest === previous) return "flat";
  if (improvementDirection === "increase") return latest > previous ? "improved" : "regressed";
  return latest < previous ? "improved" : "regressed";
}

function trendContractFixture() {
  const metric = (value) => ({
    metric_id: "ball_lift_delay_ms",
    label: "Ball lift delay",
    value,
    unit: "ms",
    improvement_direction: "decrease"
  });
  return [
    {
      session_id: "lesson_003",
      occurred_at: "2026-06-26T10:00:00.000Z",
      source_type: "coach_lesson",
      camera_view: "side",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
      metrics: [metric(82)],
      evidence_confidence: "medium"
    },
    {
      session_id: "lesson_002",
      occurred_at: "2026-06-19T10:00:00.000Z",
      source_type: "coach_lesson",
      camera_view: "side",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
      metrics: [metric(116)],
      evidence_confidence: "medium"
    },
    {
      session_id: "lesson_001",
      occurred_at: "2026-06-12T10:00:00.000Z",
      source_type: "coach_lesson",
      camera_view: "side",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
      metrics: [metric(148)],
      evidence_confidence: "low"
    },
    {
      session_id: "lesson_front_001",
      occurred_at: "2026-06-25T10:00:00.000Z",
      source_type: "coach_lesson",
      camera_view: "front",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
      metrics: [metric(93)],
      evidence_confidence: "low"
    },
    {
      session_id: "homework_002",
      occurred_at: "2026-06-24T10:00:00.000Z",
      source_type: "athlete_homework",
      camera_view: "side",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
      metrics: [metric(104)],
      evidence_confidence: "medium"
    },
    {
      session_id: "homework_001",
      occurred_at: "2026-06-17T10:00:00.000Z",
      source_type: "athlete_homework",
      camera_view: "side",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
      metrics: [metric(139)],
      evidence_confidence: "low"
    }
  ];
}
