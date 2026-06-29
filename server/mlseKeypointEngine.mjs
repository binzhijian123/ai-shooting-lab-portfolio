const MLSE_RESEARCH_SOURCE = "mlse_spl_open_data";
const EPSILON = 1e-8;
const VERTICAL_AXIS = [0, 0, 1];

const SIDE_KEYPOINTS = {
  left: {
    shoulder: "LEFT_SHOULDER",
    elbow: "LEFT_ELBOW",
    wrist: "LEFT_WRIST",
    hip: "LEFT_HIP",
    knee: "LEFT_KNEE",
    ankle: "LEFT_ANKLE",
    forefoot: "LEFT_BIG_TOE",
    heel: "LEFT_HEEL",
    middleFingerMcp: "LEFT_THIRD_FINGER_MCP"
  },
  right: {
    shoulder: "RIGHT_SHOULDER",
    elbow: "RIGHT_ELBOW",
    wrist: "RIGHT_WRIST",
    hip: "RIGHT_HIP",
    knee: "RIGHT_KNEE",
    ankle: "RIGHT_ANKLE",
    forefoot: "RIGHT_BIG_TOE",
    heel: "RIGHT_HEEL",
    middleFingerMcp: "RIGHT_THIRD_FINGER_MCP"
  }
};

const REQUIRED_POINT_IDS = [
  "LEFT_SHOULDER",
  "RIGHT_SHOULDER",
  "LEFT_ELBOW",
  "RIGHT_ELBOW",
  "LEFT_WRIST",
  "RIGHT_WRIST",
  "LEFT_HIP",
  "RIGHT_HIP",
  "LEFT_KNEE",
  "RIGHT_KNEE",
  "LEFT_ANKLE",
  "RIGHT_ANKLE",
  "LEFT_BIG_TOE",
  "RIGHT_BIG_TOE",
  "LEFT_HEEL",
  "RIGHT_HEEL",
  "LEFT_THIRD_FINGER_MCP",
  "RIGHT_THIRD_FINGER_MCP"
];

export const MLSE_KEYPOINT_CONTRACT = {
  schema_version: "mlse_keypoint_calculation.v1",
  source: MLSE_RESEARCH_SOURCE,
  scope: "research_only_3d_keypoint_geometry_no_scoring_or_problem_mapping",
  coordinate_system: "MLSE court-global xyz in feet; z is treated as vertical",
  missing_data_policy: "non-finite source values become null; no interpolation is applied",
  licensing_boundary: "Do not bundle source data or use derived outputs in a commercial product without separate rights."
};

export function parseMlseTrialJson(rawText) {
  if (typeof rawText !== "string") {
    throw new Error("MLSE trial input must be JSON text.");
  }

  const nonFiniteTokenCount = (rawText.match(/-?Infinity|\bNaN\b/g) || []).length;
  const sanitized = rawText.replace(/-?Infinity|\bNaN\b/g, "null");

  try {
    return {
      trial: JSON.parse(sanitized),
      parse_quality: {
        source_non_finite_tokens_replaced: nonFiniteTokenCount,
        status: nonFiniteTokenCount > 0 ? "parsed_with_missing_values" : "parsed"
      }
    };
  } catch (error) {
    throw new Error(`Unable to parse MLSE trial JSON: ${error.message}`);
  }
}

export function buildMlseKeypointCalculation(trial, options = {}) {
  if (!trial || typeof trial !== "object") {
    throw new Error("MLSE trial must be an object.");
  }
  if (!Array.isArray(trial.tracking) || trial.tracking.length === 0) {
    throw new Error("MLSE trial must contain at least one tracking frame.");
  }

  const normalizedFrames = trial.tracking.map(normalizeTrackingFrame).sort((a, b) => a.time_ms - b.time_ms);
  const requestedSide = normalizeSide(options.shooting_side);
  const inferredSide = inferShootingSide(normalizedFrames);
  const shootingSide = requestedSide || inferredSide.candidate;
  const sideResolution = {
    requested: requestedSide,
    candidate: inferredSide.candidate,
    status: requestedSide ? "provided" : inferredSide.status,
    confidence: requestedSide ? 1 : inferredSide.confidence,
    left_contact_distance_ft: inferredSide.left_contact_distance_ft,
    right_contact_distance_ft: inferredSide.right_contact_distance_ft
  };

  const frameSeries = normalizedFrames.map((frame, index) => buildFrameCalculation({
    frame,
    previousFrame: normalizedFrames[index - 1] || null,
    shootingSide
  }));
  const coverage = buildCoverage(normalizedFrames);

  return {
    ...MLSE_KEYPOINT_CONTRACT,
    trial: {
      participant_id: trial.participant_id || null,
      trial_date: trial.trial_date || null,
      trial_id: trial.trial_id || null,
      sampling_rate: finiteNumber(trial.sampling_rate),
      result: trial.result === "made" || trial.result === "missed" ? trial.result : "unknown",
      landing_x: finiteNumber(trial.landing_x),
      landing_y: finiteNumber(trial.landing_y),
      entry_angle: finiteNumber(trial.entry_angle)
    },
    shooting_side: sideResolution,
    quality: {
      total_frames: frameSeries.length,
      valid_geometry_frames: frameSeries.filter((frame) => frame.valid_geometry).length,
      keypoint_coverage: coverage,
      note: "Angle values are raw 3D geometry. Smoothing, phase segmentation, observations, and scoring are intentionally outside this module."
    },
    frame_series: frameSeries,
    angle_summary: buildAngleSummary(frameSeries),
    release_candidate: buildReleaseCandidate(frameSeries)
  };
}

export function buildMlseKeypointCalculationFromJson(rawText, options = {}) {
  const parsed = parseMlseTrialJson(rawText);
  return {
    ...buildMlseKeypointCalculation(parsed.trial, options),
    parse_quality: parsed.parse_quality
  };
}

function normalizeTrackingFrame(rawFrame, index) {
  const player = rawFrame?.data?.player || {};
  const time = finiteNumber(rawFrame?.time);
  return {
    frame: Number.isInteger(rawFrame?.frame) ? rawFrame.frame : index,
    time_ms: time ?? index,
    ball: normalizePoint(rawFrame?.data?.ball),
    player: Object.fromEntries(Object.entries(player).map(([key, value]) => [key, normalizePoint(value)]))
  };
}

function buildFrameCalculation({ frame, previousFrame, shootingSide }) {
  const left = pickSidePoints(frame.player, "left");
  const right = pickSidePoints(frame.player, "right");
  const selected = pickSidePoints(frame.player, shootingSide);
  const shoulderMidpoint = midpoint(left.shoulder, right.shoulder);
  const hipMidpoint = midpoint(left.hip, right.hip);
  const ballSpeed = previousFrame ? speedFtPerSecond(previousFrame.ball, frame.ball, previousFrame.time_ms, frame.time_ms) : null;

  const angles = {
    hip_flexion_extension_deg: angleAt(selected.shoulder, selected.hip, selected.knee),
    knee_flexion_extension_deg: angleAt(selected.hip, selected.knee, selected.ankle),
    ankle_dorsi_plantar_flexion_deg: selected.heel && selected.forefoot
      ? angleAt(selected.knee, selected.ankle, selected.forefoot)
      : null,
    trunk_lean_from_vertical_deg: angleFromVertical(hipMidpoint, shoulderMidpoint),
    upper_arm_to_trunk_deg: angleAt(selected.elbow, selected.shoulder, selected.hip),
    elbow_flexion_extension_deg: angleAt(selected.shoulder, selected.elbow, selected.wrist),
    forearm_from_vertical_deg: angleFromVertical(selected.elbow, selected.wrist),
    wrist_flexion_extension_deg: angleAt(selected.elbow, selected.wrist, selected.middleFingerMcp)
  };

  const selectedKeypoints = {
    shoulder: selected.shoulder,
    elbow: selected.elbow,
    wrist: selected.wrist,
    hip: selected.hip,
    knee: selected.knee,
    ankle: selected.ankle,
    forefoot: selected.forefoot,
    heel: selected.heel,
    middle_finger_mcp: selected.middleFingerMcp,
    left_shoulder: left.shoulder,
    right_shoulder: right.shoulder,
    left_hip: left.hip,
    right_hip: right.hip
  };

  return {
    frame: frame.frame,
    time_ms: frame.time_ms,
    shooting_side: shootingSide,
    valid_geometry: Boolean(selected.shoulder && selected.elbow && selected.wrist && selected.hip && selected.knee && selected.ankle),
    keypoints: selectedKeypoints,
    ball: frame.ball,
    ball_height_ft: frame.ball?.[2] ?? null,
    ball_speed_ft_s: ballSpeed,
    ball_to_shooting_wrist_ft: distance(frame.ball, selected.wrist),
    angles
  };
}

function pickSidePoints(player, side) {
  const names = SIDE_KEYPOINTS[side] || {};
  return Object.fromEntries(Object.entries(names).map(([key, pointName]) => [key, player[pointName] || null]));
}

function inferShootingSide(frames) {
  const contactDistances = Object.fromEntries(["left", "right"].map((side) => [
    side,
    frames
      .map((frame) => distance(frame.ball, frame.player[SIDE_KEYPOINTS[side].wrist]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
  ]));
  const left = meanOfLowest(contactDistances.left, 5);
  const right = meanOfLowest(contactDistances.right, 5);

  if (!Number.isFinite(left) && !Number.isFinite(right)) {
    return { candidate: null, status: "not_judgable", confidence: 0, left_contact_distance_ft: null, right_contact_distance_ft: null };
  }
  if (!Number.isFinite(left)) {
    return { candidate: "right", status: "inferred", confidence: 0.6, left_contact_distance_ft: null, right_contact_distance_ft: round3(right) };
  }
  if (!Number.isFinite(right)) {
    return { candidate: "left", status: "inferred", confidence: 0.6, left_contact_distance_ft: round3(left), right_contact_distance_ft: null };
  }

  const candidate = left < right ? "left" : "right";
  const relativeGap = Math.abs(left - right) / Math.max(left, right, EPSILON);
  return {
    candidate,
    status: relativeGap >= 0.12 ? "inferred" : "ambiguous_candidate",
    confidence: round3(Math.min(0.9, relativeGap / 0.4)),
    left_contact_distance_ft: round3(left),
    right_contact_distance_ft: round3(right)
  };
}

function buildCoverage(normalizedFrames) {
  const coverage = Object.fromEntries(REQUIRED_POINT_IDS.map((name) => [name, { valid_frames: 0, missing_frames: 0 }]));
  let ballValidFrames = 0;

  for (const frame of normalizedFrames) {
    if (frame.ball) ballValidFrames += 1;
    for (const sourceName of REQUIRED_POINT_IDS) {
      if (frame.player[sourceName]) coverage[sourceName].valid_frames += 1;
      else coverage[sourceName].missing_frames += 1;
    }
  }

  return {
    ball: { valid_frames: ballValidFrames, missing_frames: normalizedFrames.length - ballValidFrames },
    required_points: coverage
  };
}

function buildAngleSummary(frameSeries) {
  const angleIds = Object.keys(frameSeries[0]?.angles || {});
  return Object.fromEntries(angleIds.map((angleId) => {
    const series = frameSeries
      .map((frame) => ({ time_ms: frame.time_ms, value: frame.angles[angleId] }))
      .filter((sample) => Number.isFinite(sample.value));
    const values = series.map((sample) => sample.value);
    const velocities = series
      .slice(1)
      .map((sample, index) => {
        const previous = series[index];
        const deltaMs = sample.time_ms - previous.time_ms;
        return deltaMs > 0
          ? { time_ms: sample.time_ms, value: ((sample.value - previous.value) / deltaMs) * 1000 }
          : null;
      })
      .filter(Boolean);
    const peakVelocity = velocities.reduce((best, sample) => !best || Math.abs(sample.value) > Math.abs(best.value) ? sample : best, null);
    return [angleId, {
      valid_frames: values.length,
      min_deg: values.length ? round3(Math.min(...values)) : null,
      max_deg: values.length ? round3(Math.max(...values)) : null,
      range_of_motion_deg: values.length ? round3(Math.max(...values) - Math.min(...values)) : null,
      peak_angular_velocity_deg_s: peakVelocity ? round3(peakVelocity.value) : null,
      peak_angular_velocity_time_ms: peakVelocity?.time_ms ?? null,
      smoothing: "none_raw_source_geometry"
    }];
  }));
}

function buildReleaseCandidate(frameSeries) {
  const contact = frameSeries
    .map((frame, index) => ({ index, distance: frame.ball_to_shooting_wrist_ft }))
    .filter((sample) => Number.isFinite(sample.distance));
  if (!contact.length) {
    return { status: "not_judgable", reason: "ball_or_shooting_wrist_missing" };
  }

  const closest = contact.reduce((best, sample) => sample.distance < best.distance ? sample : best);
  const threshold = Math.max(0.9, closest.distance + 0.65);
  const candidate = frameSeries.slice(closest.index + 1).find((frame) => (
    Number.isFinite(frame.ball_to_shooting_wrist_ft)
    && Number.isFinite(frame.ball_speed_ft_s)
    && frame.ball_to_shooting_wrist_ft >= threshold
    && frame.ball_speed_ft_s >= 7
  ));

  if (!candidate) {
    return {
      status: "not_detected",
      closest_ball_wrist_frame: frameSeries[closest.index].frame,
      closest_ball_wrist_time_ms: frameSeries[closest.index].time_ms,
      closest_ball_wrist_distance_ft: round3(closest.distance)
    };
  }

  return {
    status: "candidate_not_ground_truth",
    frame: candidate.frame,
    time_ms: candidate.time_ms,
    ball_to_wrist_distance_ft: round3(candidate.ball_to_shooting_wrist_ft),
    ball_speed_ft_s: round3(candidate.ball_speed_ft_s),
    basis: "ball_to_shooting_wrist_distance_increase_and_ball_speed_threshold"
  };
}

function normalizeSide(value) {
  return value === "left" || value === "right" ? value : null;
}

function normalizePoint(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const point = value.slice(0, 3).map(finiteNumber);
  return point.every(Number.isFinite) ? point : null;
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return a.map((value, index) => (value + b[index]) / 2);
}

function angleAt(a, vertex, c) {
  if (!a || !vertex || !c) return null;
  const first = subtract(a, vertex);
  const second = subtract(c, vertex);
  const denominator = magnitude(first) * magnitude(second);
  if (denominator < EPSILON) return null;
  return degrees(Math.acos(clamp(dot(first, second) / denominator, -1, 1)));
}

function angleFromVertical(from, to) {
  if (!from || !to) return null;
  const vector = subtract(to, from);
  const vectorMagnitude = magnitude(vector);
  if (vectorMagnitude < EPSILON) return null;
  return degrees(Math.acos(clamp(Math.abs(dot(vector, VERTICAL_AXIS)) / vectorMagnitude, -1, 1)));
}

function speedFtPerSecond(previous, current, previousTime, currentTime) {
  const deltaMs = currentTime - previousTime;
  const distanceFt = distance(previous, current);
  if (!Number.isFinite(distanceFt) || deltaMs <= 0) return null;
  return (distanceFt / deltaMs) * 1000;
}

function distance(a, b) {
  if (!a || !b) return null;
  return magnitude(subtract(a, b));
}

function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

function magnitude(vector) {
  return Math.hypot(...vector);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function degrees(radians) {
  return (radians * 180) / Math.PI;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function meanOfLowest(values, count) {
  const selected = values.slice(0, count);
  if (!selected.length) return null;
  return selected.reduce((sum, value) => sum + value, 0) / selected.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}
