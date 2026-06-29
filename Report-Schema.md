# Report Schema

Updated: 2026-06-14

## 目标

定义球员版和实验室版报告合同。两个版本必须来自同一个 `evidence_packet.v1`，不得创造 evidence packet 中不存在的动作、帧、规则、指标或模型结论。

## 共同追溯要求

每个结论必须至少追溯到以下来源之一：

- `signal_id`
- `metric_id`
- `frame`
- `rule_id`
- `missing_evidence`

如果证据缺失，报告必须写 `missing_evidence`，而不是补造结论。

## 球员版报告

球员版面向校队球员本人，要求短、清楚、可执行。

```json
{
  "schema_version": "player_report.v1",
  "session_id": "session_...",
  "summary": "本次最重要的一个复核点",
  "confidence": "low|medium|high",
  "analysis_status": "diagnosable|review_only|not_analyzable",
  "primary_issue": {
    "title": "问题名称",
    "why_it_matters": "为什么影响稳定性或发力效率",
    "confidence": "low|medium|high",
    "evidence_refs": [
      {
        "signal_id": "coordination.ball_lift_lower_body_timing",
        "metric_id": "ball_lift_knee_delta_ms",
        "frame": 128,
        "rule_id": "kb.rule....",
        "value": "160 ms"
      }
    ]
  },
  "what_to_do_next": [
    {
      "drill": "无球蹬地-起球同步",
      "dosage": "3 组 x 20 次",
      "success_metric": "起球-下肢时序差降到 100ms 内",
      "rule_id": "kb.rule...."
    }
  ],
  "next_video_request": {
    "view": "side|front|front_and_side",
    "fps": 60,
    "reason": "需要侧面判断起球时序"
  },
  "uncertainties": [
    {
      "missing_evidence": "front_view",
      "impact": "不能判断肘外翻和左右力线"
    }
  ]
}
```

## 实验室版报告

实验室版面向教练、产品和算法调试，要求完整证据、模型状态、降级原因和规则匹配。

```json
{
  "schema_version": "lab_report.v1",
  "session_id": "session_...",
  "evidence_packet_version": "evidence_packet.v1",
  "input_context": {
    "shot_type": "定点三分",
    "camera_view": "side",
    "fps": 60,
    "video_duration_ms": 4200
  },
  "model_status": {
    "fast_pose": "provided_by_browser|not_loaded|called_no_landmarks",
    "precision_pose": "provided_by_adapter|adapter_not_configured|adapter_error",
    "object_detection": "provided_by_adapter|adapter_not_configured|adapter_error",
    "shot_event": "provided_by_yolo_heuristics|insufficient_evidence|not_available",
    "multi_angle": "multi_angle_evidence_packet.v1|null",
    "sync": "not_frame_accurate|null"
  },
  "metrics": [
    {
      "metric_id": "ball_lift_knee_delta_ms",
      "value": 160,
      "unit": "ms",
      "source": "browser_mediapipe|rtmpose_mmpose|fallback_contract",
      "frame": 128,
      "confidence": 0.7
    }
  ],
  "signals": [
    {
      "signal_id": "coordination.ball_lift_lower_body_timing",
      "status": "candidate|low_confidence|not_supported",
      "required_view": ["side"],
      "evidence_metric_ids": ["ball_lift_knee_delta_ms"],
      "frame": 128,
      "confidence": 0.7,
      "false_positive_checks": []
    }
  ],
  "matched_rules": [
    {
      "rule_id": "kb.rule....",
      "source_card_id": "douyin_...",
      "diagnosis_allowed": true,
      "supporting_signal_ids": ["coordination.ball_lift_lower_body_timing"],
      "repair_actions": []
    }
  ],
  "missing_evidence": [
    {
      "type": "view",
      "value": "front",
      "impact": "不能可靠判断肘外翻、左右力线和横向球路偏移"
    }
  ],
  "multi_angle_context": {
    "schema_version": "multi_angle_evidence_packet.v1",
    "session_group_id": "group_...",
    "present_views": ["side", "front"],
    "missing_views": [],
    "sync_policy": "approximate_session_grouping_no_manual_keyframe_sync",
    "sync_assessment": {
      "schema_version": "sync_assessment.v1",
      "precision": "not_frame_accurate",
      "risk_level": "high"
    }
  },
  "diagnosis": {
    "title": "候选诊断",
    "confidence": "low|medium|high",
    "evidence_refs": [
      {
        "signal_id": "coordination.ball_lift_lower_body_timing",
        "metric_id": "ball_lift_knee_delta_ms",
        "frame": 128,
        "rule_id": "kb.rule...."
      }
    ]
  },
  "debug_notes": {
    "degradation_reasons": [],
    "adapter_errors": [],
    "report_validation_errors": []
  }
}
```

## 字段约束

- `confidence` 不得超过 `evidence_packet.confidence.max_report_confidence`。
- `diagnosis.evidence_refs[].signal_id` 必须来自 `matched_signals`。
- `diagnosis.evidence_refs[].metric_id` 必须来自 `metrics` 或 `metric_series`。
- `diagnosis.evidence_refs[].frame` 必须来自 signal、metric_series 或模型输出。
- `diagnosis.evidence_refs[].rule_id` 必须来自 `matched_rules`，且 `diagnosis_allowed=true`。
- `missing_evidence` 允许作为结论来源，但只能支撑“不足、需重拍、需复核”，不能支撑动作错误结论。
- `fallback_contract` 生成的指标必须标注为低置信或复核用途。
- `multi_angle_evidence_packet.v1` 进入报告前会归一化为 report evidence；lab report 必须保留 `multi_angle_context`、`sync_assessment.v1`、`not_frame_accurate` 和 sync risk `missing_evidence`，不得写成精确跨机位同步。

## 当前实现差距

- 后端 `/api/coach-report` 已保留原有 `report`，并额外输出 `player_report.v1` 和 `lab_report.v1`。
- 前端当前在同一工作台内分区展示球员版报告和实验室版摘要；仍未完成独立页面级分屏、移动端密度 polish 和真实样例可读性复核。
- 现有校验已经要求 diagnosis evidence 引用 signal、frame、rule_id，并限制置信度上限；前端 `Evidence Trace` 面板已显式呈现 `signal_id`、`metric_id`、`frame`、`rule_id` 和 `missing_evidence`，但它只展示 evidence packet 引用，不提高报告置信度。
- `scripts/phase2-report-contract-smoke.mjs` 已可重复验证 legacy report、`player_report.v1`、`lab_report.v1`、低证据 missing_evidence 追溯和前端渲染绑定。
- `scripts/phase2-report-ui-browser-smoke.mjs` 已可重复验证浏览器 DOM 中的球员版/实验室版分区、可见 schema version、`Evidence Trace`、`signal_id`、`metric_id`、`rule_id`、`missing_evidence` fallback、模型状态和 adapter fallback，并清理本次 smoke 产生的本地 session。
- `scripts/phase4-multi-angle-smoke.mjs` 已可重复验证 `/api/coach-report` 可消费 `multi_angle_evidence_packet.v1`：side-only 报告会请求缺失的 `front`，lab report 保留 present/missing views、sync policy、`sync_assessment.v1` 和 sync risk evidence。
