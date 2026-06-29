import { buildBallTrajectoryModule } from "./ballTrajectory.mjs";
import { buildMetricsFromInputs } from "./metricsEngine.mjs";
import { buildMatchedScoringDimensions } from "./scoringArchitecture.mjs";

export function buildEvidencePacket(input, knowledgeBase, scoringRegistry = null, creatorAngleMapping = null) {
  const now = new Date().toISOString();
  const shotType = input.shot_type || "定点三分";
  const cameraView = input.camera_view || "side";
  const adapters = input.model_adapter_outputs || {};
  const objectDetection = adapters.object_detection || {};
  const shotSummary = objectDetection.shot_summary || {};
  const primaryShotEvent = Array.isArray(objectDetection.shot_events) ? objectDetection.shot_events[0] : null;
  const ballTrajectory = buildBallTrajectoryModule(objectDetection);
  const modelHealth = input.model_health || {};
  const uploadMetadata = input.uploaded_video?.metadata || {};
  const sampleVideo = input.sample_video || null;
  const fps = Number(adapters.precision_pose?.fps || uploadMetadata.fps || input.observed_fps || input.fps || 60);
  const fpsSource = adapters.precision_pose?.fps
    ? "rtmpose_opencv"
    : uploadMetadata.fps
      ? "upload_metadata"
      : input.fps
        ? "user_input"
        : "fallback";
  const videoDurationMs = Number(uploadMetadata.duration_ms || input.video_duration_ms || 4200);
  const normalizedInput = { ...input, fps, video_duration_ms: videoDurationMs };
  const metricBuild = buildMetricsFromInputs(normalizedInput);
  const browserPoseDiagnostics = input.browser_pose_diagnostics || {};
  const metrics = {
    ...metricBuild.metrics,
    ball_release_angle_deg: Number.isFinite(primaryShotEvent?.release_angle_deg)
      ? primaryShotEvent.release_angle_deg
      : metricBuild.metrics.ball_release_angle_deg,
    ball_path_offset_cm: objectDetection.ball_path_offset_cm ?? metricBuild.metrics.ball_path_offset_cm,
    ball_tracking_confidence: objectDetection.detections?.ball?.confidence ?? metricBuild.metrics.ball_tracking_confidence,
    shot_attempts: Number(shotSummary.attempts || 0),
    shot_makes: Number(shotSummary.made || 0),
    shot_misses: Number(shotSummary.missed || 0),
    shot_result: primaryShotEvent?.judgement || "unknown",
    shot_event_confidence: Number(shotSummary.confidence || primaryShotEvent?.confidence || 0),
    shot_event_source: shotSummary.status || "not_available"
  };

  const registry = knowledgeBase.signal_registry?.signals || [];
  const signalById = new Map(registry.map((signal) => [signal.signal_id, signal]));
  const candidateSignals = [
    makeSignal(signalById, "coordination.ball_lift_lower_body_timing", {
      value: metrics.ball_lift_knee_delta_ms,
      value_label: `${metrics.ball_lift_knee_delta_ms} ms`,
      frame: 128,
      confidence: signalConfidence(0.82, metrics),
      evidence_metric_ids: ["ball_lift_knee_delta_ms"]
    }),
    makeSignal(signalById, "posture.forward_trunk_lean_at_release", {
      value: metrics.trunk_lean_release_deg,
      value_label: `${metrics.trunk_lean_release_deg} deg`,
      frame: 142,
      confidence: signalConfidence(0.78, metrics),
      evidence_metric_ids: ["trunk_lean_release_deg"]
    }),
    makeSignal(signalById, "release.release_angle_context", {
      value: metrics.ball_release_angle_deg,
      value_label: `${metrics.ball_release_angle_deg} deg`,
      frame: 142,
      confidence: signalConfidence(0.74, metrics),
      evidence_metric_ids: ["ball_release_angle_deg"]
    }),
    makeSignal(signalById, "release.low_release_height", {
      value: metrics.release_height_ratio,
      value_label: `${metrics.release_height_ratio}x body height`,
      frame: 142,
      confidence: signalConfidence(0.7, metrics),
      evidence_metric_ids: ["release_height_ratio", "release_height_m"]
    })
  ].filter(Boolean);

  const matchedSignals = candidateSignals.map((signal) => ({
    ...signal,
    source_view: cameraView,
    status: signalStatus(cameraView, signal, metrics),
    view_supported: viewSupportsSignal(cameraView, signal.required_view)
  }));

  const missingEvidence = buildMissingEvidence(cameraView, fps, adapters, metrics, modelHealth);
  const quality = deriveEvidenceQuality({
    cameraView,
    fps,
    metrics,
    matchedSignals,
    missingEvidence,
    modelHealth
  });
  const memorySummary = input.memory_summary || {
    session_count: 0,
    long_term_session_count: 0,
    trend: { metric: "ball_lift_knee_delta_ms", values: [], delta_ms: null, direction: "insufficient_data" },
    next_focus: "建立第一条可信训练基线。"
  };

  const matchedRules = buildMatchedRules(matchedSignals, knowledgeBase);
  const matchedScoringDimensions = buildMatchedScoringDimensions({
    scoringRegistry,
    creatorAngleMapping,
    matchedSignals,
    matchedRules,
    missingEvidence,
    confidence: quality
  });

  return {
    request_id: `cr_${Date.now()}`,
    schema_version: "evidence_packet.v1",
    locale: "zh-CN",
    task: "generate_coach_report",
    session_id: `session_${Date.now()}`,
    generated_at: now,
    user_profile: {
      user_id: input.user_id || "local_user_001",
      dominant_hand: input.dominant_hand || "right",
      skill_level: input.skill_level || "intermediate",
      goal: input.training_goal || "提升三分稳定性",
      injury_notes: []
    },
    session: {
      shot_type: shotType,
      camera_view: cameraView,
      fps,
      fps_source: fpsSource,
      video_duration_ms: videoDurationMs,
      analysis_confidence: quality.overall,
      analysis_mode: metricBuild.source
    },
    video_context: {
      file_name: input.file_name || "local_upload.mp4",
      sample_id: sampleVideo?.id || input.sample_id || null,
      source_type: sampleVideo?.source_type || input.sample_source_type || (input.uploaded_video ? "local_upload" : "unknown"),
      shot_type: shotType,
      camera_view: cameraView,
      fps,
      fps_source: fpsSource,
      detected_metadata: uploadMetadata || null,
      video_duration_ms: videoDurationMs,
      analysis_mode: metricBuild.source
    },
    metrics,
    metric_sources: buildMetricSources(metrics, cameraView, metricBuild.source),
    metric_series: metricBuild.metric_series,
    model_outputs: {
      health: modelHealth,
      fast_pose: {
        engine: "MediaPipe PoseLandmarker",
        runtime: "browser",
        status: fastPoseStatus(metricBuild.source, browserPoseDiagnostics),
        diagnostics: browserPoseDiagnostics,
        note: metricBuild.source === "browser_mediapipe"
          ? "Browser pose landmarks were submitted by the client and used for metric computation."
          : "Browser landmarks were not sufficient; metric computation used RTMPose/MMPose if available, otherwise fallback contract data."
      },
      object_detection: adapters.object_detection || null,
      precision_pose: adapters.precision_pose || null,
      visual_heuristics: {
        source_project: objectDetection.inspired_by?.project || null,
        adapted_signals: objectDetection.inspired_by?.adapted_signals || [],
        note: objectDetection.inspired_by?.note || null
      }
    },
    confidence: {
      pose: metrics.pose_confidence,
      ball_tracking: metrics.ball_tracking_confidence,
      overall: quality.overall,
      max_report_confidence: quality.max_report_confidence,
      degradation_reasons: quality.degradation_reasons
    },
    pipeline_status: {
      video_layer: sampleVideo ? "local_authorized_sample_ready" : input.uploaded_video ? "local_upload_ready" : "no_raw_video_fallback",
      fast_pose_layer: fastPoseStatus(metricBuild.source, browserPoseDiagnostics),
      object_detection_layer: adapters.object_detection?.status || "not_run",
      shot_event_layer: shotSummary.status || "not_available",
      precision_layer: adapters.precision_pose?.status || "not_run",
      metric_layer: metricBuild.source,
      signal_registry_layer: "knowledge_base_linked",
      coach_layer: "deepseek_or_local_fallback",
      memory_layer: "sqlite_sessions",
      diagnosis_policy: "signals_are_candidates_until_rules_and_false_positive_checks_support_them"
    },
    ball_trajectory: ballTrajectory,
    release_motion: metricBuild.release_motion,
    matched_signals: matchedSignals,
    matched_scoring_dimensions: matchedScoringDimensions,
    matched_rules: matchedRules,
    missing_evidence: missingEvidence,
    evidence_quality: quality,
    personalized_plan: buildPersonalizedPlan(memorySummary),
    user_memory: {
      recent_sessions: memorySummary.session_count,
      long_term_sessions: memorySummary.long_term_session_count,
      persistent_pattern: summarizeMemory(memorySummary),
      current_priority: memorySummary.next_focus,
      trend: memorySummary.trend
    }
  };
}

function buildMetricSources(metrics, cameraView, metricSource) {
  return Object.fromEntries(Object.keys(metrics || {}).map((metricId) => [
    metricId,
    {
      source_view: cameraView,
      source_layer: metricSource
    }
  ]));
}

function fastPoseStatus(metricSource, diagnostics = {}) {
  if (metricSource === "browser_mediapipe") return "provided_by_browser";
  if (!diagnostics || Object.keys(diagnostics).length === 0) return "not_called";
  if (diagnostics.failure_reason === "model_not_loaded") return "not_loaded";
  if (diagnostics.failure_reason === "no_video") return "not_called";
  if (diagnostics.failure_reason === "no_landmarks") return "called_no_landmarks";
  if (diagnostics.failure_reason === "less_than_min_required") return "called_insufficient_samples";
  if (diagnostics.called) return "called_not_used";
  return "not_called";
}

function buildMatchedRules(matchedSignals, knowledgeBase) {
  const activeSignalIds = new Set(
    matchedSignals.filter((signal) => signal.status === "candidate").map((signal) => signal.signal_id)
  );
  const signalRegistry = new Map((knowledgeBase.signal_registry?.signals || []).map((signal) => [signal.signal_id, signal]));
  const rules = buildKnowledgeRules(matchedSignals, signalRegistry, knowledgeBase.cards || []);
  if (!rules.length) {
    rules.push({
      rule_id: "kb.rule.evidence.insufficient_context",
      title: "证据不足：仅允许低置信复核建议",
      source: "knowledge_base_policy",
      linked_signal_ids: matchedSignals.map((signal) => signal.signal_id),
      repair_actions: ["补录侧面 60fps", "补录正面 60fps"],
      false_positive_checks: ["缺少必要视角或模型置信度低时，不允许下强诊断。"],
      minimum_signal_support: 1,
      review_only: true
    });
  }

  return rules.map((rule) => {
    const supportingSignals = rule.linked_signal_ids.filter((id) => activeSignalIds.has(id));
    const diagnosisAllowed = !rule.review_only && supportingSignals.length >= rule.minimum_signal_support;
    return {
      ...rule,
      source_views: [...new Set(
        matchedSignals
          .filter((signal) => supportingSignals.includes(signal.signal_id))
          .map((signal) => signal.source_view)
          .filter(Boolean)
      )],
      supporting_signal_ids: supportingSignals,
      status: diagnosisAllowed ? "candidate_rule" : "insufficient_signal_support",
      diagnosis_allowed: diagnosisAllowed,
      confidence_basis: supportingSignals.length
        ? rule.confidence_basis || "规则仅作为候选诊断依据，仍需结合误判边界、视角和长期基线。"
        : "缺少可判断信号，不能作为诊断依据。"
    };
  });
}

function buildKnowledgeRules(matchedSignals, signalRegistry, cards) {
  const activeSignals = matchedSignals.filter((signal) => signal.status === "candidate");
  const rules = [];
  const seen = new Set();

  for (const signal of activeSignals) {
    const registrySignal = signalRegistry.get(signal.signal_id) || {};
    const searchTags = new Set([
      signal.category,
      ...(registrySignal.linked_knowledge_tags || []),
      ...signal.signal_id.split(/[._-]/)
    ]);
    for (const card of cards) {
      if (!isUsableKnowledgeCard(card)) continue;
      const cardTags = new Set([...(card.tags || []), ...(card.motion_focus || []), ...(card.app_modules || [])]);
      const overlap = [...searchTags].filter((tag) => cardTags.has(tag));
      if (!overlap.length) continue;
      const firstRule = (card.diagnosis_rules || []).find(isUsableDiagnosisRule);
      if (!firstRule) continue;
      const key = `${card.id}:${signal.signal_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({
        rule_id: `kb.rule.${sanitizeRuleId(card.id)}.${rules.length + 1}`,
        title: firstRule.then || card.title || signal.name,
        source: "knowledge_base",
        source_card_id: card.id,
        source_url: card.source_url || null,
        linked_signal_ids: [signal.signal_id],
        repair_actions: usableRepairActions(card.repair_actions),
        false_positive_checks: [
          ...(card.false_positives || []),
          ...(signal.false_positive_checks || [])
        ].filter(Boolean).slice(0, 4),
        minimum_signal_support: 1,
        confidence_basis: firstRule.confidence_basis || "来自 knowledge_base.json 的诊断规则匹配。"
      });
      break;
    }
  }

  return rules.slice(0, 8);
}

function isUsableKnowledgeCard(card) {
  if (!card || !Array.isArray(card.diagnosis_rules)) return false;
  const observable = card.observable_signals || [];
  const repairs = card.repair_actions || [];
  if (observable.length && observable.every((item) => item === "not_stated")) return false;
  if (repairs.length && repairs.every((item) => item.drill === "not_stated")) return false;
  return card.diagnosis_rules.some(isUsableDiagnosisRule);
}

function isUsableDiagnosisRule(rule) {
  if (!rule || typeof rule !== "object") return false;
  const text = `${rule.if || ""} ${rule.then || ""} ${rule.repair || ""}`;
  return text && !/无法提取|不包含投篮技术|not_stated/i.test(text);
}

function usableRepairActions(actions = []) {
  return actions
    .filter((action) => action && action.drill && action.drill !== "not_stated")
    .map((action) => ({
      drill: action.drill,
      dosage: action.dosage || "按质量完成",
      cue: action.cue || "",
      success_metric: action.success_metric || ""
    }))
    .slice(0, 3);
}

function sanitizeRuleId(value) {
  return String(value || "card")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeSignal(signalById, signalId, evidence) {
  const signal = signalById.get(signalId);
  if (!signal) return null;
  return {
    signal_id: signal.signal_id,
    name: signal.name,
    category: signal.category,
    required_view: signal.required_view,
    value: evidence.value,
    value_label: evidence.value_label,
    threshold: signal.soft_thresholds?.[1]?.condition || signal.soft_thresholds?.[0]?.condition || "contextual",
    frame: evidence.frame,
    confidence: evidence.confidence,
    evidence_metric_ids: evidence.evidence_metric_ids,
    diagnostic_use: signal.diagnostic_use,
    not_a_diagnosis_by_itself: signal.not_a_diagnosis_by_itself,
    false_positive_checks: signal.false_positive_checks?.slice(0, 2) || []
  };
}

function signalConfidence(baseConfidence, metrics) {
  const pose = Number(metrics.pose_confidence || 0);
  const adjusted = pose ? Math.min(baseConfidence, pose + 0.12) : baseConfidence;
  return Math.max(0.05, Number(adjusted.toFixed(2)));
}

function viewSupportsSignal(cameraView, requiredViews = []) {
  return requiredViews.includes(cameraView);
}

function signalStatus(cameraView, signal, metrics = {}) {
  if (Array.isArray(signal.required_view) && signal.required_view.length && !signal.required_view.includes(cameraView)) {
    return "missing_required_view";
  }
  if (Number(metrics.pose_confidence || 0) < 0.65) return "low_confidence";
  const requiresBallTracking = /ball_lift|release_angle/i.test(signal.signal_id);
  if (requiresBallTracking && Number(metrics.ball_tracking_confidence || 0) < 0.3) return "low_confidence";
  if (Number(signal.confidence || 0) < 0.5) return "low_confidence";
  return "candidate";
}

function buildMissingEvidence(cameraView, fps, adapters = {}, metrics = {}, modelHealth = {}) {
  const missing = [];
  if (cameraView !== "front") {
    missing.push({
      type: "view",
      value: "front",
      impact: "不能可靠判断肘外翻、左右力线和横向球路偏移。"
    });
  }
  if (cameraView !== "side") {
    missing.push({
      type: "view",
      value: "side",
      impact: "不能可靠判断起球时序、躯干前倾和释放高度。"
    });
  }
  if (fps < 60) {
    missing.push({
      type: "frame_rate",
      value: "60fps",
      impact: "起球时序和出手瞬间指标误差会变大。"
    });
  }
  if (!metrics.ball_tracking_confidence) {
    missing.push({
      type: "model",
      value: "YOLO ball/rim detection",
      impact: `球路偏移、篮筐参考和出手角需要降级；当前 YOLO 状态：${adapters.object_detection?.status || "not_run"}。`
    });
  }
  if (adapters.object_detection?.status === "provided_by_adapter" && !metrics.shot_event_confidence) {
    missing.push({
      type: "shot_event",
      value: "ball-over-rim sequence",
      impact: "已运行 YOLO，但没有同时捕捉到足够的篮球过筐序列；命中/未中只能留给人工反馈或复测。"
    });
  }
  for (const [name, health] of Object.entries(modelHealth)) {
    if (health && health.ok === false) {
      missing.push({
        type: "model_health",
        value: name,
        impact: `${health.engine || name} 安装/依赖检测未通过：${(health.missing || []).join(", ") || health.status || "unknown"}。`
      });
    }
  }
  return missing;
}

function deriveEvidenceQuality({ fps, metrics, matchedSignals, missingEvidence, modelHealth = {} }) {
  const degradationReasons = [];
  let score = Number(metrics.pose_confidence || 0.58);

  if (fps < 60) {
    degradationReasons.push("frame_rate_below_60fps");
  }
  if (metrics.pose_confidence < 0.75) {
    degradationReasons.push("low_pose_confidence");
  }
  if (metrics.ball_tracking_confidence < 0.7) {
    degradationReasons.push("low_ball_tracking_confidence");
  }
  if (metrics.ball_tracking_confidence === 0) {
    degradationReasons.push("object_detection_not_available");
  }
  if (metrics.shot_event_source === "insufficient_evidence") {
    degradationReasons.push("shot_event_insufficient_evidence");
  }
  if (missingEvidence.length) {
    degradationReasons.push("missing_required_view_or_context");
  }
  if (missingEvidence.some((item) => item.type === "view")) {
    score = Math.min(score, 0.64);
  }
  if (fps < 60) {
    score = Math.min(score, 0.74);
  }
  if (matchedSignals.some((signal) => signal.status === "low_confidence")) {
    score -= 0.08;
    degradationReasons.push("some_signals_low_confidence");
  }
  if (matchedSignals.some((signal) => signal.status === "missing_required_view")) {
    degradationReasons.push("some_signals_missing_required_view");
  }
  if (Object.values(modelHealth).some((health) => health?.ok === false)) {
    score -= 0.12;
    degradationReasons.push("model_health_degraded");
  }

  const overall = Math.max(0.35, Number(score.toFixed(2)));
  return {
    overall,
    max_report_confidence: overall >= 0.82 ? "high" : overall >= 0.65 ? "medium" : "low",
    degradation_reasons: degradationReasons,
    memory_write_policy: "user_selected"
  };
}

function buildPersonalizedPlan(memorySummary) {
  return {
    next_training_goal: memorySummary.next_focus || "建立稳定投篮基线。",
    dosage: [
      { drill: "无球蹬地-起球同步", volume: "3 组 x 20 次", rest: "每组 45 秒" },
      { drill: "近距离定点节奏投", volume: "5 组 x 10 球", rest: "每组 60 秒" }
    ],
    retest_metrics: [
      "ball_lift_knee_delta_ms",
      "trunk_lean_release_deg",
      "release_height_ratio",
      "ball_path_offset_cm"
    ],
    progression_rule: "只有当连续两次 long_term session 的核心信号置信度 >= 0.65 时，才更新长期训练重点。"
  };
}

function summarizeMemory(memorySummary) {
  if (!memorySummary.long_term_session_count) {
    return "暂无足够高置信长期记忆，本次先建立个人基线。";
  }
  const delta = memorySummary.trend?.delta_ms;
  if (typeof delta === "number") {
    const direction = delta < 0 ? "下降" : "上升";
    return `长期记忆显示起球-下肢时序差累计${direction} ${Math.abs(delta)} ms。`;
  }
  return `已有 ${memorySummary.long_term_session_count} 次高置信长期训练记录。`;
}
