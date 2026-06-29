export function buildMultiAngleEvidencePacket({ sessionGroupId, shotType, inputs, evidencePackets }) {
  const views = Object.fromEntries(
    evidencePackets.map((packet, index) => [
      packet.session?.camera_view || inputs[index]?.camera_view || `view_${index + 1}`,
      packet
    ])
  );
  const presentViews = Object.keys(views);
  const missingViews = ["front", "side"].filter((view) => !presentViews.includes(view));
  const mergedMetrics = mergeMetrics(evidencePackets);
  const mergedSignals = evidencePackets.flatMap((packet) =>
    (packet.matched_signals || []).map((signal) => ({
      ...signal,
      packet_session_id: packet.session_id,
      source_view: signal.source_view || packet.session?.camera_view
    }))
  );
  const mergedRules = evidencePackets.flatMap((packet) =>
    (packet.matched_rules || []).map((rule) => ({
      ...rule,
      packet_session_id: packet.session_id,
      source_views: rule.source_views?.length ? rule.source_views : [packet.session?.camera_view].filter(Boolean)
    }))
  );
  const mergedScoringDimensions = evidencePackets.flatMap((packet) =>
    (packet.matched_scoring_dimensions || []).map((dimension) => ({
      ...dimension,
      packet_session_id: packet.session_id,
      source_view: packet.session?.camera_view
    }))
  );
  const viewQualityAssessment = buildViewQualityAssessment({ presentViews, missingViews, inputs, evidencePackets });
  const missingEvidence = dedupeMissingEvidence([
    ...evidencePackets.flatMap((packet) => {
      return (packet.missing_evidence || []).filter((item) => {
        return item.type !== "view" || missingViews.includes(item.value);
      });
    }),
    ...missingViews.map((view) => ({
      type: "view",
      value: view,
      impact: view === "front"
        ? "缺少正面视角，不能可靠判断左右力线、肘外翻、辅助手和横向球路偏移。"
        : "缺少侧面视角，不能可靠判断起球时序、躯干前倾、释放高度和下肢伸展。"
    })),
    ...viewQualityAssessment.risk_factors
      .filter((factor) => factor.severity !== "low")
      .map((factor) => ({
        type: "view_quality",
        value: factor.factor_id,
        impact: factor.user_impact
      }))
  ]);
  const confidenceValues = evidencePackets.map((packet) => Number(packet.confidence?.overall || 0)).filter(Number.isFinite);
  const overall = confidenceValues.length ? Math.min(...confidenceValues) : 0;
  const syncAssessment = buildSyncAssessment({ presentViews, missingViews, inputs, evidencePackets });

  return {
    schema_version: "multi_angle_evidence_packet.v1",
    session_group_id: sessionGroupId || `group_${Date.now()}`,
    generated_at: new Date().toISOString(),
    shot_type: shotType || evidencePackets[0]?.session?.shot_type || "unknown",
    view_count: presentViews.length,
    present_views: presentViews,
    missing_views: missingViews,
    sync_policy: "approximate_session_grouping_no_manual_keyframe_sync",
    sync_assessment: syncAssessment,
    view_quality_assessment: viewQualityAssessment,
    views,
    merged: {
      metrics: mergedMetrics,
      matched_signals: mergedSignals,
      matched_scoring_dimensions: mergedScoringDimensions,
      matched_rules: mergedRules,
      missing_evidence: missingEvidence,
      confidence: {
        overall,
        max_report_confidence: overall >= 0.82 ? "high" : overall >= 0.65 ? "medium" : "low"
      }
    },
    diagnosis_policy: "front_view_supports_force_line_side_view_supports_timing_missing_views_degrade_confidence"
  };
}

function buildViewQualityAssessment({ presentViews, missingViews, inputs, evidencePackets }) {
  const viewResults = inputs.map((input, index) => {
    const packet = evidencePackets[index] || {};
    const view = input.camera_view || packet.session?.camera_view || `view_${index + 1}`;
    const metadata = packet.video_context?.detected_metadata || input.metadata || {};
    const fps = Number(input.fps || packet.session?.fps || 0);
    const durationMs = Number(input.video_duration_ms || packet.session?.video_duration_ms || 0);
    const width = Number(input.dimensions?.width || input.width || metadata.width || 0);
    const height = Number(input.dimensions?.height || input.height || metadata.height || 0);
    const checks = [];

    checks.push(check(
      ["front", "side"].includes(view),
      "view_is_required_front_or_side",
      `${view} is part of the required front/side pair`,
      `${view} 不是 Phase 4 最小验收的 front/side 必需视角。`,
      "high"
    ));
    checks.push(check(
      fps >= 30,
      "fps_at_least_30",
      `${fps || "unknown"}fps`,
      "帧率低于 30fps 或缺失，跨视角时序和关键帧对齐风险升高。",
      "medium"
    ));
    checks.push(check(
      durationMs >= 1500,
      "duration_at_least_1500ms",
      `${durationMs || "unknown"}ms`,
      "视频时长过短或缺失，可能没有覆盖投篮前后上下文。",
      "medium"
    ));
    checks.push(check(
      !width || !height || (width >= 640 && height >= 360),
      "resolution_at_least_640x360_when_known",
      width && height ? `${width}x${height}` : "metadata_missing",
      "分辨率低于 640x360 时，关键点、球和篮筐识别风险升高。",
      "medium"
    ));

    const failed = checks.filter((item) => item.status === "fail");
    return {
      view,
      status: failed.some((item) => item.severity === "high") ? "insufficient" : failed.length ? "review" : "ok",
      source_contract: "metadata_and_evidence_context_only_not_real_frame_quality",
      fps: fps || null,
      duration_ms: durationMs || null,
      dimensions: width && height ? { width, height } : null,
      checks
    };
  });

  const riskFactors = [
    ...missingViews.map((view) => ({
      factor_id: `view_quality_missing_${view}`,
      severity: "high",
      evidence: `${view}_view_absent`,
      user_impact: `${view} 视角缺失，不能完成 front+side 视角质量验收。`,
      mitigation: "补拍同一次投篮的正面和侧面视角。"
    })),
    ...viewResults.flatMap((result) =>
      result.checks
        .filter((item) => item.status === "fail")
        .map((item) => ({
          factor_id: `view_quality_${result.view}_${item.check_id}`,
          severity: item.severity,
          evidence: item.evidence,
          user_impact: item.failure_impact,
          mitigation: viewQualityMitigation(item.check_id)
        }))
    )
  ];
  if (presentViews.includes("front") && presentViews.includes("side") && !riskFactors.some((item) => item.severity === "high")) {
    riskFactors.push({
      factor_id: "view_quality_front_side_metadata_ready",
      severity: "low",
      evidence: "front+side_metadata_present",
      user_impact: "front + side 的 metadata 满足本地合同审计；仍不代表真实画面质量或动作诊断质量。",
      mitigation: "继续用授权真实/代表性样例做人工可读性复核。"
    });
  }

  const status = riskFactors.some((item) => item.severity === "high")
    ? "insufficient"
    : riskFactors.some((item) => item.severity === "medium")
      ? "review"
      : presentViews.includes("front") && presentViews.includes("side")
        ? "metadata_ready"
        : "waiting_for_required_views";

  return {
    schema_version: "view_quality_assessment.v1",
    source_contract: "metadata_and_evidence_context_only_not_real_frame_quality",
    status,
    present_views: presentViews,
    missing_views: missingViews,
    input_count: inputs.length,
    view_results: viewResults,
    risk_factors: riskFactors,
    retake_guidance: viewQualityRetakeGuidance(riskFactors)
  };
}

function check(pass, checkId, evidence, failureImpact, severity) {
  return {
    check_id: checkId,
    status: pass ? "pass" : "fail",
    severity,
    evidence,
    failure_impact: pass ? null : failureImpact
  };
}

function viewQualityMitigation(checkId) {
  return {
    view_is_required_front_or_side: "使用正面 front 和侧面 side 作为 Phase 4 最小输入。",
    fps_at_least_30: "用 30fps 以上录制，时序诊断优先 60fps。",
    duration_at_least_1500ms: "保留投篮前后至少 1-2 秒上下文。",
    resolution_at_least_640x360_when_known: "使用 640x360 或更高分辨率，避免裁切球员、球和篮筐。"
  }[checkId] || "按重拍建议补充输入。";
}

function viewQualityRetakeGuidance(factors) {
  const ids = new Set(factors.map((factor) => factor.factor_id));
  if ([...ids].some((id) => id.startsWith("view_quality_missing_"))) {
    return "补齐同一次投篮的 front + side 输入，并保留投篮前后 1-2 秒上下文。";
  }
  if ([...ids].some((id) => id.includes("fps_at_least_30"))) {
    return "下一次两个视角都使用 30fps 以上录制，优先 60fps。";
  }
  if ([...ids].some((id) => id.includes("duration_at_least_1500ms"))) {
    return "下一次不要只截出手瞬间，保留投篮前后完整上下文。";
  }
  return "metadata 只证明输入合同，不证明真实画面质量；真实/代表性样例仍需人工复核。";
}

function buildSyncAssessment({ presentViews, missingViews, inputs, evidencePackets }) {
  const fpsValues = inputs.map((input, index) => Number(input.fps || evidencePackets[index]?.session?.fps || 0)).filter((value) => value > 0);
  const durationValues = inputs
    .map((input, index) => Number(input.video_duration_ms || evidencePackets[index]?.session?.video_duration_ms || 0))
    .filter((value) => value > 0);
  const hasSharedClock = inputs.some((input) => input.shared_clock === true || input.timecode_source === "shared_clock");
  const hasSyncMarker = inputs.some((input) => input.sync_marker_ms != null || input.sync_marker === true);
  const reasons = [
    {
      reason: "approximate_session_grouping",
      impact: "同一 session group 只表示同一次投篮输入的候选合并，不代表逐帧同步。"
    },
    {
      reason: "no_shared_clock",
      impact: "当前输入没有共享时钟、拍板声或统一时间码，不能证明两个视角同一帧对齐。"
    },
    {
      reason: "no_manual_keyframe_sync",
      impact: "普通球员主流程不要求手动选关键帧；当前也未做精确关键帧同步。"
    },
    ...(!hasSyncMarker ? [{
      reason: "no_sync_marker",
      impact: "当前输入没有拍手声、球触地声或明显同步动作，无法自动估计视角间时间偏移。"
    }] : []),
    ...missingViews.map((view) => ({
      reason: `missing_${view}_view`,
      impact: `${view} 视角缺失，相关跨视角结论必须降级。`
    }))
  ];

  if (fpsValues.length > 1 && new Set(fpsValues.map((value) => value.toFixed(2))).size > 1) {
    reasons.push({
      reason: "fps_mismatch",
      impact: `输入帧率不一致：${fpsValues.map((value) => value.toFixed(2)).join(" / ")}fps。`
    });
  }
  if (durationValues.length > 1 && Math.max(...durationValues) - Math.min(...durationValues) > 500) {
    reasons.push({
      reason: "duration_mismatch_over_500ms",
      impact: `输入时长差超过 500ms：${durationValues.join(" / ")}ms。`
    });
  }
  const riskFactors = buildSyncRiskFactors({
    presentViews,
    missingViews,
    hasSharedClock,
    hasSyncMarker,
    fpsValues,
    durationValues
  });
  const riskSeverity = syncRiskSeverity(riskFactors);

  return {
    schema_version: "sync_assessment.v1",
    status: missingViews.length ? "missing_required_view" : "approximate_only",
    policy: "approximate_session_grouping_no_manual_keyframe_sync",
    precision: "not_frame_accurate",
    confidence: presentViews.includes("front") && presentViews.includes("side") && riskSeverity !== "high" ? "medium" : "low",
    present_views: presentViews,
    missing_views: missingViews,
    input_count: inputs.length,
    reasons,
    risk_level: riskSeverity,
    risk_factors: riskFactors,
    retake_guidance: syncRetakeGuidance(riskFactors)
  };
}

function buildSyncRiskFactors({ presentViews, missingViews, hasSharedClock, hasSyncMarker, fpsValues, durationValues }) {
  const factors = [
    {
      factor_id: "no_frame_accurate_sync",
      severity: "high",
      evidence: "precision=not_frame_accurate",
      user_impact: "跨视角时序结论只能作为候选复核，不能逐帧比较出手点或发力链先后。",
      mitigation: "下一次同一投篮用两个机位同时录制，并在投篮前加入清晰同步动作。"
    }
  ];
  if (!hasSharedClock) {
    factors.push({
      factor_id: "no_shared_clock",
      severity: "medium",
      evidence: "shared_clock=false",
      user_impact: "无法证明两个视角的时间零点一致。",
      mitigation: "使用同一设备双机位系统、共享时间码，或在两个视频中保留同一个明显同步事件。"
    });
  }
  if (!hasSyncMarker) {
    factors.push({
      factor_id: "no_sync_marker",
      severity: "medium",
      evidence: "sync_marker_absent",
      user_impact: "系统不能自动估计 front/side 之间的时间偏移。",
      mitigation: "投篮前做一次清晰拍手、球触地或举球停顿，让两个视角都能看到或听到。"
    });
  }
  for (const view of missingViews) {
    factors.push({
      factor_id: `missing_${view}_view`,
      severity: "high",
      evidence: `${view}_view_absent`,
      user_impact: `${view} 视角缺失，相关跨视角结论必须降级。`,
      mitigation: "同一次投篮至少提供正面和侧面两个视角。"
    });
  }
  if (fpsValues.length > 1 && new Set(fpsValues.map((value) => value.toFixed(2))).size > 1) {
    factors.push({
      factor_id: "fps_mismatch",
      severity: "medium",
      evidence: fpsValues.map((value) => `${value.toFixed(2)}fps`).join(" / "),
      user_impact: "不同帧率会增加自动对齐误差。",
      mitigation: "两个视角使用相同帧率，优先 60fps 或更高。"
    });
  }
  if (durationValues.length > 1 && Math.max(...durationValues) - Math.min(...durationValues) > 500) {
    factors.push({
      factor_id: "duration_mismatch_over_500ms",
      severity: "medium",
      evidence: durationValues.map((value) => `${Math.round(value)}ms`).join(" / "),
      user_impact: "视频裁切长度差异较大，可能不是同一段动作起止。",
      mitigation: "两个视角保留投篮前后同样的 1-2 秒上下文。"
    });
  }
  if (presentViews.includes("front") && presentViews.includes("side")) {
    factors.push({
      factor_id: "front_side_present_but_approximate",
      severity: "low",
      evidence: "front+side_present",
      user_impact: "视角互补可用于证据来源审计，但仍不是逐帧同步。",
      mitigation: "保持 front + side 输入，并加入同步标记以提升下一次复测质量。"
    });
  }
  return factors;
}

function syncRiskSeverity(factors) {
  if (factors.some((factor) => factor.severity === "high")) return "high";
  if (factors.some((factor) => factor.severity === "medium")) return "medium";
  return "low";
}

function syncRetakeGuidance(factors) {
  const ids = new Set(factors.map((factor) => factor.factor_id));
  if ([...ids].some((id) => id.startsWith("missing_") && id.endsWith("_view"))) {
    return "下一次请同时提供正面和侧面两个视角，并让两个视频都覆盖投篮前后 1-2 秒。";
  }
  if (ids.has("no_sync_marker")) {
    return "下一次录制前加入清晰拍手、球触地或举球停顿，让两个视角都能看到或听到同一个同步事件。";
  }
  if (ids.has("fps_mismatch")) {
    return "下一次两个视角使用相同帧率，优先 60fps 或更高。";
  }
  return "当前仍是近似合并；若要做时序诊断，请补充共享时间码或同步标记。";
}

function dedupeMissingEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.type === "view"
      ? `${item.type}:${item.value}`
      : `${item.type}:${item.value}:${item.impact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeMetrics(evidencePackets) {
  const rows = [];
  for (const packet of evidencePackets) {
    const sourceView = packet.session?.camera_view || "unknown";
    for (const [metricId, value] of Object.entries(packet.metrics || {})) {
      rows.push({
        metric_id: metricId,
        value,
        source_view: packet.metric_sources?.[metricId]?.source_view || sourceView,
        source_layer: packet.metric_sources?.[metricId]?.source_layer || packet.session?.analysis_mode,
        packet_session_id: packet.session_id
      });
    }
  }
  return rows;
}
