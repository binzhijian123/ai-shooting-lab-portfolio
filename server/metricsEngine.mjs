const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28
};

const COCO = {
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16
};

export function buildMetricsFromInputs(input) {
  const samples = normalizePoseSamples(input.pose_samples);
  const side = input.dominant_hand === "left" ? "left" : "right";
  const browserComputed = samples.map((sample) => computePoseRow(sample, side, LM)).filter(Boolean);
  if (browserComputed.length >= 6) {
    return buildMetricResult({
      source: "browser_mediapipe",
      computed: browserComputed,
      input
    });
  }

  const precisionSamples = normalizePrecisionPoseSamples(input.model_adapter_outputs?.precision_pose);
  const precisionComputed = precisionSamples.map((sample) => computePoseRow(sample, side, LM)).filter(Boolean);
  if (precisionComputed.length >= 3) {
    return buildMetricResult({
      source: "rtmpose_mmpose",
      computed: precisionComputed,
      input
    });
  }

  return {
    source: "fallback_contract",
    metrics: defaultMetrics(input),
    metric_series: buildDefaultMetricSeries(),
    release_motion: buildDefaultReleaseMotion(input)
  };
}

function buildMetricResult({ source, computed, input }) {
  const phase = inferShootingPhases(computed);
  const release = phase.release;
  const minKnee = phase.lowerBodyLoad;
  const kneeStart = phase.lowerBodyTimingReference;
  const liftStart = phase.liftStart;
  const duration = Number(input.video_duration_ms || computed.at(-1)?.time_ms || 4200);
  const fps = Number(input.fps || 60);
  const ballLiftDelta = Math.round(liftStart.time_ms - kneeStart.time_ms);
  const avgPoseConfidence = average(computed.map((row) => row.pose_confidence));
  const metrics = {
    ball_lift_knee_delta_ms: clamp(Math.abs(ballLiftDelta), 0, Math.round(duration)),
    trunk_lean_release_deg: round1(release.trunk_lean_deg),
    knee_angle_min_deg: round1(minKnee.knee_angle_deg),
    elbow_angle_release_deg: round1(release.elbow_angle_deg),
    release_height_ratio: round2(release.release_height_ratio),
    release_height_m: round2(release.release_height_ratio * 1.88),
    ball_release_angle_deg: estimateReleaseAngle(computed, release),
    ball_path_offset_cm: null,
    ball_lift_time_s: round2(liftStart.time_ms / 1000),
    center_of_mass_forward_drift_cm: estimateForwardDriftCm(computed),
    forward_drift_cm: estimateForwardDriftCm(computed),
    shoulder_elbow_wrist_alignment_error_deg: round1(Math.abs(180 - release.elbow_angle_deg)),
    pose_confidence: round2(avgPoseConfidence),
    ball_tracking_confidence: 0,
    frame_rate_observed: fps
  };

  return {
    source,
    metrics,
    metric_series: computed.map((row) => ({
      frame: Math.round((row.time_ms / 1000) * fps),
      time_ms: Math.round(row.time_ms),
      knee_angle_deg: round1(row.knee_angle_deg),
      elbow_angle_deg: round1(row.elbow_angle_deg),
      trunk_lean_deg: round1(row.trunk_lean_deg),
      ball_height_ratio: round2(row.release_height_ratio),
      pose_confidence: round2(row.pose_confidence)
    })),
    release_motion: buildReleaseMotion({
      computed,
      source,
      input,
      metrics,
      fps,
      release,
      minKnee,
      kneeStart,
      liftStart,
      phase
    })
  };
}

function inferShootingPhases(computed) {
  const rows = [...computed].sort((a, b) => a.time_ms - b.time_ms);
  const release = selectReleaseRow(rows);
  const releaseTime = release.time_ms;
  const shotWindowStartMs = Math.max(rows[0].time_ms, releaseTime - 1600);
  const shotWindowEndMs = Math.min(rows.at(-1).time_ms, releaseTime + 250);
  const shotWindowRows = rows.filter((row) => row.time_ms >= shotWindowStartMs && row.time_ms <= shotWindowEndMs);
  const preReleaseRows = shotWindowRows.filter((row) => row.time_ms <= releaseTime);
  const liftStart = findLiftStart(preReleaseRows, release);
  const lowerBodyRows = preReleaseRows.filter((row) =>
    row.time_ms >= liftStart.time_ms - 900 &&
    row.time_ms <= liftStart.time_ms + 180
  );
  const lowerBodyLoad = minBy(lowerBodyRows.length ? lowerBodyRows : preReleaseRows, (row) => row.knee_angle_deg);
  const lowerBodyTimingReference = firstAfter(
    preReleaseRows,
    (row) => row.time_ms >= lowerBodyLoad.time_ms && row.knee_angle_deg > lowerBodyLoad.knee_angle_deg + 4
  ) || lowerBodyLoad;
  const setPoint = findSetPoint(preReleaseRows, liftStart, release);
  return {
    rows,
    release,
    liftStart,
    setPoint,
    lowerBodyLoad,
    lowerBodyTimingReference,
    shotWindowRows,
    shotWindowStart: shotWindowRows[0] || rows[0],
    shotWindowEnd: shotWindowRows.at(-1) || rows.at(-1)
  };
}

function selectReleaseRow(rows) {
  if (rows.length <= 2) return minBy(rows, (row) => row.wrist_y);
  return maxBy(rows, (row, index) => {
    const previous = rows.filter((item) =>
      item.time_ms < row.time_ms &&
      item.time_ms >= row.time_ms - 1600
    );
    const priorLowWrist = previous.length ? Math.max(...previous.map((item) => item.wrist_y)) : row.wrist_y;
    const priorLowHeight = previous.length ? Math.min(...previous.map((item) => item.release_height_ratio)) : row.release_height_ratio;
    const wristRise = Math.max(0, priorLowWrist - row.wrist_y);
    const heightGain = Math.max(0, row.release_height_ratio - priorLowHeight);
    const elbowExtension = clamp(row.elbow_angle_deg / 180, 0, 1);
    const lateBias = rows.length > 1 ? index / (rows.length - 1) : 0;
    return wristRise * 3.2 + heightGain * 2.4 + elbowExtension * 0.28 + lateBias * 0.18;
  });
}

function findLiftStart(preReleaseRows, release) {
  const candidates = preReleaseRows.filter((row) =>
    row.time_ms <= release.time_ms &&
    row.time_ms >= release.time_ms - 1500
  );
  if (candidates.length <= 1) return candidates[0] || release;
  const viable = candidates.filter((row) =>
    release.wrist_y < row.wrist_y - 0.035 ||
    release.release_height_ratio > row.release_height_ratio + 0.1
  );
  return maxBy(viable.length ? viable : candidates, (row) => row.wrist_y);
}

function findSetPoint(preReleaseRows, liftStart, release) {
  const pathRows = preReleaseRows.filter((row) =>
    row.time_ms >= liftStart.time_ms &&
    row.time_ms <= release.time_ms
  );
  if (pathRows.length < 3) return null;
  const wristTravel = liftStart.wrist_y - release.wrist_y;
  if (wristTravel <= 0.025) return null;
  return pathRows.find((row) => {
    if (row === liftStart || row === release) return false;
    const progress = (liftStart.wrist_y - row.wrist_y) / wristTravel;
    return progress >= 0.7;
  }) || pathRows.at(-2);
}

function computePoseRow(sample, side, landmarkMap) {
  const landmarks = sample.landmarks;
  const shoulder = landmarks[landmarkMap[`${side}Shoulder`]];
  const elbow = landmarks[landmarkMap[`${side}Elbow`]];
  const wrist = landmarks[landmarkMap[`${side}Wrist`]];
  const hip = landmarks[landmarkMap[`${side}Hip`]];
  const knee = landmarks[landmarkMap[`${side}Knee`]];
  const ankle = landmarks[landmarkMap[`${side}Ankle`]];
  if (![shoulder, elbow, wrist, hip, knee, ankle].every(Boolean)) return null;

  const bodyHeight = Math.max(0.001, distance(shoulder, ankle));
  const releaseHeightRatio = clamp((ankle.y - wrist.y) / bodyHeight, 0.2, 1.8);
  const trunkLeanDeg = Math.abs(angleFromVertical(shoulder, hip));

  return {
    time_ms: Number(sample.time_ms || 0),
    shoulder_x: shoulder.x,
    shoulder_y: shoulder.y,
    elbow_x: elbow.x,
    elbow_y: elbow.y,
    wrist_x: wrist.x,
    wrist_y: wrist.y,
    hip_x: hip.x,
    hip_y: hip.y,
    knee_x: knee.x,
    knee_y: knee.y,
    ankle_x: ankle.x,
    ankle_y: ankle.y,
    knee_angle_deg: angle(hip, knee, ankle),
    elbow_angle_deg: angle(shoulder, elbow, wrist),
    trunk_lean_deg: trunkLeanDeg,
    release_height_ratio: releaseHeightRatio,
    pose_confidence: average([shoulder, elbow, wrist, hip, knee, ankle].map((point) => point.visibility ?? 0.8))
  };
}

function normalizePoseSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return samples
    .filter((sample) => Array.isArray(sample.landmarks) && sample.landmarks.length >= 29)
    .map((sample) => ({
      time_ms: Number(sample.time_ms || 0),
      landmarks: sample.landmarks.map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
        z: Number(point.z || 0),
        visibility: Number(point.visibility ?? point.presence ?? 0.8)
      }))
    }))
    .sort((a, b) => a.time_ms - b.time_ms);
}

function normalizePrecisionPoseSamples(precisionPose) {
  if (!precisionPose || precisionPose.status !== "provided_by_adapter") return [];
  const width = Number(precisionPose.image_width || 0);
  const height = Number(precisionPose.image_height || 0);
  const fps = Number(precisionPose.fps || 60);
  if (!width || !height || !Array.isArray(precisionPose.pose_series)) return [];

  return precisionPose.pose_series
    .filter((sample) => Array.isArray(sample.keypoints) && sample.keypoints.length >= 17)
    .map((sample) => {
      const scores = Array.isArray(sample.keypoint_scores) ? sample.keypoint_scores : [];
      const landmarks = new Array(29).fill(null);
      for (const [name, cocoIndex] of Object.entries(COCO)) {
        const point = sample.keypoints[cocoIndex];
        if (!Array.isArray(point)) continue;
        landmarks[LM[name]] = {
          x: Number(point[0]) / width,
          y: Number(point[1]) / height,
          z: 0,
          visibility: Number(scores[cocoIndex] ?? precisionPose.confidence ?? 0)
        };
      }
      return {
        time_ms: Number(sample.time_ms ?? ((sample.frame_index || 0) / fps) * 1000),
        landmarks
      };
    })
    .sort((a, b) => a.time_ms - b.time_ms);
}

function defaultMetrics(input) {
  return {
    ball_lift_knee_delta_ms: 160,
    trunk_lean_release_deg: 5.4,
    knee_angle_min_deg: 98,
    elbow_angle_release_deg: 92,
    release_height_ratio: 1.13,
    release_height_m: 2.13,
    ball_release_angle_deg: 46,
    ball_path_offset_cm: 8,
    ball_lift_time_s: 0.68,
    center_of_mass_forward_drift_cm: 12,
    forward_drift_cm: 12,
    shoulder_elbow_wrist_alignment_error_deg: 88,
    pose_confidence: input.browser_pose_detected ? 0.74 : 0.58,
    ball_tracking_confidence: 0
  };
}

function buildReleaseMotion({ computed, source, input, metrics, fps, release, minKnee, kneeStart, liftStart, phase }) {
  const releaseIndex = computed.indexOf(release);
  const liftIndex = Math.max(0, computed.indexOf(liftStart));
  const windowEnd = Math.max(releaseIndex, liftIndex);
  const pathRows = computed.slice(liftIndex, windowEnd + 1);
  const wristPath = (pathRows.length ? pathRows : [liftStart, release])
    .filter(Boolean)
    .map((row) => ({
      frame: frameFor(row, fps),
      time_ms: Math.round(row.time_ms),
      x: round3(row.wrist_x),
      y: round3(row.wrist_y),
      height_ratio: round2(row.release_height_ratio),
      confidence: round2(row.pose_confidence)
    }));
  const phaseReliable = wristPath.length >= 3 && Boolean(phase?.setPoint) && (phase?.shotWindowRows || []).length >= 4;
  const confidence = round2(Math.min(Number(metrics.pose_confidence || 0), phaseReliable ? 0.86 : 0.62));
  const missingEvidence = [];
  if (wristPath.length < 3) {
    missingEvidence.push({
      reason: "not_enough_wrist_path_points",
      message: "起球到出手的手腕路径点不足，不能稳定判断发力流畅度。"
    });
  }
  if (!phase?.setPoint) {
    missingEvidence.push({
      reason: "set_point_not_observed",
      message: "举球到位阶段缺少独立关键点，不能把中间帧硬标为举球到位。"
    });
  }
  if ((phase?.shotWindowRows || []).length < 4) {
    missingEvidence.push({
      reason: "not_enough_shot_window_points",
      message: "投篮窗口内姿态点不足，准备动作、下蹲和举球阶段只能作为候选参考。"
    });
  }
  if (confidence < 0.6) {
    missingEvidence.push({
      reason: "low_pose_confidence",
      message: "人体关键点置信度偏低，出手姿态只能作为候选观察。"
    });
  }

  return {
    schema_version: "release_motion.v1",
    source_contract: "pose_keypoint_release_motion_not_ball_flight",
    interpretation_policy: "human_pose_motion_slice_only_no_airborne_ball_tracking",
    status: confidence >= 0.7 && phaseReliable ? "candidate" : "low_confidence",
    confidence,
    diagnosis_allowed: confidence >= 0.7 && phaseReliable,
    phase_frames: {
      shot_window_start: phaseFrame(phase?.shotWindowStart, fps),
      lower_body_load: phaseFrame(minKnee || kneeStart, fps),
      lower_body_timing_reference: phaseFrame(kneeStart, fps),
      lift_start: phaseFrame(liftStart, fps),
      set_point: phaseFrame(phase?.setPoint, fps),
      shot_window_end: phaseFrame(phase?.shotWindowEnd, fps),
      release: phaseFrame(release, fps)
    },
    metrics: {
      lift_lower_body_delta_ms: metrics.ball_lift_knee_delta_ms,
      trunk_lean_release_deg: metrics.trunk_lean_release_deg,
      elbow_angle_release_deg: metrics.elbow_angle_release_deg,
      release_height_ratio: metrics.release_height_ratio,
      shoulder_elbow_wrist_alignment_error_deg: metrics.shoulder_elbow_wrist_alignment_error_deg,
      wrist_path_point_count: wristPath.length
    },
    wrist_path: wristPath,
    summary: {
      timing: metrics.ball_lift_knee_delta_ms > 120 ? "起球和下肢发力存在候选时序差。" : "起球和下肢发力时序暂未显示明显错位。",
      posture: metrics.trunk_lean_release_deg > 5 ? "出手附近躯干前倾偏明显，需要结合正面/侧面复核。" : "出手附近躯干前倾暂未明显超出观察阈值。",
      release: "该切片只看持球到出手瞬间的人体姿态与手腕路径，不追踪空中球路或命中结果。"
    },
    missing_evidence: missingEvidence,
    metric_ids: [
      "ball_lift_knee_delta_ms",
      "trunk_lean_release_deg",
      "elbow_angle_release_deg",
      "release_height_ratio",
      "shoulder_elbow_wrist_alignment_error_deg"
    ],
    source: {
      metric_source: source,
      dominant_hand: input.dominant_hand === "left" ? "left" : "right",
      fps
    }
  };
}

function buildDefaultReleaseMotion(input = {}) {
  return {
    schema_version: "release_motion.v1",
    source_contract: "pose_keypoint_release_motion_not_ball_flight",
    interpretation_policy: "human_pose_motion_slice_only_no_airborne_ball_tracking",
    status: "fallback",
    confidence: input.browser_pose_detected ? 0.58 : 0.42,
    diagnosis_allowed: false,
    phase_frames: {
      shot_window_start: { frame: 70, time_ms: 1167 },
      lower_body_load: { frame: 98, time_ms: 1633 },
      lower_body_timing_reference: { frame: 98, time_ms: 1633 },
      lift_start: { frame: 128, time_ms: 2133 },
      set_point: { frame: 128, time_ms: 2133 },
      shot_window_end: { frame: 142, time_ms: 2367 },
      release: { frame: 142, time_ms: 2367 }
    },
    metrics: {
      lift_lower_body_delta_ms: 160,
      trunk_lean_release_deg: 5.4,
      elbow_angle_release_deg: 92,
      release_height_ratio: 1.13,
      shoulder_elbow_wrist_alignment_error_deg: 88,
      wrist_path_point_count: 4
    },
    wrist_path: [
      { frame: 98, time_ms: 1633, x: 0.55, y: 0.62, height_ratio: 0.61, confidence: 0.58 },
      { frame: 128, time_ms: 2133, x: 0.54, y: 0.45, height_ratio: 0.91, confidence: 0.58 },
      { frame: 142, time_ms: 2367, x: 0.53, y: 0.33, height_ratio: 1.13, confidence: 0.58 }
    ],
    summary: {
      timing: "当前为 fallback 合同样例，不作为真实诊断。",
      posture: "需要真实姿态关键点后才能判断躯干和出手姿态。",
      release: "该切片只看持球到出手瞬间的人体姿态与手腕路径，不追踪空中球路或命中结果。"
    },
    missing_evidence: [
      {
        reason: "fallback_contract",
        message: "没有足够姿态关键点，当前只返回前端合同占位。"
      }
    ],
    metric_ids: [
      "ball_lift_knee_delta_ms",
      "trunk_lean_release_deg",
      "elbow_angle_release_deg",
      "release_height_ratio",
      "shoulder_elbow_wrist_alignment_error_deg"
    ],
    source: {
      metric_source: "fallback_contract",
      dominant_hand: input.dominant_hand === "left" ? "left" : "right",
      fps: Number(input.fps || 60)
    }
  };
}

export function buildDefaultMetricSeries() {
  return [
    { frame: 70, time_ms: 1167, knee_angle_deg: 142, elbow_angle_deg: 74, trunk_lean_deg: 1.1, ball_height_ratio: 0.56, pose_confidence: 0.58 },
    { frame: 98, time_ms: 1633, knee_angle_deg: 98, elbow_angle_deg: 78, trunk_lean_deg: 2.4, ball_height_ratio: 0.61, pose_confidence: 0.58 },
    { frame: 128, time_ms: 2133, knee_angle_deg: 112, elbow_angle_deg: 88, trunk_lean_deg: 3.2, ball_height_ratio: 0.91, pose_confidence: 0.58 },
    { frame: 142, time_ms: 2367, knee_angle_deg: 166, elbow_angle_deg: 92, trunk_lean_deg: 5.4, ball_height_ratio: 1.13, pose_confidence: 0.58 },
    { frame: 180, time_ms: 3000, knee_angle_deg: 154, elbow_angle_deg: 104, trunk_lean_deg: 2.7, ball_height_ratio: 0.88, pose_confidence: 0.58 }
  ];
}

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return (Math.acos(clamp(dot / Math.max(mag, 0.000001), -1, 1)) * 180) / Math.PI;
}

function angleFromVertical(top, bottom) {
  const dx = top.x - bottom.x;
  const dy = bottom.y - top.y;
  return (Math.atan2(dx, Math.max(dy, 0.000001)) * 180) / Math.PI;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function estimateReleaseAngle(computed, release) {
  const index = computed.indexOf(release);
  const prev = computed[Math.max(0, index - 1)] || release;
  const dy = Math.max(0.001, prev.wrist_y - release.wrist_y);
  const dx = Math.abs(release.hip_x - prev.hip_x) + 0.001;
  return round1(clamp((Math.atan2(dy, dx) * 180) / Math.PI, 30, 62));
}

function estimateForwardDriftCm(computed) {
  const first = computed[0];
  const last = computed.at(-1);
  return round1(Math.abs(last.hip_x - first.hip_x) * 180);
}

function phaseFrame(row, fps) {
  if (!row) return null;
  return {
    frame: frameFor(row, fps),
    time_ms: Math.round(row.time_ms)
  };
}

function frameFor(row, fps) {
  return Math.round((Number(row.time_ms || 0) / 1000) * Math.max(1, Number(fps || 60)));
}

function firstAfter(items, predicate) {
  return items.find(predicate) || null;
}

function minBy(items, score) {
  return items.reduce((best, item) => (score(item) < score(best) ? item : best), items[0]);
}

function maxBy(items, score) {
  let best = items[0];
  let bestScore = score(best, 0);
  for (let index = 1; index < items.length; index += 1) {
    const value = score(items[index], index);
    if (value > bestScore) {
      best = items[index];
      bestScore = value;
    }
  }
  return best;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
