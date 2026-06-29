export function buildReportContracts(evidencePacket, coachReport, meta = {}) {
  return {
    player_report: buildPlayerReport(evidencePacket, coachReport),
    lab_report: buildLabReport(evidencePacket, coachReport, meta)
  };
}

export function normalizeEvidencePacketForReport(packet) {
  if (packet?.schema_version !== "multi_angle_evidence_packet.v1") return packet;
  const views = Object.values(packet.views || {});
  const primary = views.find((item) => item?.session?.camera_view === "side")
    || views.find((item) => item?.session?.camera_view === "front")
    || views[0]
    || {};
  const metrics = {};
  const metricSources = {};
  for (const metric of packet.merged?.metrics || []) {
    if (!metric.metric_id) continue;
    metrics[metric.metric_id] = metric.value;
    metricSources[metric.metric_id] = {
      source_view: metric.source_view,
      source_layer: metric.source_layer,
      packet_session_id: metric.packet_session_id
    };
  }
  const syncMissingEvidence = (packet.sync_assessment?.risk_factors || []).map((factor) => ({
    type: "sync_risk",
    value: factor.factor_id,
    impact: factor.user_impact || factor.mitigation || "当前多角度输入只能近似合并。"
  }));
  return {
    ...primary,
    schema_version: packet.schema_version,
    session_id: packet.session_group_id,
    session: {
      ...(primary.session || {}),
      shot_type: packet.shot_type,
      camera_view: (packet.present_views || []).join("+") || primary.session?.camera_view || "unknown",
      analysis_mode: "multi_angle_approximate_grouping",
      view_count: packet.view_count
    },
    metrics,
    metric_sources: metricSources,
    matched_signals: packet.merged?.matched_signals || [],
    matched_rules: packet.merged?.matched_rules || [],
    missing_evidence: [
      ...(packet.merged?.missing_evidence || []),
      ...syncMissingEvidence
    ],
    confidence: {
      ...(primary.confidence || {}),
      ...(packet.merged?.confidence || {}),
      degradation_reasons: [
        ...(primary.confidence?.degradation_reasons || []),
        "multi_angle_approximate_sync_not_frame_accurate",
        ...(packet.view_quality_assessment?.status && packet.view_quality_assessment.status !== "metadata_ready" ? ["multi_angle_view_quality_review_required"] : []),
        ...((packet.missing_views || []).length ? ["multi_angle_missing_required_view"] : [])
      ]
    },
    metric_series: primary.metric_series || [],
    model_outputs: primary.model_outputs || {},
    pipeline_status: {
      ...(primary.pipeline_status || {}),
      multi_angle_layer: "multi_angle_evidence_packet.v1",
      sync_layer: packet.sync_assessment?.precision || "not_frame_accurate",
      view_quality_layer: packet.view_quality_assessment?.schema_version || "view_quality_assessment.v1"
    },
    personalized_plan: primary.personalized_plan || {},
    user_memory: primary.user_memory || {},
    multi_angle_context: {
      schema_version: packet.schema_version,
      session_group_id: packet.session_group_id,
      present_views: packet.present_views || [],
      missing_views: packet.missing_views || [],
      sync_policy: packet.sync_policy,
      diagnosis_policy: packet.diagnosis_policy,
      sync_assessment: packet.sync_assessment || null,
      view_quality_assessment: packet.view_quality_assessment || null
    }
  };
}

function buildPlayerReport(evidence, report = {}) {
  const diagnosis = report.primary_diagnosis || {};
  const confidence = diagnosis.confidence || evidence.confidence?.max_report_confidence || "low";
  const missingEvidence = evidence.missing_evidence || [];
  return {
    schema_version: "player_report.v1",
    session_id: evidence.session_id,
    summary: report.summary || "本次证据不足，请按复测要求补录视频。",
    confidence,
    analysis_status: playerAnalysisStatus(evidence),
    primary_issue: {
      title: diagnosis.title || "证据不足",
      why_it_matters: (diagnosis.uncertainties || missingEvidence.map((item) => item.impact))[0] || "当前证据不足，不能下强诊断。",
      confidence,
      evidence_refs: evidenceRefs(evidence, diagnosis.evidence || [])
    },
    what_to_do_next: (report.next_drills || []).map((drill) => ({
      drill: drill.name,
      dosage: drill.dosage,
      success_metric: drill.success_metric,
      rule_id: firstAllowedRule(evidence)?.rule_id || null
    })),
    next_video_request: {
      view: nextViewRequest(evidence, report),
      fps: 60,
      reason: report.follow_up?.next_video_request || firstMissingImpact(missingEvidence)
    },
    uncertainties: [
      ...missingEvidence.map((item) => ({
        missing_evidence: `${item.type}:${item.value}`,
        impact: item.impact
      })),
      ...(diagnosis.uncertainties || []).map((item) => ({
        missing_evidence: "coach_uncertainty",
        impact: item
      }))
    ]
  };
}

function buildLabReport(evidence, report = {}, meta = {}) {
  const diagnosis = report.primary_diagnosis || {};
  return {
    schema_version: "lab_report.v1",
    session_id: evidence.session_id,
    evidence_packet_version: evidence.schema_version,
    input_context: {
      shot_type: evidence.session?.shot_type,
      camera_view: evidence.session?.camera_view,
      fps: evidence.session?.fps,
      video_duration_ms: evidence.session?.video_duration_ms,
      analysis_mode: evidence.session?.analysis_mode
    },
    model_status: {
      fast_pose: evidence.model_outputs?.fast_pose?.status || evidence.pipeline_status?.fast_pose_layer,
      precision_pose: evidence.model_outputs?.precision_pose?.status || evidence.pipeline_status?.precision_layer,
      object_detection: evidence.model_outputs?.object_detection?.status || evidence.pipeline_status?.object_detection_layer,
      shot_event: evidence.pipeline_status?.shot_event_layer,
      multi_angle: evidence.pipeline_status?.multi_angle_layer || null,
      sync: evidence.pipeline_status?.sync_layer || null
    },
    metrics: Object.entries(evidence.metrics || {}).map(([metric_id, value]) => ({
      metric_id,
      value,
      source: evidence.session?.analysis_mode,
      confidence: metricConfidence(metric_id, evidence)
    })),
    signals: evidence.matched_signals || [],
    matched_rules: evidence.matched_rules || [],
    missing_evidence: evidence.missing_evidence || [],
    multi_angle_context: evidence.multi_angle_context || null,
    diagnosis: {
      title: diagnosis.title || "证据不足",
      confidence: diagnosis.confidence || evidence.confidence?.max_report_confidence || "low",
      evidence_refs: evidenceRefs(evidence, diagnosis.evidence || [])
    },
    debug_notes: {
      report_mode: meta.mode || "unknown",
      degradation_reasons: evidence.confidence?.degradation_reasons || [],
      adapter_errors: adapterErrors(evidence),
      report_validation_errors: meta.validation_errors || []
    }
  };
}

function evidenceRefs(evidence, items = []) {
  return items.map((item) => {
    const signal = signalForSource(evidence, item.source);
    return {
      signal_id: signal?.signal_id || (isSignalSource(evidence, item.source) ? item.source : null),
      metric_id: item.metric_id || signal?.evidence_metric_ids?.[0] || null,
      frame: typeof item.frame === "number" ? item.frame : null,
      rule_id: item.rule_id || (isRuleSource(evidence, item.source) ? item.source : null),
      value: item.value || null,
      missing_evidence: null
    };
  });
}

function playerAnalysisStatus(evidence) {
  const hasCandidateSignal = (evidence.matched_signals || []).some((signal) => signal.status === "candidate");
  const hasAllowedRule = (evidence.matched_rules || []).some((rule) => rule.diagnosis_allowed !== false);
  if (!hasCandidateSignal || !hasAllowedRule) return "review_only";
  if (evidence.confidence?.max_report_confidence === "low") return "review_only";
  return "diagnosable";
}

function signalForSource(evidence, source) {
  return (evidence.matched_signals || []).find((signal) => signal.signal_id === source) || null;
}

function isSignalSource(evidence, source) {
  return Boolean(signalForSource(evidence, source));
}

function isRuleSource(evidence, source) {
  return (evidence.matched_rules || []).some((rule) => rule.rule_id === source);
}

function firstAllowedRule(evidence) {
  return (evidence.matched_rules || []).find((rule) => rule.diagnosis_allowed !== false) || null;
}

function firstMissingImpact(missingEvidence) {
  return missingEvidence[0]?.impact || "请补录正面和侧面 60fps 视频。";
}

function nextViewRequest(evidence, report) {
  const missingView = (evidence.missing_evidence || []).find((item) => item.type === "view");
  if (missingView?.value) return missingView.value;
  const requested = report.follow_up?.next_video_request || "";
  if (requested.includes("正面") && requested.includes("侧面")) return "front_and_side";
  if (requested.includes("正面")) return "front";
  if (requested.includes("侧面")) return "side";
  return "front_and_side";
}

function metricConfidence(metricId, evidence) {
  if (metricId.includes("ball") || metricId.includes("shot")) {
    return evidence.confidence?.ball_tracking || 0;
  }
  return evidence.confidence?.pose || evidence.confidence?.overall || 0;
}

function adapterErrors(evidence) {
  return [
    evidence.model_outputs?.object_detection?.error
      ? { adapter: "object_detection", error: evidence.model_outputs.object_detection.error }
      : null,
    evidence.model_outputs?.precision_pose?.error
      ? { adapter: "precision_pose", error: evidence.model_outputs.precision_pose.error }
      : null
  ].filter(Boolean);
}
