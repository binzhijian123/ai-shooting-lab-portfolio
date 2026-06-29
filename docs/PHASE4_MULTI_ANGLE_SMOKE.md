# Phase 4 Multi-Angle Smoke

Updated: 2026-06-15

## Scope

This smoke test verifies the first backend and frontend slice for multi-angle input:

- `/api/analyze-multi-angle`
- `multi_angle_evidence_packet.v1`
- per-metric `source_view`
- per-signal `source_view`
- per-rule `source_views`
- `sync_assessment.v1` with `precision=not_frame_accurate`
- sync risk factors and retake guidance
- `view_quality_assessment.v1` with metadata/evidence-context-only checks
- precomputed primary `evidence_packet.v1` reuse, with camera-view mismatch rejection
- report contracts for `multi_angle_evidence_packet.v1`
- missing view behavior for side-only, front-only, and front+side inputs
- frontend paired upload controls
- frontend Multi Angle summary and audit card

It does not verify exact cross-camera frame synchronization, real frame-level view quality, or high-confidence model behavior on real shooting footage.

## Command Context

The repeatable smoke command is:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase4-multi-angle-smoke.mjs
```

The script starts a temporary local service with external and heavy model paths disabled:

```bash
PORT=<free port> DEEPSEEK_API_KEY= YOLO_COMMAND= RTMPOSE_COMMAND= node server/index.mjs
```

The smoke used `data/synthetic_ball.mp4` twice to simulate side and front inputs.

## Result

```json
{
  "sideOnly": {
    "schema": "multi_angle_evidence_packet.v1",
    "views": ["side"],
    "missing_views": ["front"],
    "missing_view_evidence": ["front"],
    "metric_source_view": "side",
    "signal_source_view": "side",
    "rule_source_views": ["side"],
    "sync_assessment": {
      "schema_version": "sync_assessment.v1",
      "status": "missing_required_view",
      "precision": "not_frame_accurate",
      "risk_level": "high",
      "risk_factor_count": 4
    },
    "confidence": "low"
  },
  "frontOnly": {
    "schema": "multi_angle_evidence_packet.v1",
    "views": ["front"],
    "missing_views": ["side"],
    "missing_view_evidence": ["side"],
    "metric_source_view": "front",
    "signal_source_view": "front",
    "rule_source_views": ["front"],
    "sync_assessment": {
      "schema_version": "sync_assessment.v1",
      "status": "missing_required_view",
      "precision": "not_frame_accurate",
      "risk_level": "high",
      "risk_factor_count": 4
    },
    "confidence": "low"
  },
  "both": {
    "schema": "multi_angle_evidence_packet.v1",
    "views": ["side", "front"],
    "missing_views": [],
    "missing_view_evidence": [],
    "metric_source_view": "side",
    "signal_source_view": "side",
    "rule_source_views": ["side"],
    "confidence": "low"
  }
}
```

Latest repeatable smoke result:

```json
{
  "ok": true,
  "schema_version": "phase4_multi_angle_smoke.v1",
  "frontend_audit": {
    "source_contract": "multi_angle_audit_ui_candidate_only",
    "view_evidence_table": true,
    "metric_source_audit": true,
    "missing_view_impact": true,
    "view_quality_assessment": true,
    "sync_policy_copy": "approximate_session_grouping_no_manual_keyframe_sync"
  },
  "report_contracts": {
    "side_only": {
      "player_status": "review_only",
      "player_next_view": "front",
      "lab_evidence_packet_version": "multi_angle_evidence_packet.v1",
      "lab_analysis_mode": "multi_angle_approximate_grouping",
      "lab_present_views": ["side"],
      "lab_missing_views": ["front"],
      "sync_precision": "not_frame_accurate",
      "view_quality_status": "insufficient",
      "sync_risk_evidence_count": 4
    },
    "both": {
      "player_status": "review_only",
      "player_next_view": "front_and_side",
      "lab_evidence_packet_version": "multi_angle_evidence_packet.v1",
      "lab_present_views": ["side", "front"],
      "lab_missing_views": [],
      "sync_precision": "not_frame_accurate",
      "view_quality_status": "metadata_ready",
      "sync_risk_evidence_count": 4
    }
  },
  "evidence_reuse": {
    "preserved_session_id": true,
    "mismatch_rejected": "evidence_packet_camera_view_mismatch",
    "invalid_schema_rejected": "evidence_packet_schema_invalid",
    "private_fields_rejected": "evidence_packet_schema_invalid"
  },
  "side_only": {
    "present_views": ["side"],
    "missing_views": ["front"],
    "metric_source_views": ["side"],
    "signal_source_views": ["side"],
    "rule_source_views": ["side"],
    "view_quality_assessment": {
      "schema_version": "view_quality_assessment.v1",
      "status": "insufficient",
      "risk_factor_count": 1
    }
  },
  "front_only": {
    "present_views": ["front"],
    "missing_views": ["side"],
    "metric_source_views": ["front"],
    "signal_source_views": ["front"],
    "rule_source_views": ["front"],
    "view_quality_assessment": {
      "schema_version": "view_quality_assessment.v1",
      "status": "insufficient",
      "risk_factor_count": 1
    }
  },
  "both": {
    "present_views": ["side", "front"],
    "missing_views": [],
    "metric_source_views": ["front", "side"],
    "signal_source_views": ["front", "side"],
    "rule_source_views": ["front", "side"],
    "sync_assessment": {
      "schema_version": "sync_assessment.v1",
      "status": "approximate_only",
      "precision": "not_frame_accurate",
      "risk_level": "high",
      "risk_factor_count": 4
    },
    "view_quality_assessment": {
      "schema_version": "view_quality_assessment.v1",
      "status": "metadata_ready",
      "risk_factor_count": 1
    }
  }
}
```

Browser smoke at `http://localhost:4182`:

```json
{
  "title": "AI 投篮实验室",
  "pairedVideoInput": true,
  "pairedCameraView": true,
  "multiAngleStatus": "single",
  "multiAngleText": "上传补充视角后，会生成 front + side 合并证据。",
  "ballTrajectoryCard": true,
  "hasMultiAngleLabel": true,
  "auditBindings": ["视角证据清单", "关键指标来源", "视角缺失影响"],
  "blocking_events": []
}
```

## Interpretation

- The backend can group multiple uploaded videos into one multi-angle evidence packet.
- Single-angle evidence now carries `metric_sources`, and merged metrics/signals/rules preserve view provenance.
- Missing front/side evidence is added only when that view is absent from the session group.
- `sync_policy` remains `approximate_session_grouping_no_manual_keyframe_sync`; the smoke must fail if this is silently changed.
- `sync_assessment.v1` explicitly records approximate grouping, no shared clock, no sync marker, no manual keyframe sync, `not_frame_accurate` precision, sync `risk_factors`, `risk_level`, and `retake_guidance`.
- `view_quality_assessment.v1` records front/side presence, fps, duration, and known resolution checks from upload metadata and evidence context only. It adds `view_quality_missing_front` / `view_quality_missing_side` for single-angle input and `view_quality_front_side_metadata_ready` when both required views satisfy the metadata contract.
- `/api/analyze-multi-angle` can reuse a precomputed single-angle `evidence_packet.v1` for the matching camera view, rejects mismatched reuse with `evidence_packet_camera_view_mismatch`, and rejects malformed or privacy-risk precomputed packet schemas with `evidence_packet_schema_invalid` instead of silently rerunning adapters or accepting local paths/raw-video-shaped fields.
- The frontend now exposes a paired-video input, paired camera view selector, and Multi Angle summary/audit card.
- `/api/coach-report` now accepts `multi_angle_evidence_packet.v1` through a report-evidence normalization path. Lab reports preserve `multi_angle_context`, `sync_assessment.v1`, `not_frame_accurate`, and sync risk missing evidence; side-only player reports request the missing front view.
- The audit card shows sync assessment, sync risk factors, view quality assessment, retake guidance, per-view metric/signal/missing counts, key metric `source_view`, missing-view impact, and the current approximate sync policy.
- The browser UI smoke verifies that front+side and side-only multi-angle packets render those audit sections in the actual DOM.
- The MediaPipe browser import was moved from unavailable `@mediapipe/tasks-vision@0.10.22` to verified `0.10.35`; jsDelivr returned 200 for `0.10.35/+esm` and the wasm file.
- The current sync policy is approximate session grouping, not manual keyframe synchronization or precise cross-camera synchronization.

## Remaining Phase 4 Gap

Phase 4 still needs true view pairing UX and authorized real or representative shooting samples for meaningful model-path validation. The current view-quality layer is a metadata/evidence-context gate, not real frame-quality analysis. The current implementation must not be presented as precise cross-camera synchronization; `sync_assessment.v1` is a boundary and degradation signal, not a sync solver.
