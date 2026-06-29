import assert from "node:assert/strict";
import {
  buildArcLabTrendSnapshot,
  summarizeArcLabTrendContract,
  validateArcLabTrendContract
} from "../server/arcLabTrends.mjs";

const validation = validateArcLabTrendContract();
assert.equal(validation.ok, true, validation.errors.join("\n"));

const summary = summarizeArcLabTrendContract();
assert.equal(summary.schema_version, "arc_lab_trend_contract.v1");
assert.deepEqual(summary.trend_key_fields, ["source_type", "camera_view", "shot_type", "problem_tag_id"]);
assert.equal(summary.recent_session_compare_count, 3);
assert.equal(summary.lesson_homework_split_required, true);
assert.equal(summary.student_view.interpretive_explanation_requires_coach_confirmation, true);
assert.equal(summary.coach_view.lesson_homework_transfer_visible, true);

const sessions = [
  trendSession("lesson_004", "2026-06-26T10:00:00.000Z", "coach_lesson", "side", "spot_up", 78),
  trendSession("lesson_003", "2026-06-19T10:00:00.000Z", "coach_lesson", "side", "spot_up", 93),
  trendSession("lesson_002", "2026-06-12T10:00:00.000Z", "coach_lesson", "side", "spot_up", 122),
  trendSession("lesson_001", "2026-06-05T10:00:00.000Z", "coach_lesson", "side", "spot_up", 151),
  trendSession("homework_002", "2026-06-25T10:00:00.000Z", "athlete_homework", "side", "spot_up", 97),
  trendSession("homework_001", "2026-06-18T10:00:00.000Z", "athlete_homework", "side", "spot_up", 130),
  trendSession("front_lesson_001", "2026-06-24T10:00:00.000Z", "coach_lesson", "front", "spot_up", 88),
  trendSession("free_throw_lesson_001", "2026-06-23T10:00:00.000Z", "coach_lesson", "side", "free_throw", 104)
];

const snapshot = buildArcLabTrendSnapshot({
  sessions,
  current_trend_key: "coach_lesson:side:spot_up:hand_leads_before_lower_body"
});
assert.equal(snapshot.ok, true, snapshot.errors.join("\n"));
assert.equal(snapshot.tracks.length, 4);

const lessonSide = findTrack(snapshot, "coach_lesson:side:spot_up:hand_leads_before_lower_body");
const homeworkSide = findTrack(snapshot, "athlete_homework:side:spot_up:hand_leads_before_lower_body");
const lessonFront = findTrack(snapshot, "coach_lesson:front:spot_up:hand_leads_before_lower_body");
const lessonFreeThrow = findTrack(snapshot, "coach_lesson:side:free_throw:hand_leads_before_lower_body");

assert.notEqual(lessonSide.trend_key, homeworkSide.trend_key, "lesson and homework trends must not mix");
assert.notEqual(lessonSide.trend_key, lessonFront.trend_key, "camera view trends must not mix");
assert.notEqual(lessonSide.trend_key, lessonFreeThrow.trend_key, "shot type trends must not mix");
assert.deepEqual(lessonSide.sessions.map((session) => session.session_id), ["lesson_004", "lesson_003", "lesson_002"]);
assert.equal(lessonSide.core_metric_delta.direction, "improved");
assert.equal(homeworkSide.core_metric_delta.direction, "improved");
assert(snapshot.coach_view.transfer_summary.some((item) => item.transfer_state === "lesson_improved_homework_improved"));

assert.equal(snapshot.student_view.current_problem_tag_id, "hand_leads_before_lower_body");
assert.equal(snapshot.student_view.current_track_key, lessonSide.trend_key);
assert.equal(snapshot.student_view.core_metric.metric_id, "ball_lift_delay_ms");
assert.equal(snapshot.student_view.core_metric.direction, "improved");
assert.equal(snapshot.student_view.recent_sessions.length, 3);
assert.equal(snapshot.student_view.interpretive_explanation.status, "hidden_until_coach_confirmation");
assert(snapshot.student_view.hidden_from_student.includes("full_evidence_confidence_detail"));
assert(snapshot.student_view.hidden_from_student.includes("ai_trend_explanation_draft"));

const confirmedExplanation = buildArcLabTrendSnapshot({
  sessions,
  current_trend_key: lessonSide.trend_key,
  coach_confirmed_explanation: {
    status: "coach_confirmed",
    text: "Lesson and homework both improved; keep the current correction plan."
  }
});
assert.equal(confirmedExplanation.student_view.interpretive_explanation.status, "coach_confirmed");
assert.match(confirmedExplanation.student_view.interpretive_explanation.text, /homework both improved/);

const invalid = buildArcLabTrendSnapshot({
  sessions: [
    {
      session_id: "ai_only_tag",
      occurred_at: "2026-06-26T10:00:00.000Z",
      source_type: "coach_lesson",
      camera_view: "side",
      shot_type: "spot_up",
      coach_confirmed_primary_problem_id: "ai_suggested_non_standard_tag",
      metrics: [{ metric_id: "ball_lift_delay_ms", value: 80 }]
    }
  ]
});
assert.equal(invalid.ok, false);
assert(invalid.errors.some((error) => error.includes("coach_confirmed_primary_problem_id")));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_trend_smoke.v1",
  source_contract: "coach_confirmed_trend_tracks_local_contract",
  track_count: snapshot.tracks.length,
  lesson_side_recent_sessions: lessonSide.sessions.map((session) => session.session_id),
  student_view: {
    current_problem_tag_id: snapshot.student_view.current_problem_tag_id,
    current_track_key: snapshot.student_view.current_track_key,
    core_metric_id: snapshot.student_view.core_metric.metric_id,
    core_metric_direction: snapshot.student_view.core_metric.direction,
    interpretive_explanation_status: snapshot.student_view.interpretive_explanation.status
  },
  transfer_summary: snapshot.coach_view.transfer_summary,
  boundaries: [
    "trend_key_keeps_source_view_shot_type_problem_tag_separate",
    "student_view_recent_3_simplified",
    "student_interpretive_explanation_hidden_until_coach_confirmation",
    "coach_view_keeps_lesson_homework_transfer_context"
  ]
}, null, 2));

function trendSession(sessionId, occurredAt, sourceType, cameraView, shotType, value) {
  return {
    session_id: sessionId,
    occurred_at: occurredAt,
    source_type: sourceType,
    camera_view: cameraView,
    shot_type: shotType,
    coach_confirmed_primary_problem_id: "hand_leads_before_lower_body",
    metrics: [
      {
        metric_id: "ball_lift_delay_ms",
        label: "Ball lift delay",
        value,
        unit: "ms",
        improvement_direction: "decrease"
      }
    ],
    evidence_confidence: "medium"
  };
}

function findTrack(snapshot, trendKey) {
  const track = snapshot.tracks.find((item) => item.trend_key === trendKey);
  assert(track, `missing trend track ${trendKey}`);
  return track;
}
