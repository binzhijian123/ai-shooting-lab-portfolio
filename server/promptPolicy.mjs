export const coachReportSystemPrompt = `
You are the evidence-based AI coach inside AI Shooting Lab.
Return valid JSON only. Do not use markdown.

Hard rules:
- Do not claim you watched the video directly.
- Use only the supplied metrics, matched_signals, matched_rules, false_positive_checks, and user_memory.
- Every diagnosis must cite at least one existing signal_id, frame, and rule_id.
- If evidence is weak or a camera view is missing, lower confidence and state the uncertainty.
- Never exceed confidence.max_report_confidence.
- A single metric threshold is only a candidate signal, never a standalone diagnosis.
- matched_rules with diagnosis_allowed=false must not appear as a diagnosis.
- Do not give medical or injury treatment advice.
- Never invent a frame, metric_id, signal_id, rule_id, shot result, or body movement that is not in the input.
- If missing_evidence affects a conclusion, mention it in uncertainties.
- Use Simplified Chinese for all user-facing text.
- If evidence is weak, still provide a low-confidence candidate observation, not a blank diagnosis. Clearly state that it is for review only.
- The response must be a JSON object.

Output JSON shape:
{
  "summary": "one concise coaching summary",
  "primary_diagnosis": {
    "title": "diagnosis title",
    "confidence": "low|medium|high",
    "evidence": [
      {"label": "evidence label", "value": "metric value", "source": "exact signal_id or rule_id only", "frame": 142, "rule_id": "exact rule_id"}
    ],
    "uncertainties": ["missing or weak evidence"]
  },
  "next_drills": [
    {"name": "drill name", "dosage": "sets/reps", "success_metric": "measurable target"}
  ],
  "follow_up": {
    "next_video_request": "what angle or shot to record next",
    "next_metric_to_watch": "metric name"
  }
}
`;

export function buildCoachUserPrompt(evidencePacket) {
  return `Generate a JSON coaching report for this basketball shooting evidence packet. Use JSON only.\n${JSON.stringify(evidencePacket, null, 2)}`;
}

export function localCoachReport(evidencePacket) {
  const candidateSignals = (evidencePacket.matched_signals || []).filter((signal) => signal.status === "candidate");
  const mainSignal = candidateSignals[0];
  const timingSignal = candidateSignals.find((signal) => signal.signal_id.includes("timing"));
  const postureSignal = candidateSignals.find((signal) => signal.signal_id.includes("trunk"));
  const timingRule = ruleForSignal(evidencePacket, timingSignal?.signal_id);
  const postureRule = ruleForSignal(evidencePacket, postureSignal?.signal_id) || timingRule;
  const firstAllowedRule = firstDiagnosisAllowedRule(evidencePacket);
  const confidence = evidencePacket.confidence?.max_report_confidence || (
    evidencePacket.confidence?.overall >= 0.8 ? "high" : evidencePacket.confidence?.overall >= 0.62 ? "medium" : "low"
  );
  const lowEvidence = confidence === "low" || !candidateSignals.length;
  const uncertaintyItems = [
    ...(evidencePacket.missing_evidence || []).map((item) => item.impact),
    ...(evidencePacket.confidence?.degradation_reasons || []).map((reason) => `证据提示：${reason}`),
    "报告只解释 evidence packet 中已有的视觉模型、指标、Signal Registry 和知识库证据。"
  ];
  const evidenceItems = [
    timingSignal ? {
      label: "起球-屈膝时序差",
      value: `${evidencePacket.metrics.ball_lift_knee_delta_ms} ms`,
      source: timingSignal.signal_id,
      frame: timingSignal.frame,
      rule_id: timingRule?.rule_id || firstAllowedRule?.rule_id
    } : null,
    postureSignal ? {
      label: "出手躯干前倾",
      value: `${evidencePacket.metrics.trunk_lean_release_deg} deg`,
      source: postureSignal.signal_id,
      frame: postureSignal.frame,
      rule_id: postureRule?.rule_id || firstAllowedRule?.rule_id
    } : null,
    !timingSignal && mainSignal ? {
      label: mainSignal.name,
      value: mainSignal.value_label,
      source: mainSignal.signal_id,
      frame: mainSignal.frame,
      rule_id: ruleForSignal(evidencePacket, mainSignal.signal_id)?.rule_id || firstAllowedRule?.rule_id
    } : null
  ].filter(Boolean);

  return {
    summary: lowEvidence
      ? "本次证据不足以给强诊断，但可以先作为候选观察：优先复核出手节奏、躯干稳定和出手点是否完整。是否进入长期记忆由你手动决定。"
      : "本次报告基于已识别到的姿态和指标给出候选诊断；缺失的视角、帧率或篮筐信息只作为不确定性提示，不阻断本次训练建议。",
    primary_diagnosis: {
      title: lowEvidence ? "证据不足：候选观察为出手节奏需复核" : (timingSignal ? "轻微手快脚慢" : "出手稳定性需要复核"),
      confidence,
      evidence: evidenceItems,
      uncertainties: [...new Set(uncertaintyItems)]
    },
    next_drills: lowEvidence ? [
      {
        name: "侧面 60fps 复测拍摄",
        dosage: "连续录 5 次定点投篮",
        success_metric: "人体、篮球和出手点完整入镜"
      },
      {
        name: "正面 60fps 复测拍摄",
        dosage: "连续录 5 次定点投篮",
        success_metric: "双脚、膝线、肘线和篮筐方向完整入镜"
      }
    ] : [
      {
        name: "无球蹬地-起球同步",
        dosage: "3 组 x 20 次",
        success_metric: "起球早于屈膝不超过 80 ms"
      },
      {
        name: "近距离定点节奏投",
        dosage: "5 组 x 10 球",
        success_metric: "出手躯干前倾低于 4 deg"
      }
    ],
    follow_up: {
      next_video_request: (evidencePacket.missing_evidence || []).some((item) => item.value === "side")
        ? "下次先录侧面 60fps 视频，用于判断起球时序、躯干前倾和释放高度。"
        : "下次录一段侧面 60fps 视频，再补一段正面视频用于检查力线。",
      next_metric_to_watch: evidencePacket.personalized_plan?.retest_metrics?.[0] || "ball_lift_knee_delta_ms"
    }
  };
}

export function validateCoachReport(report, evidencePacket) {
  const errors = [];
  if (!report || typeof report !== "object") errors.push("report must be an object");
  if (!report.summary) errors.push("summary is required");
  if (!report.primary_diagnosis?.title) errors.push("primary_diagnosis.title is required");
  const validConfidence = ["low", "medium", "high"].includes(report.primary_diagnosis?.confidence);
  if (!validConfidence) errors.push("primary_diagnosis.confidence must be low, medium, or high");
  if (confidenceRank(report.primary_diagnosis?.confidence) > confidenceRank(evidencePacket.confidence?.max_report_confidence)) {
    errors.push("primary_diagnosis.confidence exceeds evidence max_report_confidence");
  }
  const diagnosableSignals = (evidencePacket.matched_signals || []).filter((signal) => signal.status === "candidate");
  const diagnosableRules = (evidencePacket.matched_rules || []).filter((rule) => rule.diagnosis_allowed !== false);
  const insufficientEvidenceReport = !diagnosableSignals.length && report.primary_diagnosis?.title?.includes("证据不足");
  if (!Array.isArray(report.primary_diagnosis?.evidence)) {
    errors.push("primary_diagnosis.evidence must be an array");
  } else if (!report.primary_diagnosis.evidence.length && !insufficientEvidenceReport) {
    errors.push("primary_diagnosis.evidence must include at least one cited evidence item");
  }
  if (!Array.isArray(report.primary_diagnosis?.uncertainties)) {
    errors.push("primary_diagnosis.uncertainties must be an array");
  }
  if (!Array.isArray(report.next_drills)) errors.push("next_drills must be an array");
  for (const drill of report.next_drills || []) {
    if (!drill?.name) errors.push("each next_drill must include name");
    if (!drill?.dosage) errors.push("each next_drill must include dosage");
    if (!drill?.success_metric) errors.push("each next_drill must include success_metric");
  }
  if (!report.follow_up?.next_video_request) errors.push("follow_up.next_video_request is required");
  if (!report.follow_up?.next_metric_to_watch) errors.push("follow_up.next_metric_to_watch is required");

  const allowedSources = new Set([
    ...diagnosableSignals.map((signal) => signal.signal_id),
    ...diagnosableRules.map((rule) => rule.rule_id)
  ]);
  const allowedFrames = new Set(diagnosableSignals.map((signal) => signal.frame));
  const allowedRules = new Set(diagnosableRules.map((rule) => rule.rule_id));
  const blockedRules = new Set(
    (evidencePacket.matched_rules || [])
      .filter((rule) => rule.diagnosis_allowed === false)
      .map((rule) => rule.rule_id)
  );
  const allowedMetrics = new Set(Object.keys(evidencePacket.metrics || {}));
  for (const item of report.primary_diagnosis?.evidence || []) {
    if (!item.label) errors.push("each evidence item must include label");
    if (!item.value) errors.push("each evidence item must include value");
    if (!item.source) errors.push("each evidence item must include source");
    if (item.source && !allowedSources.has(item.source)) {
      errors.push(`unknown evidence source: ${item.source}`);
    }
    if (typeof item.frame === "number" && allowedFrames.size && !allowedFrames.has(item.frame)) {
      errors.push(`unknown evidence frame: ${item.frame}`);
    }
    if (item.rule_id && !allowedRules.has(item.rule_id)) {
      errors.push(`unknown evidence rule_id: ${item.rule_id}`);
    }
    if (typeof item.frame !== "number") {
      errors.push("each evidence item must cite a numeric frame");
    }
    if (!item.rule_id) {
      errors.push("each evidence item must cite a rule_id");
    }
    if (item.rule_id && blockedRules.has(item.rule_id)) {
      errors.push(`rule_id is not diagnosis_allowed: ${item.rule_id}`);
    }
    if (item.metric_id && !allowedMetrics.has(item.metric_id)) {
      errors.push(`unknown metric_id: ${item.metric_id}`);
    }
  }
  if (report.follow_up?.next_metric_to_watch && !allowedMetrics.has(report.follow_up.next_metric_to_watch)) {
    errors.push(`unknown follow_up metric: ${report.follow_up.next_metric_to_watch}`);
  }
  return errors;
}

function confidenceRank(confidence) {
  return { low: 1, medium: 2, high: 3 }[confidence] || 0;
}

function ruleForSignal(evidencePacket, signalId) {
  if (!signalId) return null;
  return (evidencePacket.matched_rules || []).find((rule) => {
    return rule.diagnosis_allowed !== false && (rule.linked_signal_ids || []).includes(signalId);
  }) || null;
}

function firstDiagnosisAllowedRule(evidencePacket) {
  return (evidencePacket.matched_rules || []).find((rule) => rule.diagnosis_allowed !== false) || null;
}
