const CANDIDATE_ONLY_CONTRACT = "candidate_only_yolo_adapter_output_not_stable_tracking";

export function buildBallTrajectoryModule(objectDetection = {}) {
  const trajectory = objectDetection.trajectory || {};
  const rawBallPoints = Array.isArray(trajectory.ball_points) ? trajectory.ball_points : [];
  const ballPoints = rawBallPoints.filter(isValidBallPoint);
  const rawRimReference = trajectory.rim_reference || null;
  const rimReference = isValidRimReference(rawRimReference) ? rawRimReference : null;
  const shotEvents = Array.isArray(objectDetection.shot_events) ? objectDetection.shot_events : [];
  const summary = objectDetection.shot_summary || {};
  const missing = [];

  if (objectDetection.status !== "provided_by_adapter") {
    const reason = objectDetection.status || "not_available";
    missing.push({
      reason,
      message: reason === "adapter_error"
        ? objectDetection.error || "Object detection adapter returned an error, so ball trajectory must remain unavailable."
        : "Ball trajectory is unavailable because object detection did not provide usable adapter output."
    });
  }
  if (objectDetection.error && objectDetection.status !== "adapter_error") {
    missing.push({
      reason: "adapter_error",
      message: objectDetection.error || "Object detection adapter returned an error, so ball trajectory must remain unavailable."
    });
  }
  if (rawBallPoints.length !== ballPoints.length) {
    missing.push({
      reason: "invalid_ball_points",
      message: "Some adapter ball points were ignored because frame, x, y, or confidence were not finite numbers."
    });
  }
  if (rawRimReference && !rimReference) {
    missing.push({
      reason: "invalid_rim_reference",
      message: "The adapter rim reference was ignored because its frame, box, or confidence was not finite numeric evidence."
    });
  }
  if (!ballPoints.length) {
    missing.push({
      reason: "ball_not_detected",
      message: "No reliable ball points were detected."
    });
  }
  if (!rimReference) {
    missing.push({
      reason: "rim_not_detected",
      message: "No rim reference was detected, so make/miss and rim crossing must remain unavailable."
    });
  }
  if (ballPoints.length > 0 && ballPoints.length < 3) {
    missing.push({
      reason: "not_enough_consecutive_frames",
      message: "Ball detections are too sparse for stable 2D trajectory tracking."
    });
  }
  for (const item of normalizeTrajectoryFailureReasons(trajectory.failure_reasons || objectDetection.failure_reasons || [])) {
    if (!missing.some((existing) => existing.reason === item.reason)) missing.push(item);
  }

  const confidence = Number(summary.confidence || shotEvents[0]?.confidence || 0);
  const status = trajectoryStatus({ objectDetection, ballPoints, rimReference, shotEvents, confidence });

  return {
    schema_version: "ball_trajectory.v1",
    source_contract: CANDIDATE_ONLY_CONTRACT,
    interpretation_policy: "candidate_visualization_only_not_diagnosis",
    diagnosis_allowed: false,
    status,
    confidence,
    sampled_frames: new Set(ballPoints.map((point) => point.frame).filter((frame) => frame !== undefined && frame !== null)).size,
    valid_ball_points: ballPoints.length,
    invalid_ball_points: rawBallPoints.length - ballPoints.length,
    rim_detected: Boolean(rimReference),
    trajectory_points: ballPoints,
    rim_reference: rimReference,
    events: shotEvents.map((event) => ({
      event_id: event.event_id,
      status: confidence >= 0.6 ? "candidate" : "low_confidence_candidate",
      release_frame: event.release_frame ?? null,
      rim_cross_frame: event.rim_cross_frame ?? null,
      release_angle_deg: event.release_angle_deg ?? null,
      ball_path_offset_cm: event.ball_path_offset_cm ?? null,
      judgement: event.judgement === "made" || event.judgement === "missed"
        ? `candidate_${event.judgement}`
        : "unknown",
      basis: event.basis || null
    })),
    missing_evidence: missing
  };
}

function isValidBallPoint(point) {
  return point
    && Number.isFinite(Number(point.frame))
    && Number.isFinite(Number(point.x))
    && Number.isFinite(Number(point.y))
    && Number.isFinite(Number(point.confidence ?? 0));
}

function isValidRimReference(reference) {
  return reference
    && Number.isFinite(Number(reference.frame))
    && Array.isArray(reference.box)
    && reference.box.length === 4
    && reference.box.every((value) => Number.isFinite(Number(value)))
    && Number.isFinite(Number(reference.confidence ?? 0));
}

export function normalizeTrajectoryFailureReasons(items) {
  const knownMessages = {
    camera_view_not_suitable: "The current camera view is not suitable for reliable ball trajectory interpretation.",
    low_resolution_or_motion_blur: "The video appears too low-resolution or motion-blurred for reliable ball tracking.",
    adapter_error: "Object detection adapter returned an error, so ball trajectory must remain unavailable.",
    adapter_not_configured: "Object detection adapter is not configured.",
    ball_not_detected: "No reliable ball points were detected.",
    rim_not_detected: "No rim reference was detected.",
    not_enough_consecutive_frames: "Ball detections are too sparse for stable 2D trajectory tracking.",
    ball_occluded_by_body: "The ball appears occluded by the shooter, support hand, or body.",
    rim_out_of_frame: "The rim appears cropped or outside the frame.",
    multiple_ball_candidates: "Multiple ball-like candidates were detected, so ball identity is unstable.",
    invalid_ball_points: "Some adapter ball points were ignored because they were not finite numeric detections.",
    invalid_rim_reference: "The adapter rim reference was ignored because it was not finite numeric evidence."
  };
  return items
    .map((item) => typeof item === "string" ? { reason: item } : item)
    .filter((item) => item?.reason)
    .map((item) => ({
      reason: item.reason,
      message: item.message || knownMessages[item.reason] || "Ball trajectory evidence is incomplete."
    }));
}

export function trajectoryStatus({ objectDetection, ballPoints, rimReference, shotEvents, confidence }) {
  if (objectDetection.status !== "provided_by_adapter") return "not_available";
  if (!ballPoints.length || !rimReference) return "insufficient_evidence";
  if (ballPoints.length >= 3 && shotEvents.length && confidence >= 0.6) return "tracked";
  return "candidate";
}
